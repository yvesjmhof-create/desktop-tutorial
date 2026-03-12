import { NextRequest, NextResponse } from "next/server"

const SPOT_COINS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT","DOTUSDT",
  "LTCUSDT","MATICUSDT","TRXUSDT","ATOMUSDT","UNIUSDT","BCHUSDT","ETCUSDT","XLMUSDT","FILUSDT","APTUSDT",
  "ARBUSDT","OPUSDT","NEARUSDT","INJUSDT","SUIUSDT","SEIUSDT","AAVEUSDT","RUNEUSDT","ALGOUSDT","VETUSDT",
  "HBARUSDT","ICPUSDT","MKRUSDT","GRTUSDT","FTMUSDT","THETAUSDT","EGLDUSDT","AXSUSDT","SANDUSDT","MANAUSDT",
  "FLOWUSDT","CHZUSDT","KAVAUSDT","ZILUSDT","KSMUSDT","SNXUSDT","COMPUSDT","CRVUSDT","1INCHUSDT","ENJUSDT",
  "ZRXUSDT","BATUSDT","DASHUSDT","QTUMUSDT","OMGUSDT","ICXUSDT","WAVESUSDT","CELOUSDT","STXUSDT","ROSEUSDT",
  "BLURUSDT","LDOUSDT","GMXUSDT","DYDXUSDT","PEPEUSDT","FETUSDT","RENDERUSDT","JUPUSDT","TIAUSDT","BONKUSDT",
  "WIFUSDT","PYTHUSDT","NOTUSDT","JASMYUSDT","ASTRUSDT","GALAUSDT","IMXUSDT","MAGICUSDT","MASKUSDT","ANKRUSDT",
  "SUSHIUSDT","YFIUSDT","BANDUSDT","RLCUSDT","OCEANUSDT","SKLUSDT","LRCUSDT","KNCUSDT","CTSIUSDT","API3USDT",
  "TRBUSDT","NMRUSDT","ARUSDT","RNDRUSDT","HOOKUSDT","IDUSDT","XAIUSDT","ALTUSDT","PORTALUSDT","DYMUSDT"
]

const FUTURES_COINS = [
  "BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT","DOTUSDT",
  "LTCUSDT","TRXUSDT","ATOMUSDT","UNIUSDT","BCHUSDT","ETCUSDT","XLMUSDT","FILUSDT","APTUSDT","ARBUSDT",
  "OPUSDT","NEARUSDT","INJUSDT","SUIUSDT","SEIUSDT","AAVEUSDT","RUNEUSDT","ALGOUSDT","VETUSDT","HBARUSDT",
  "ICPUSDT","MKRUSDT","GRTUSDT","FTMUSDT","THETAUSDT","EGLDUSDT","AXSUSDT","SANDUSDT","MANAUSDT","PEPEUSDT",
  "WIFUSDT","FETUSDT","RENDERUSDT","JUPUSDT","TIAUSDT","ENAUSDT","ORDIUSDT","1000BONKUSDT","NOTUSDT","DYDXUSDT",
  "FLOWUSDT","CHZUSDT","KAVAUSDT","ZILUSDT","KSMUSDT","SNXUSDT","COMPUSDT","CRVUSDT","1INCHUSDT","ENJUSDT",
  "ZRXUSDT","DASHUSDT","QTUMUSDT","ICXUSDT","WAVESUSDT","CELOUSDT","STXUSDT","ROSEUSDT","BLURUSDT","LDOUSDT",
  "GMXUSDT","JASMYUSDT","ASTRUSDT","GALAUSDT","IMXUSDT","MAGICUSDT","MASKUSDT","ANKRUSDT","SUSHIUSDT","YFIUSDT",
  "BANDUSDT","RLCUSDT","OCEANUSDT","SKLUSDT","LRCUSDT","KNCUSDT","CTSIUSDT","API3USDT","TRBUSDT","NMRUSDT",
  "ARUSDT","HOOKUSDT","IDUSDT","XAIUSDT","ALTUSDT","PORTALUSDT","DYMUSDT","IOSTUSDT","ZENUSDT","ZECUSDT"
]

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
    mode === "scalp" ? 0.003 : mode === "daytrading" ? 0.005 : 0.008

  const entryBuffer =
    mode === "scalp" ? 0.002 : mode === "daytrading" ? 0.003 : 0.005

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

