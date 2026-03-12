import { NextResponse } from "next/server"

async function fetchBinance(symbol: string, interval: string) {
  const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=120`

  const res = await fetch(url, { cache: "no-store" })
  const data = await res.json()

  return data.map((c: any) => ({
    close: Number(c[4])
  }))
}

function ema(values: number[], period: number) {
  const k = 2 / (period + 1)

  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period
  const out: number[] = [ema]

  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
    out.push(ema)
  }

  return out
}

function calculateRSI(closes: number[], period = 14) {
  let gains = 0
  let losses = 0

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1]

    if (diff >= 0) gains += diff
    else losses -= diff
  }

  let rs = gains / losses
  let rsi = 100 - 100 / (1 + rs)

  return rsi
}

export async function GET() {
  try {

    const btc = await fetchBinance("BTCUSDT", "1h")
    const eth = await fetchBinance("ETHUSDT", "1h")

    const btcCloses = btc.map((c: any) => c.close)
    const ethCloses = eth.map((c: any) => c.close)

    const btcEMA50 = ema(btcCloses, 50).slice(-1)[0]
    const btcEMA200 = ema(btcCloses, 200).slice(-1)[0] || btcEMA50

    const ethEMA50 = ema(ethCloses, 50).slice(-1)[0]
    const ethEMA200 = ema(ethCloses, 200).slice(-1)[0] || ethEMA50

    const btcPrice = btcCloses.slice(-1)[0]
    const ethPrice = ethCloses.slice(-1)[0]

    const btcRSI = calculateRSI(btcCloses)
    const ethRSI = calculateRSI(ethCloses)

    let regimeScore = 0

    if (btcPrice > btcEMA50) regimeScore += 15
    if (btcPrice > btcEMA200) regimeScore += 15

    if (ethPrice > ethEMA50) regimeScore += 10
    if (ethPrice > ethEMA200) regimeScore += 10

    if (btcRSI > 55) regimeScore += 10
    if (ethRSI > 55) regimeScore += 10

    if (btcRSI < 45) regimeScore -= 10
    if (ethRSI < 45) regimeScore -= 10

    let regime = "Neutral"

    if (regimeScore >= 40) regime = "Risk On"
    if (regimeScore <= -20) regime = "Risk Off"

    let squeezeEnvironment = "Neutral"
    let longFlushEnvironment = "Neutral"

    if (btcRSI < 35) {
      longFlushEnvironment = "Possible Long Flush"
    }

    if (btcRSI > 65) {
      squeezeEnvironment = "Possible Short Squeeze"
    }

    let trendDay = false
    let chopDay = false

    const distance = Math.abs(btcPrice - btcEMA50) / btcEMA50

    if (distance > 0.02) {
      trendDay = true
    } else {
      chopDay = true
    }

    let marketState = "Sideways"

    if (btcPrice > btcEMA50 && btcEMA50 > btcEMA200) {
      marketState = "Uptrend"
    }

    if (btcPrice < btcEMA50 && btcEMA50 < btcEMA200) {
      marketState = "Downtrend"
    }

    const usMarketBias = regime === "Risk On" ? "Bullish" : regime === "Risk Off" ? "Bearish" : "Neutral"

    return NextResponse.json({

      regime,

      regimeScore,

      marketState,

      usMarketBias,

      sessionBias: regime,

      squeezeEnvironment,

      longFlushEnvironment,

      trendDay,

      chopDay,

      btc: {
        price: btcPrice,
        ema50: btcEMA50,
        ema200: btcEMA200,
        rsi: btcRSI
      },

      eth: {
        price: ethPrice,
        ema50: ethEMA50,
        ema200: ethEMA200,
        rsi: ethRSI
      }

    })

  } catch (error) {

    return NextResponse.json({
      error: "Regime calculation failed"
    })

  }
}