import { NextRequest, NextResponse } from "next/server"

function calculateEMA(values: number[], period: number) {
  if (values.length < period) return []

  const k = 2 / (period + 1)
  const emaArray: number[] = []

  let ema =
    values.slice(0, period).reduce((sum, v) => sum + v, 0) / period

  emaArray.push(ema)

  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
    emaArray.push(ema)
  }

  return emaArray
}

function calculateRSI(values: number[], period = 14) {
  if (values.length <= period) return null

  let gains = 0
  let losses = 0

  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    if (diff >= 0) gains += diff
    else losses += Math.abs(diff)
  }

  if (losses === 0) return 100

  const rs = gains / losses
  return 100 - 100 / (1 + rs)
}

function round(value: number | null, decimals = 2) {
  if (value === null || Number.isNaN(value)) return null
  return Number(value.toFixed(decimals))
}

async function analyzeTimeframe(
  symbol: string,
  interval: string,
  market: string
) {
  const baseUrl =
    market === "futures"
      ? "https://fapi.binance.com/fapi/v1/klines"
      : "https://api.binance.com/api/v3/klines"

  const url = `${baseUrl}?symbol=${symbol}&interval=${interval}&limit=120`
  const res = await fetch(url, { cache: "no-store" })
  const raw = await res.json()

  if (!Array.isArray(raw)) {
    throw new Error(`Ungültige Antwort für ${symbol} ${interval}`)
  }

  const closes = raw.map((c: any) => parseFloat(c[4]))
  const highs = raw.map((c: any) => parseFloat(c[2]))
  const lows = raw.map((c: any) => parseFloat(c[3]))

  const ema20Array = calculateEMA(closes, 20)
  const ema50Array = calculateEMA(closes, 50)

  const ema20 = ema20Array.length ? ema20Array[ema20Array.length - 1] : null
  const ema50 = ema50Array.length ? ema50Array[ema50Array.length - 1] : null
  const rsi = calculateRSI(closes, 14)
  const lastPrice = closes[closes.length - 1]
  const support = Math.min(...lows.slice(-20))
  const resistance = Math.max(...highs.slice(-20))

  let trend = "Neutral"
  if (ema20 && ema50) {
    if (lastPrice > ema20 && ema20 > ema50) trend = "Bullish"
    else if (lastPrice < ema20 && ema20 < ema50) trend = "Bearish"
  }

  let signal = "Kein klares Signal"
  let score = 0

  if (trend === "Bullish") score += 20
  if (trend === "Bearish") score += 20

  if (trend === "Bullish" && rsi !== null && rsi < 70) {
    signal = "Long Bias"
  } else if (trend === "Bearish" && rsi !== null && rsi > 30) {
    signal = "Short Bias"
  } else if (rsi !== null && rsi >= 70) {
    signal = "Überkauft"
  } else if (rsi !== null && rsi <= 30) {
    signal = "Überverkauft"
  }

  if (rsi !== null) {
    if (trend === "Bullish" && rsi >= 48 && rsi <= 67) score += 20
    if (trend === "Bearish" && rsi >= 33 && rsi <= 52) score += 20
    if (rsi > 75 || rsi < 25) score -= 8
  }

  const distanceToSupport = ((lastPrice - support) / lastPrice) * 100
  const distanceToResistance = ((resistance - lastPrice) / lastPrice) * 100

  if (trend === "Bullish" && distanceToSupport < 4) score += 10
  if (trend === "Bearish" && distanceToResistance < 4) score += 10

  if (score < 0) score = 0
  if (score > 100) score = 100

  return {
    interval,
    lastPrice: round(lastPrice),
    trend,
    signal,
    rsi: round(rsi),
    ema20: round(ema20),
    ema50: round(ema50),
    support: round(support),
    resistance: round(resistance),
    score,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const symbol = searchParams.get("symbol") || "BTCUSDT"
  const market = searchParams.get("market") || "spot"

  const intervals = ["15m", "1h", "4h", "1d"]

  const results = await Promise.all(
    intervals.map(async (interval) => {
      try {
        return await analyzeTimeframe(symbol, interval, market)
      } catch {
        return {
          interval,
          error: true,
        }
      }
    })
  )

  const valid = results.filter((r: any) => !r.error)

  const longCount = valid.filter((r: any) => r.signal === "Long Bias").length
  const shortCount = valid.filter((r: any) => r.signal === "Short Bias").length

  let mtfBias = "Neutral"
  let mtfAlignment = "Mixed"

  if (longCount >= 3) {
    mtfBias = "Bullish"
    mtfAlignment = "Strong Long Alignment"
  } else if (shortCount >= 3) {
    mtfBias = "Bearish"
    mtfAlignment = "Strong Short Alignment"
  } else if (longCount > shortCount) {
    mtfBias = "Bullish"
    mtfAlignment = "Partial Long Alignment"
  } else if (shortCount > longCount) {
    mtfBias = "Bearish"
    mtfAlignment = "Partial Short Alignment"
  }

  return NextResponse.json({
    symbol,
    market,
    mtfBias,
    mtfAlignment,
    count: valid.length,
    frames: results,
  })
}