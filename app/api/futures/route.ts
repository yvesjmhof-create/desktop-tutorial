import { NextResponse } from "next/server"

function round(value: number | null, decimals = 4) {
  if (value === null || Number.isNaN(value)) return null
  return Number(value.toFixed(decimals))
}

function getFundingBias(fundingRate: number) {
  if (fundingRate >= 0.0003) return "Short Bias"
  if (fundingRate <= -0.0003) return "Long Bias"
  return "Neutral"
}

function getOiTrend(currentOi: number, previousOi: number | null) {
  if (!previousOi || previousOi <= 0) return "Neutral"

  const changePct = ((currentOi - previousOi) / previousOi) * 100

  if (changePct > 1) return "Rising"
  if (changePct < -1) return "Falling"
  return "Flat"
}

function buildEstimatedLiquidationLevels(markPrice: number) {
  const leverages = [10, 25, 50, 100]

  return leverages.map((lev) => {
    const longLiq = markPrice * (1 - 1 / lev)
    const shortLiq = markPrice * (1 + 1 / lev)

    return {
      leverage: `${lev}x`,
      longLiq: round(longLiq, 2),
      shortLiq: round(shortLiq, 2),
    }
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get("symbol") || "BTCUSDT"

  try {
    const premiumRes = await fetch(
      `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
      { cache: "no-store" }
    )
    const premiumData = await premiumRes.json()

    const oiRes = await fetch(
      `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
      { cache: "no-store" }
    )
    const oiData = await oiRes.json()

    const oiHistRes = await fetch(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=2`,
      { cache: "no-store" }
    )
    const oiHistData = await oiHistRes.json()

    const fundingHistRes = await fetch(
      `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=2`,
      { cache: "no-store" }
    )
    const fundingHistData = await fundingHistRes.json()

    const markPrice = Number(premiumData.markPrice)
    const indexPrice = Number(premiumData.indexPrice)
    const fundingRate = Number(premiumData.lastFundingRate)
    const openInterest = Number(oiData.openInterest)

    const previousOi =
      Array.isArray(oiHistData) && oiHistData.length > 1
        ? Number(oiHistData[0].sumOpenInterest)
        : null

    const previousFunding =
      Array.isArray(fundingHistData) && fundingHistData.length > 1
        ? Number(fundingHistData[0].fundingRate)
        : null

    const fundingBias = getFundingBias(fundingRate)
    const oiTrend = getOiTrend(openInterest, previousOi)

    const estimatedLiquidations = buildEstimatedLiquidationLevels(markPrice)

    const priceVsIndex =
  markPrice > indexPrice ? "Above Index" :
  markPrice < indexPrice ? "Below Index" :
  "At Index"

let futuresInsight = "Neutral"
let crowdBias = "Neutral"
let squeezeRisk = "Low"

if (fundingBias === "Short Bias" && oiTrend === "Rising") {
  futuresInsight = "Bearish trend appears confirmed by rising short pressure"
  crowdBias = "Short Heavy"
  squeezeRisk = "Short Squeeze possible if price reverses sharply"
} else if (fundingBias === "Long Bias" && oiTrend === "Rising") {
  futuresInsight = "Bullish trend appears confirmed by rising long pressure"
  crowdBias = "Long Heavy"
  squeezeRisk = "Long Squeeze possible if price breaks down"
} else if (fundingBias === "Short Bias" && oiTrend === "Falling") {
  futuresInsight = "Short bias exists, but conviction looks weaker"
  crowdBias = "Moderate Short Bias"
  squeezeRisk = "Medium"
} else if (fundingBias === "Long Bias" && oiTrend === "Falling") {
  futuresInsight = "Long bias exists, but conviction looks weaker"
  crowdBias = "Moderate Long Bias"
  squeezeRisk = "Medium"
} else if (fundingBias === "Neutral" && oiTrend === "Rising") {
  futuresInsight = "Open interest rises without strong funding edge"
  crowdBias = "Balanced but active"
  squeezeRisk = "Medium"
}

return NextResponse.json({
  symbol,
  markPrice: round(markPrice, 2),
  indexPrice: round(indexPrice, 2),
  priceVsIndex,
  fundingRate: round(fundingRate, 6),
  previousFundingRate: round(previousFunding, 6),
  fundingBias,
  openInterest: round(openInterest, 2),
  previousOpenInterest: round(previousOi, 2),
  oiTrend,
  futuresInsight,
  crowdBias,
  squeezeRisk,
  estimatedLiquidations,
  note: "Estimated liquidation levels only, not real liquidation heatmap",
})
  } catch (error) {
    console.error("futures route error:", error)

    return NextResponse.json(
      { error: "Futures Daten konnten nicht geladen werden" },
      { status: 500 }
    )
  }
}