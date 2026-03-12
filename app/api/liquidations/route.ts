import { NextResponse } from "next/server"
import { NextRequest } from "next/server"

export async function GET(req: NextRequest) {

  const { searchParams } = new URL(req.url)

  const symbol = searchParams.get("symbol") || "BTCUSDT"

  try {

    const priceRes = await fetch(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
    )

    const priceData = await priceRes.json()

    const markPrice = Number(priceData.price)

    const leverages = [5, 10, 20, 50, 100]

    const estimatedBands = leverages.map((lev) => {

      const distance = 1 / lev

      const longLiq = markPrice * (1 - distance)
      const shortLiq = markPrice * (1 + distance)

      return {
        leverage: `${lev}x`,
        weight: lev,
        longLiq: Number(longLiq.toFixed(2)),
        shortLiq: Number(shortLiq.toFixed(2)),
        distanceLongPct: (distance * 100).toFixed(2),
        distanceShortPct: (distance * 100).toFixed(2),
      }

    })

    return NextResponse.json({
      symbol,
      markPrice,
      liquidityBias: "Neutral",
      estimatedBands,
      heatmap: {
        below: estimatedBands.map((b) => ({
          side: "Long",
          level: b.longLiq,
          distancePct: b.distanceLongPct,
          intensity: b.weight
        })),
        above: estimatedBands.map((b) => ({
          side: "Short",
          level: b.shortLiq,
          distancePct: b.distanceShortPct,
          intensity: b.weight
        }))
      },
      note: "Liquidation Levels basierend auf geschätzten Leverage-Bändern"
    })

  } catch (error) {

    return NextResponse.json({
      error: "Liquidation Daten Fehler"
    })

  }

}