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

function getModeFromInterval(interval: string) {
  if (interval === "5m" || interval === "15m") return "scalp"
  if (interval === "1h") return "daytrading"
  if (interval === "4h") return "swing"
  if (interval === "1d") return "position"
  if (interval === "1w") return "macro"
  return "swing"
}

function buildSetup({
  trend,
  signal,
  lastPrice,
  support,
  resistance,
  mode,
}: {
  trend: string
  signal: string
  lastPrice: number
  support: number
  resistance: number
  mode: string
}) {
  const riskBuffer =
    mode === "scalp"
      ? 0.003
      : mode === "daytrading"
        ? 0.005
        : mode === "position"
          ? 0.01
          : mode === "macro"
            ? 0.015
            : 0.008

  const entryBuffer =
    mode === "scalp"
      ? 0.002
      : mode === "daytrading"
        ? 0.003
        : mode === "position"
          ? 0.006
          : mode === "macro"
            ? 0.01
            : 0.005

  let direction = "Neutral"
  let entryLow = lastPrice
  let entryHigh = lastPrice
  let stopLoss = lastPrice
  let tp1 = lastPrice
  let tp2 = lastPrice
  let rr = 0

  if (trend === "Bullish" && signal === "Long Bias") {
    direction = "Long"
    entryLow = Math.max(support, lastPrice * (1 - entryBuffer))
    entryHigh = lastPrice
    stopLoss = support * (1 - riskBuffer)

    const risk = entryHigh - stopLoss
    tp1 = entryHigh + risk * 1.5
    tp2 = entryHigh + risk * 2.5
    rr = risk > 0 ? (tp2 - entryHigh) / risk : 0
  } else if (trend === "Bearish" && signal === "Short Bias") {
    direction = "Short"
    entryLow = lastPrice
    entryHigh = Math.min(resistance, lastPrice * (1 + entryBuffer))
    stopLoss = resistance * (1 + riskBuffer)

    const risk = stopLoss - entryLow
    tp1 = entryLow - risk * 1.5
    tp2 = entryLow - risk * 2.5
    rr = risk > 0 ? (entryLow - tp2) / risk : 0
  }

  return {
    direction,
    entryLow: round(entryLow),
    entryHigh: round(entryHigh),
    stopLoss: round(stopLoss),
    tp1: round(tp1),
    tp2: round(tp2),
    rr: round(rr, 2),
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const symbol = searchParams.get("symbol") || "BTCUSDT"
  const interval = searchParams.get("interval") || "4h"
  const market = searchParams.get("market") || "spot"

  const mode = getModeFromInterval(interval)

  try {
    const klineBaseUrl =
  market === "futures"
    ? "https://fapi.binance.com/fapi/v1/klines"
    : "https://api.binance.com/api/v3/klines"

const klineUrl = `${klineBaseUrl}?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=250`

console.log("KLINE URL:", klineUrl)

const res = await fetch(klineUrl, {
  cache: "no-store",
  headers: {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0",
  },
})

const rawText = await res.text()

console.log("KLINE STATUS:", res.status)
console.log("KLINE RESPONSE:", rawText)

if (!res.ok) {
  return NextResponse.json(
    {
      error: `Kline API Fehler: ${res.status}`,
      url: klineUrl,
      response: rawText,
    },
    { status: res.status }
  )
}

const raw = JSON.parse(rawText)
    if (!Array.isArray(raw)) {
      return NextResponse.json(
        { error: "Ungültige API Antwort" },
        { status: 500 }
      )
    }

    const data = raw.map((c: any) => ({
  time: Math.floor(Number(c[0]) / 1000),
  open: parseFloat(c[1]),
  high: parseFloat(c[2]),
  low: parseFloat(c[3]),
  close: parseFloat(c[4]),
}))

    const closes = data.map((c: any) => c.close)
    const highs = data.map((c: any) => c.high)
    const lows = data.map((c: any) => c.low)

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

    if (trend === "Bullish" && rsi !== null && rsi < 70) {
      signal = "Long Bias"
    } else if (trend === "Bearish" && rsi !== null && rsi > 30) {
      signal = "Short Bias"
    } else if (rsi !== null && rsi >= 70) {
      signal = "Überkauft"
    } else if (rsi !== null && rsi <= 30) {
      signal = "Überverkauft"
    }

    const setup = buildSetup({
      trend,
      signal,
      lastPrice,
      support,
      resistance,
      mode,
    })

    return NextResponse.json({
  symbol,
  market,
  interval,
  mode,
  lastPrice: round(lastPrice),
  trend,
  signal,
  indicators: {
    ema20: round(ema20),
    ema50: round(ema50),
    rsi: round(rsi),
    support: round(support),
    resistance: round(resistance),
  },
  setup,
  data,
  updatedAt: new Date().toISOString(),
})
  } catch (error) {
    console.error("analyze route error:", error)

    return NextResponse.json(
      { error: "Analyse konnte nicht geladen werden" },
      { status: 500 }
    )
  }
}