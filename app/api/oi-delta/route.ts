import { NextRequest, NextResponse } from "next/server"

function round(value: number | null, decimals = 4) {
  if (value === null || Number.isNaN(value)) return null
  return Number(value.toFixed(decimals))
}

function getFundingMomentum(current: number, previous: number | null) {
  if (previous === null || Number.isNaN(previous)) return "Neutral"

  const delta = current - previous

  if (delta > 0.00005) return "Rising"
  if (delta < -0.00005) return "Falling"
  return "Flat"
}

function getOiMomentum(current: number, previous: number | null) {
  if (previous === null || previous <= 0) return "Neutral"

  const deltaPct = ((current - previous) / previous) * 100

  if (deltaPct > 1) return "Rising"
  if (deltaPct < -1) return "Falling"
  return "Flat"
}

function interpretFlow({
  priceDeltaPct,
  oiDeltaPct,
  fundingMomentum,
  currentFunding,
}: {
  priceDeltaPct: number
  oiDeltaPct: number
  fundingMomentum: string
  currentFunding: number
}) {
  let structure = "Neutral"
  let bias = "Neutral"
  let quality = "Medium"
  let note = "Keine klare Orderflow-Struktur"

  if (priceDeltaPct > 0 && oiDeltaPct > 0) {
    structure = "Trend Confirmed"
    bias = "Bullish Continuation"
    quality = "High"
    note = "Preis und OI steigen gemeinsam. Der Move wird bestätigt."
  } else if (priceDeltaPct < 0 && oiDeltaPct > 0) {
    structure = "Long Build / Short Pressure"
    bias = "Bearish Pressure"
    quality = "High"
    note = "Preis fällt bei steigendem OI. Neue Positionen kommen in den Markt."
  } else if (priceDeltaPct > 0 && oiDeltaPct < 0) {
    structure = "Short Squeeze Build"
    bias = "Bullish Squeeze"
    quality = "High"
    note = "Preis steigt bei fallendem OI. Shorts werden aus dem Markt gedrückt."
  } else if (priceDeltaPct < 0 && oiDeltaPct < 0) {
    structure = "Long Flush"
    bias = "Bearish Flush"
    quality = "High"
    note = "Preis fällt bei sinkendem OI. Longs werden geschlossen oder liquidiert."
  }

  if (
    structure === "Trend Confirmed" &&
    fundingMomentum === "Rising" &&
    currentFunding > 0
  ) {
    note = "Bullisher Trend wird von OI und Funding gestützt."
  }

  if (
    structure === "Short Squeeze Build" &&
    fundingMomentum === "Falling" &&
    currentFunding < 0
  ) {
    note =
      "Negatives Funding plus fallendes OI bei steigendem Preis deutet auf Short Squeeze."
  }

  if (
    structure === "Long Flush" &&
    fundingMomentum === "Rising" &&
    currentFunding > 0
  ) {
    note =
      "Positives Funding plus fallendes OI bei fallendem Preis deutet auf Long Flush."
  }

  return {
    structure,
    bias,
    quality,
    note,
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get("symbol") || "BTCUSDT"

  try {
    const [premiumRes, oiRes, oiHistRes, fundingHistRes, klineRes] =
      await Promise.all([
        fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, {
          cache: "no-store",
        }),
        fetch(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`, {
          cache: "no-store",
        }),
        fetch(
          `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=2`,
          {
            cache: "no-store",
          }
        ),
        fetch(
          `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=2`,
          {
            cache: "no-store",
          }
        ),
        fetch(
          `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=5m&limit=2`,
          {
            cache: "no-store",
          }
        ),
      ])

    if (
      !premiumRes.ok ||
      !oiRes.ok ||
      !oiHistRes.ok ||
      !fundingHistRes.ok ||
      !klineRes.ok
    ) {
      return NextResponse.json(
        { error: "OI Delta Daten konnten nicht geladen werden" },
        { status: 500 }
      )
    }

    const premiumData = await premiumRes.json()
    const oiData = await oiRes.json()
    const oiHistData = await oiHistRes.json()
    const fundingHistData = await fundingHistRes.json()
    const klineData = await klineRes.json()

    const markPrice = Number(premiumData.markPrice)
    const indexPrice = Number(premiumData.indexPrice)
    const currentFunding = Number(premiumData.lastFundingRate)
    const currentOi = Number(oiData.openInterest)

    const previousOi =
      Array.isArray(oiHistData) && oiHistData.length > 1
        ? Number(oiHistData[0].sumOpenInterest)
        : null

    const previousFunding =
      Array.isArray(fundingHistData) && fundingHistData.length > 1
        ? Number(fundingHistData[0].fundingRate)
        : null

    const currentClose =
      Array.isArray(klineData) && klineData.length > 1
        ? Number(klineData[1][4])
        : markPrice

    const previousClose =
      Array.isArray(klineData) && klineData.length > 1
        ? Number(klineData[0][4])
        : currentClose

    const oiDeltaPct =
      previousOi && previousOi > 0
        ? ((currentOi - previousOi) / previousOi) * 100
        : 0

    const priceDeltaPct =
      previousClose && previousClose !== 0
        ? ((currentClose - previousClose) / previousClose) * 100
        : 0

    const fundingMomentum = getFundingMomentum(currentFunding, previousFunding)
    const oiMomentum = getOiMomentum(currentOi, previousOi)

    const interpretation = interpretFlow({
      priceDeltaPct,
      oiDeltaPct,
      fundingMomentum,
      currentFunding,
    })

    return NextResponse.json({
      symbol,
      markPrice: round(markPrice, 2),
      indexPrice: round(indexPrice, 2),
      currentOpenInterest: round(currentOi, 2),
      previousOpenInterest: round(previousOi, 2),
      oiDeltaPct: round(oiDeltaPct, 2),
      oiMomentum,
      currentFundingRate: round(currentFunding, 6),
      previousFundingRate: round(previousFunding, 6),
      fundingMomentum,
      currentClose: round(currentClose, 2),
      previousClose: round(previousClose, 2),
      priceDeltaPct: round(priceDeltaPct, 2),
      ...interpretation,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error("oi-delta route error:", error)

    return NextResponse.json(
      { error: "OI Delta konnte nicht geladen werden" },
      { status: 500 }
    )
  }
}