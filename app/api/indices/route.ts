import { NextRequest, NextResponse } from "next/server"

const INDEX_SYMBOLS = [
  {
    key: "SPY",
    symbol: "SPY",
    label: "S&P 500 Proxy",
    exchange: "NYSE",
    type: "ETF",
  },
  {
    key: "QQQ",
    symbol: "QQQ",
    label: "Nasdaq-100 Proxy",
    exchange: "NASDAQ",
    type: "ETF",
  },
]

function round(value: number | null, decimals = 2) {
  if (value === null || Number.isNaN(value)) return null
  return Number(value.toFixed(decimals))
}

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

function buildSetup({
  trend,
  signal,
  lastPrice,
  support,
  resistance,
}: {
  trend: string
  signal: string
  lastPrice: number
  support: number
  resistance: number
}) {
  let direction = "Neutral"
  let entryLow = lastPrice
  let entryHigh = lastPrice
  let stopLoss = lastPrice
  let tp1 = lastPrice
  let tp2 = lastPrice
  let rr = 0

  if (trend === "Bullish" && signal === "Long Bias") {
    direction = "Long"
    entryLow = Math.max(support, lastPrice * 0.995)
    entryHigh = lastPrice
    stopLoss = support * 0.992

    const risk = entryHigh - stopLoss
    tp1 = entryHigh + risk * 1.5
    tp2 = entryHigh + risk * 2.5
    rr = risk > 0 ? (tp2 - entryHigh) / risk : 0
  } else if (trend === "Bearish" && signal === "Short Bias") {
    direction = "Short"
    entryLow = lastPrice
    entryHigh = Math.min(resistance, lastPrice * 1.005)
    stopLoss = resistance * 1.008

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

async function fetchIndex(
  symbolConfig: {
    key: string
    symbol: string
    label: string
    exchange: string
    type: string
  },
  interval: string
) {
  const apiKey = process.env.TWELVE_DATA_API_KEY

  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY fehlt")
  }

  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=${encodeURIComponent(symbolConfig.symbol)}` +
    `&interval=${encodeURIComponent(interval)}` +
    `&outputsize=120` +
    `&exchange=${encodeURIComponent(symbolConfig.exchange)}` +
    `&type=${encodeURIComponent(symbolConfig.type)}` +
    `&apikey=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json()
  data.usMarketBias || "Neutral"
  if (!data.values || !Array.isArray(data.values)) {
    throw new Error(`Keine Daten für ${symbolConfig.symbol}`)
  }

  const values = [...data.values].reverse()

  const candles = values.map((c: any) => ({
    time: Math.floor(new Date(c.datetime).getTime() / 1000),
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
  }))

  const closes = candles.map((c) => c.close)
  const highs = candles.map((c) => c.high)
  const lows = candles.map((c) => c.low)

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
  let score = 50

  if (trend === "Bullish") score += 20
  if (trend === "Bearish") score += 20

  if (rsi !== null) {
    if (trend === "Bullish" && rsi > 45 && rsi < 68) score += 20
    if (trend === "Bearish" && rsi > 32 && rsi < 55) score += 20
    if (rsi >= 70 || rsi <= 30) score -= 10
  }

  const finalSignal =
    trend === "Bullish" && rsi !== null && rsi < 70
      ? "Long Bias"
      : trend === "Bearish" && rsi !== null && rsi > 30
        ? "Short Bias"
        : signal

  const setup = buildSetup({
    trend,
    signal: finalSignal,
    lastPrice,
    support,
    resistance,
  })

  return {
    symbol: symbolConfig.symbol,
    label: symbolConfig.label,
    market: "indices",
    interval,
    lastPrice: round(lastPrice),
    trend,
    signal: finalSignal,
    rsi: round(rsi),
    ema20: round(ema20),
    ema50: round(ema50),
    support: round(support),
    resistance: round(resistance),
    score,
    data: candles,
    setup,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const interval = searchParams.get("interval") || "1h"

  const results = await Promise.all(
    INDEX_SYMBOLS.map(async (item) => {
      try {
        return await fetchIndex(item, interval)
      } catch (error) {
        return {
          symbol: item.symbol,
          label: item.label,
          market: "indices",
          interval,
          error: error instanceof Error ? error.message : "Unbekannter Fehler",
        }
      }
    })
  )

  const valid = results.filter((r: any) => !("error" in r))

const spy = valid.find((r: any) => r.symbol === "SPY") as any
const qqq = valid.find((r: any) => r.symbol === "QQQ") as any

let usMarketBias = "Neutral"

if (
  spy &&
  qqq &&
  spy.trend === "Bullish" &&
  qqq.trend === "Bullish" &&
  spy.signal === "Long Bias" &&
  qqq.signal === "Long Bias"
) {
  usMarketBias = "Bullish"
} else if (
  spy &&
  qqq &&
  spy.trend === "Bearish" &&
  qqq.trend === "Bearish" &&
  spy.signal === "Short Bias" &&
  qqq.signal === "Short Bias"
) {
  usMarketBias = "Bearish"
}

return NextResponse.json({
  market: "indices",
  interval,
  count: results.length,
  usMarketBias,
  coins: results,
})
}