async function loadRegime(origin: string) {
  try {
    const res = await fetch(`${origin}/api/regime`, {
      cache: "no-store",
    })

    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.error("Regime load error:", err)
    return null
  }
}

async function loadOiDelta(origin: string, symbol: string) {
  try {
    const res = await fetch(`${origin}/api/oi-delta?symbol=${symbol}`, {
      cache: "no-store",
    })

    if (!res.ok) return null
    return await res.json()
  } catch (err) {
    console.error(`OI delta load error for ${symbol}:`, err)
    return null
  }
}

async function analyzeCoin(
  symbol: string,
  interval: string,
  mode: string,
  market: string,
  origin: string,
  usMarketBias: string,
  regimeData: any
) {
  const baseUrl =
    market === "futures"
      ? "https://fapi.binance.com/fapi/v1/klines"
      : "https://api.binance.com/api/v3/klines"

  const url = `${baseUrl}?symbol=${symbol}&interval=${interval}&limit=120`
  const res = await fetch(url, { cache: "no-store" })
  const raw = await res.json()

  if (!Array.isArray(raw)) {
    throw new Error(`Ungültige Antwort für ${symbol}`)
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

  const setup = buildSetup({
    trend,
    signal,
    lastPrice,
    support,
    resistance,
    mode,
  })

  if (setup.direction !== "Neutral") score += 10
  if (setup.rr && setup.rr >= 2) score += 10
  if (setup.rr && setup.rr >= 2.5) score += 5

  let fundingBias = "Neutral"
  let oiTrend = "Neutral"
  let liquidityBias = "Neutral"
  let mtfBias = "Neutral"
  let mtfAlignment = "Mixed"

  if (market === "futures") {
    try {
      const futuresRes = await fetch(
        `${origin}/api/futures?symbol=${symbol}`,
        { cache: "no-store" }
      )
      const futuresData = await futuresRes.json()

      fundingBias = futuresData.fundingBias || "Neutral"
      oiTrend = futuresData.oiTrend || "Neutral"
    } catch {
      fundingBias = "Neutral"
      oiTrend = "Neutral"
    }

    try {
      const liqRes = await fetch(
        `${origin}/api/liquidations?symbol=${symbol}`,
        { cache: "no-store" }
      )
      const liqData = await liqRes.json()
      liquidityBias = liqData.liquidityBias || "Neutral"
    } catch {
      liquidityBias = "Neutral"
    }
  }

  try {
    const mtfRes = await fetch(
      `${origin}/api/mtf?symbol=${symbol}&market=${market}`,
      { cache: "no-store" }
    )
    const mtfData = await mtfRes.json()
    mtfBias = mtfData.mtfBias || "Neutral"
    mtfAlignment = mtfData.mtfAlignment || "Mixed"
  } catch {
    mtfBias = "Neutral"
    mtfAlignment = "Mixed"
  }

  const oiDeltaData = market === "futures" ? await loadOiDelta(origin, symbol) : null

  let macroAlignment = "Neutral"
  let scoreBoost = 0

  if (usMarketBias === "Bullish" && setup.direction === "Long") {
    macroAlignment = "Aligned"
    scoreBoost = 8
  } else if (usMarketBias === "Bearish" && setup.direction === "Short") {
    macroAlignment = "Aligned"
    scoreBoost = 8
  } else if (usMarketBias === "Bullish" && setup.direction === "Short") {
    macroAlignment = "Against Macro"
    scoreBoost = -8
  } else if (usMarketBias === "Bearish" && setup.direction === "Long") {
    macroAlignment = "Against Macro"
    scoreBoost = -8
  }

  let futuresAlignment = "Neutral"
  let futuresBoost = 0

  if (setup.direction === "Long" && fundingBias === "Long Bias") {
    futuresAlignment = "Aligned"
    futuresBoost += 6
  } else if (setup.direction === "Short" && fundingBias === "Short Bias") {
    futuresAlignment = "Aligned"
    futuresBoost += 6
  } else if (setup.direction === "Long" && fundingBias === "Short Bias") {
    futuresAlignment = "Against Futures"
    futuresBoost -= 6
  } else if (setup.direction === "Short" && fundingBias === "Long Bias") {
    futuresAlignment = "Against Futures"
    futuresBoost -= 6
  }

  if (setup.direction === "Long" && oiTrend === "Rising") {
    futuresBoost += 4
  }
  if (setup.direction === "Short" && oiTrend === "Rising") {
    futuresBoost += 4
  }

  let liquidityBoost = 0

  if (setup.direction === "Long" && liquidityBias === "Short Liquidity closer") {
    liquidityBoost += 4
  }
  if (setup.direction === "Short" && liquidityBias === "Long Liquidity closer") {
    liquidityBoost += 4
  }

  let whaleMove = "Neutral"
  let whaleBoost = 0

  if (
    score >= 80 &&
    rsi !== null &&
    rsi >= 52 &&
    rsi <= 68 &&
    setup.direction === "Long"
  ) {
    whaleMove = "Bullish Whale Pressure"
    whaleBoost += 4
  } else if (
    score >= 80 &&
    rsi !== null &&
    rsi >= 32 &&
    rsi <= 48 &&
    setup.direction === "Short"
  ) {
    whaleMove = "Bearish Whale Pressure"
    whaleBoost += 4
  }

  let liquidationTrap = "Neutral"
  let trapBoost = 0

  if (
    setup.direction === "Long" &&
    liquidityBias === "Short Liquidity closer" &&
    fundingBias === "Short Bias"
  ) {
    liquidationTrap = "Possible Short Squeeze"
    trapBoost += 6
  } else if (
    setup.direction === "Short" &&
    liquidityBias === "Long Liquidity closer" &&
    fundingBias === "Long Bias"
  ) {
    liquidationTrap = "Possible Long Flush"
    trapBoost += 6
  }

  let mtfBoost = 0
  let mtfStatus = "Mixed"

  if (setup.direction === "Long" && mtfBias === "Bullish") {
    mtfBoost += 10
    mtfStatus = mtfAlignment
  } else if (setup.direction === "Short" && mtfBias === "Bearish") {
    mtfBoost += 10
    mtfStatus = mtfAlignment
  } else if (
    (setup.direction === "Long" && mtfBias === "Bearish") ||
    (setup.direction === "Short" && mtfBias === "Bullish")
  ) {
    mtfBoost -= 10
    mtfStatus = "Against MTF"
  }

  const regime = regimeData?.regime || "Neutral"
  const squeezeEnv = regimeData?.squeezeEnvironment || "Neutral"
  const flushEnv = regimeData?.longFlushEnvironment || "Neutral"
  const trendDay = regimeData?.trendDay || false
  const chopDay = regimeData?.chopDay || false
  const marketState = regimeData?.marketState || "Neutral"

  let regimeBoost = 0
  let regimeAlignment = "Neutral"

  if (regime === "Risk On" && setup.direction === "Long") {
    regimeBoost += 6
    regimeAlignment = "Aligned"
  } else if (regime === "Risk Off" && setup.direction === "Short") {
    regimeBoost += 6
    regimeAlignment = "Aligned"
  } else if (regime === "Risk On" && setup.direction === "Short") {
    regimeBoost -= 6
    regimeAlignment = "Against Regime"
  } else if (regime === "Risk Off" && setup.direction === "Long") {
    regimeBoost -= 6
    regimeAlignment = "Against Regime"
  }

  if (squeezeEnv === "Possible Short Squeeze" || squeezeEnv === "Short Squeeze Environment") {
    if (setup.direction === "Long") regimeBoost += 8
  }

  if (flushEnv === "Possible Long Flush" || flushEnv === "Long Flush Environment") {
    if (setup.direction === "Short") regimeBoost += 8
  }

  if (trendDay && trend === "Bullish" && setup.direction === "Long") {
    regimeBoost += 5
  }

  if (trendDay && trend === "Bearish" && setup.direction === "Short") {
    regimeBoost += 5
  }

  if (chopDay) {
    regimeBoost -= 6
  }

  let oiStructure = oiDeltaData?.structure || "Neutral"
  let oiBias = oiDeltaData?.bias || "Neutral"
  let oiQuality = oiDeltaData?.quality || "Medium"
  let oiFundingMomentum = oiDeltaData?.fundingMomentum || "Neutral"
  let oiDeltaPct = oiDeltaData?.oiDeltaPct ?? null
  let priceDeltaPct = oiDeltaData?.priceDeltaPct ?? null

  let oiBoost = 0

  if (setup.direction === "Long" && oiStructure === "Trend Confirmed") {
    oiBoost += 8
  }

  if (setup.direction === "Long" && oiStructure === "Short Squeeze Build") {
    oiBoost += 9
  }

  if (setup.direction === "Short" && oiStructure === "Long Build / Short Pressure") {
    oiBoost += 8
  }

  if (setup.direction === "Short" && oiStructure === "Long Flush") {
    oiBoost += 9
  }

  if (oiQuality === "High") {
    oiBoost += 3
  }

  if (
    setup.direction === "Long" &&
    oiFundingMomentum === "Falling" &&
    oiStructure === "Short Squeeze Build"
  ) {
    oiBoost += 3
  }

  if (
    setup.direction === "Short" &&
    oiFundingMomentum === "Rising" &&
    oiStructure === "Long Flush"
  ) {
    oiBoost += 3
  }

  const finalScore = Math.max(
    0,
    Math.min(
      100,
      score +
        scoreBoost +
        futuresBoost +
        liquidityBoost +
        whaleBoost +
        trapBoost +
        mtfBoost +
        regimeBoost +
        oiBoost
    )
  )

  let alertLevel = "Ignore"

  if (
    finalScore >= 92 &&
    macroAlignment === "Aligned" &&
    regimeAlignment !== "Against Regime" &&
    (futuresAlignment === "Aligned" || futuresAlignment === "Neutral") &&
    (
      mtfAlignment === "Strong Long Alignment" ||
      mtfAlignment === "Strong Short Alignment"
    )
  ) {
    alertLevel = "A+"
  } else if (
    finalScore >= 85 &&
    macroAlignment === "Aligned" &&
    regimeAlignment !== "Against Regime" &&
    (futuresAlignment === "Aligned" || futuresAlignment === "Neutral")
  ) {
    alertLevel = "A"
  } else if (finalScore >= 70) {
    alertLevel = "B"
  } else if (finalScore >= 55) {
    alertLevel = "Watchlist"
  }

  return {
    symbol,
    market,
    interval,
    mode,
    lastPrice: round(lastPrice),
    trend,
    signal,
    rsi: round(rsi),
    ema20: round(ema20),
    ema50: round(ema50),
    support: round(support),
    resistance: round(resistance),
    fundingBias,
    oiTrend,
    liquidityBias,
    mtfBias,
    mtfAlignment,
    macroAlignment,
    futuresAlignment,
    mtfStatus,
    regime,
    regimeAlignment,
    marketState,
    score: finalScore,
    alertLevel,
    whaleMove,
    liquidationTrap,
    oiStructure,
    oiBias,
    oiQuality,
    oiFundingMomentum,
    oiDeltaPct,
    priceDeltaPct,
    ...setup,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const origin = new URL(req.url).origin

  const mode = searchParams.get("mode") || "swing"
  const market = searchParams.get("market") || "spot"
  const limit = Number(searchParams.get("limit") || "20")

  const interval =
    mode === "scalp"
      ? "15m"
      : mode === "daytrading"
        ? "1h"
        : "4h"

  const allCoins = market === "futures" ? FUTURES_COINS : SPOT_COINS
  const coins = allCoins.slice(0, limit)

  let usMarketBias = "Neutral"

  try {
    const indicesRes = await fetch(`${origin}/api/indices`, {
      cache: "no-store",
    })
    const indicesData = await indicesRes.json()
    usMarketBias = indicesData.usMarketBias || "Neutral"
  } catch {
    usMarketBias = "Neutral"
  }

  const regimeData = await loadRegime(origin)

  const results = await Promise.all(
    coins.map(async (symbol) => {
      try {
        return await analyzeCoin(
          symbol,
          interval,
          mode,
          market,
          origin,
          usMarketBias,
          regimeData
        )
      } catch {
        return null
      }
    })
  )

  const filtered = results
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)

  const topLongs = filtered
    .filter((c: any) => c.direction === "Long")
    .slice(0, 10)

  const topShorts = filtered
    .filter((c: any) => c.direction === "Short")
    .slice(0, 10)

  const bestOverall = filtered[0] || null
  const bestLong = filtered.find((c: any) => c.direction === "Long") || null
  const bestShort = filtered.find((c: any) => c.direction === "Short") || null

  const highQualitySetups = filtered.filter(
    (c: any) => c.alertLevel === "A+" || c.alertLevel === "A"
  )

  return NextResponse.json({
    mode,
    market,
    interval,
    requestedLimit: limit,
    totalAvailable: allCoins.length,
    usMarketBias,
    regime: regimeData,
    count: filtered.length,
    topLongs,
    topShorts,
    bestOverall,
    bestLong,
    bestShort,
    highQualitySetups,
    coins: filtered,
  })
}