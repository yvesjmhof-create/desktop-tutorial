"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  createChart,
  CandlestickSeries,
  LineSeries,
} from "lightweight-charts"

function getScoreColor(score: number) {
  if (score >= 90) return "#22c55e"
  if (score >= 80) return "#84cc16"
  if (score >= 70) return "#eab308"
  if (score >= 55) return "#f97316"
  return "#ef4444"
}

function getAlertColor(alertLevel: string) {
  if (alertLevel === "A+") return "#22c55e"
  if (alertLevel === "A") return "#84cc16"
  if (alertLevel === "B") return "#eab308"
  if (alertLevel === "Watchlist") return "#f97316"
  return "#6b7280"
}

function getIntervalSeconds(value: string) {
  if (value === "5m") return 5 * 60
  if (value === "15m") return 15 * 60
  if (value === "1h") return 60 * 60
  if (value === "4h") return 4 * 60 * 60
  if (value === "1d") return 24 * 60 * 60
  if (value === "1w") return 7 * 24 * 60 * 60
  return 60 * 60
}
function getOiDeltaSignal(data: any) {
  if (!data) return "Neutral"

  const oiDelta = Number(data.oiDelta ?? 0)
  const priceChange = Number(data.priceChange ?? 0)

  if (oiDelta > 0 && priceChange > 0) return "Long Buildup"
  if (oiDelta > 0 && priceChange < 0) return "Short Buildup"
  if (oiDelta < 0 && priceChange > 0) return "Short Squeeze"
  if (oiDelta < 0 && priceChange < 0) return "Long Liquidation"

  return "Neutral"
}
function getOiDeltaColor(signal: string) {
  if (signal === "Long Buildup") return "#22c55e"
  if (signal === "Short Buildup") return "#ef4444"
  if (signal === "Short Squeeze") return "#3b82f6"
  if (signal === "Long Liquidation") return "#f97316"
  return "#6b7280"
}
type MarketRegime =
  | "Bullish Expansion"
  | "Bearish Expansion"
  | "Range"
  | "Volatile"
  | "Neutral"

type WhaleSignal = {
  active: boolean
  strength: "low" | "medium" | "high"
  message: string
}

type SmartAlert = {
  id: string
  type: "info" | "warning" | "bullish" | "bearish"
  title: string
  message: string
  createdAt: number
}

type LiquiditySweep = {
  detected: boolean
  direction: "bullish" | "bearish" | "none"
  message: string
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function getWhaleStrength(ratio: number): "low" | "medium" | "high" {
  if (ratio >= 4) return "high"
  if (ratio >= 2.5) return "medium"
  return "low"
}

function getRegimeColor(regime: MarketRegime) {
  if (regime === "Bullish Expansion") return "#22c55e"
  if (regime === "Bearish Expansion") return "#ef4444"
  if (regime === "Range") return "#eab308"
  if (regime === "Volatile") return "#f97316"
  return "#6b7280"
}

function buildEnhancedScore(params: {
  baseScore: number
  oiChangePct: number
  volumeRatio: number
  priceChangePct: number
  hasWhale: boolean
}) {
  const { baseScore, oiChangePct, volumeRatio, priceChangePct, hasWhale } = params

  let bonus = 0

  if (oiChangePct > 3) bonus += 6
  if (oiChangePct > 6) bonus += 4

  if (volumeRatio > 1.5) bonus += 5
  if (volumeRatio > 2.5) bonus += 5

  if (priceChangePct > 1) bonus += 4
  if (priceChangePct < -1) bonus -= 4

  if (hasWhale) bonus += 8

  return clamp(Math.round(baseScore + bonus), 0, 100)
}

function calculateEMA(values: number[], period: number) {
  if (values.length < period) return []

  const k = 2 / (period + 1)
  const emaArray: number[] = []

  let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period

  emaArray.push(ema)

  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k)
    emaArray.push(ema)
  }

  return emaArray
}

function normalizeCandleTime(timeValue: any) {
  const raw = Number(timeValue)
  if (!Number.isFinite(raw)) return 0
  return raw > 9999999999 ? Math.floor(raw / 1000) : Math.floor(raw)
}

function normalizeAnalysisResult(data: any, market: string) {
  if (!data) return data

  const normalizedData = Array.isArray(data.data)
    ? data.data
        .map((c: any) => ({
          ...c,
          time: normalizeCandleTime(c.time),
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
          volume: Number(c.volume ?? 0),
        }))
        .filter((c: any) => c.time > 0)
    : []

  return {
    ...data,
    market: data.market ?? market,
    data: normalizedData,
    lastPrice: Number(data.lastPrice ?? normalizedData[normalizedData.length - 1]?.close ?? 0),
  }
}

export default function HomePage() {
  const [symbol, setSymbol] = useState("BTCUSDT")
  const [interval, setInterval] = useState("4h")
  const [marketType, setMarketType] = useState("spot")
  const [mode, setMode] = useState("swing")
  const [scanLimit, setScanLimit] = useState("20")

  const [alerts, setAlerts] = useState<SmartAlert[]>([])
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const lastAlertRef = useRef<string>("")

  const [accountSize, setAccountSize] = useState("1000")
  const [riskPercent, setRiskPercent] = useState("1")

  const [result, setResult] = useState<any>(null)
  const [scanner, setScanner] = useState<any[]>([])
  const [topLongs, setTopLongs] = useState<any[]>([])
  const [topShorts, setTopShorts] = useState<any[]>([])

  const [bestOverall, setBestOverall] = useState<any>(null)
  const [bestLong, setBestLong] = useState<any>(null)
  const [bestShort, setBestShort] = useState<any>(null)
  const [highQualitySetups, setHighQualitySetups] = useState<any[]>([])

  const [futuresData, setFuturesData] = useState<any>(null)
  const [futuresIntel, setFuturesIntel] = useState<any>(null)
  const [liquidationData, setLiquidationData] = useState<any>(null)
  const [mtfData, setMtfData] = useState<any>(null)
  const [oiDeltaData, setOiDeltaData] = useState<any>(null)
  const oiDeltaSignal = getOiDeltaSignal(oiDeltaData)
  const [indexScanner, setIndexScanner] = useState<any[]>([])
  const [usMarketBias, setUsMarketBias] = useState("Neutral")
  const [regimeData, setRegimeData] = useState<any>(null)

  const [alertFilter, setAlertFilter] = useState("all")
  const [loadingScan, setLoadingScan] = useState(false)
  const [loadingIndices, setLoadingIndices] = useState(false)

  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(30)
  const [refreshCountdown, setRefreshCountdown] = useState(0)

  const [lastUpdated, setLastUpdated] = useState("")
  const [nowTime, setNowTime] = useState("")
  const [countdown, setCountdown] = useState("")

  const [livePrice, setLivePrice] = useState<number | null>(null)
  const [livePriceChange, setLivePriceChange] = useState<number | null>(null)
  const [liveStatus, setLiveStatus] = useState("Disconnected")

  const [alertHistory, setAlertHistory] = useState<any[]>([])
  const previousScannerRef = useRef<any[]>([])

  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartInstanceRef = useRef<any>(null)
  const candleSeriesRef = useRef<any>(null)
  const ema20SeriesRef = useRef<any>(null)
  const ema50SeriesRef = useRef<any>(null)
  const visibleRangeRef = useRef<any>(null)
  const chartInitializedRef = useRef(false)
const [regime, setRegime] = useState<MarketRegime>("Neutral")
  const setupLinesRef = useRef<any[]>([])
  const liquidationLinesRef = useRef<any[]>([])
  const liveLineRef = useRef<any>(null)
  const shouldAutoFitOnNextDataRef = useRef(true)

  const [assetTab, setAssetTab] = useState("Alle")
  const assetTabs = [
    "Alle",
    "Aktien",
    "Geldmittel",
    "Futures",
    "Forex",
    "Krypto",
    "Indizes",
    "Anleihen",
    "Ökonomie",
    "Optionen",
  ]

  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return

    const permission = await Notification.requestPermission()
    setNotificationsEnabled(permission === "granted")
  }

  const analyzeMarket = useCallback(
  async (
    customSymbol?: string,
    customInterval?: string,
    customMarket?: string
  ) => {
    try {
      const symbolToUse = customSymbol || symbol
      const intervalToUse = customInterval || interval
      const marketToUse = customMarket || marketType

      const res = await fetch(
        `/api/analyze?symbol=${encodeURIComponent(symbolToUse)}&interval=${encodeURIComponent(intervalToUse)}&market=${encodeURIComponent(marketToUse)}`,
        { cache: "no-store" }
      )

      if (!res.ok) {
        const errorText = await res.text()
        console.error("API /api/analyze Fehler:", res.status, errorText)
        alert(`Analyse Fehler: ${res.status} - ${errorText}`)
        return
      }

      const data = await res.json()
      console.log("ANALYZE RESPONSE:", data)

      setSymbol(symbolToUse)
      setInterval(intervalToUse)
      setMarketType(marketToUse)

      setResult({
        ...data,
        symbol: data?.symbol ?? symbolToUse,
        interval: data?.interval ?? intervalToUse,
        market: data?.market ?? marketToUse,
        data: Array.isArray(data?.data) ? data.data : [],
        lastPrice: Number(data?.lastPrice ?? 0),
      })

      setLivePrice(
        Number(data?.lastPrice ?? data?.data?.[data?.data?.length - 1]?.close ?? 0)
      )

      setLastUpdated(new Date().toLocaleString())
      visibleRangeRef.current = null
      shouldAutoFitOnNextDataRef.current = true

      const futuresRes = await fetch(`/api/futures?symbol=${encodeURIComponent(symbolToUse)}`, {
        cache: "no-store",
      })
      if (futuresRes.ok) {
        const futuresJson = await futuresRes.json()
        setFuturesData(futuresJson)
      }

      const futuresIntelRes = await fetch(
        `/api/futures-intel?symbol=${encodeURIComponent(symbolToUse)}`,
        { cache: "no-store" }
      )
      if (futuresIntelRes.ok) {
        const futuresIntelJson = await futuresIntelRes.json()
        setFuturesIntel(futuresIntelJson)
      }

      const liquidationRes = await fetch(
        `/api/liquidations?symbol=${encodeURIComponent(symbolToUse)}`,
        { cache: "no-store" }
      )
      if (liquidationRes.ok) {
        const liquidationJson = await liquidationRes.json()
        setLiquidationData(liquidationJson)
      }

      const mtfRes = await fetch(
        `/api/mtf?symbol=${encodeURIComponent(symbolToUse)}&market=${encodeURIComponent(marketToUse)}`,
        { cache: "no-store" }
      )
      if (mtfRes.ok) {
        const mtfJson = await mtfRes.json()
        setMtfData(mtfJson)
      }

      const oiDeltaRes = await fetch(
        `/api/oi-delta?symbol=${encodeURIComponent(symbolToUse)}`,
        { cache: "no-store" }
      )
      if (oiDeltaRes.ok) {
        const oiDeltaJson = await oiDeltaRes.json()
        setOiDeltaData(oiDeltaJson)
      }
    } catch (error) {
      console.error("analyzeMarket Fehler:", error)
      const [analyzeError, setAnalyzeError] = useState("")
      setAnalyzeError("Analyse online ist im Moment nicht verfügbar.")
    }
  },
  [symbol, interval, marketType]
)
useEffect(() => {
  function calculateRegime() {
    if (!result) return

    const funding = Number(result.fundingRate)
    const oi = Number(result.openInterest)

    if (funding > 0.01 && oi > 0) {
      setRegime("Bullish Expansion")
      return
    }

    if (funding < -0.01 && oi > 0) {
      setRegime("Bearish Expansion")
      return
    }

    if (Math.abs(funding) < 0.005) {
      setRegime("Range")
      return
    }

    setRegime("Volatile")
  }

  calculateRegime()
}, [result])
  async function scanMarket() {
    try {
      setLoadingScan(true)

      if (autoRefresh) {
        setRefreshCountdown(refreshInterval)
      }

      const res = await fetch(
        `/api/scan?mode=${mode}&market=${marketType}&limit=${scanLimit}`,
        {
          cache: "no-store",
        }
      )

      if (!res.ok) {
        throw new Error(`Scan Fehler: ${res.status}`)
      }

      const data = await res.json()

      setScanner(data.coins || [])
      setTopLongs(data.topLongs || [])
      setTopShorts(data.topShorts || [])
      setBestOverall(data.bestOverall || null)
      setBestLong(data.bestLong || null)
      setBestShort(data.bestShort || null)
      setHighQualitySetups(data.highQualitySetups || [])
      setUsMarketBias(data.usMarketBias || "Neutral")
      setRegimeData(data.regime || null)
    } catch (error) {
      console.error("scanMarket Fehler:", error)
      alert("Scanner het en Fehler gmacht. Lueg i d Browser-Konsole.")
    } finally {
      setLoadingScan(false)
    }
  }

  async function scanIndices() {
    try {
      setLoadingIndices(true)

      const [indicesRes, regimeRes] = await Promise.all([
        fetch("/api/indices?interval=1h", {
          cache: "no-store",
        }),
        fetch("/api/regime", {
          cache: "no-store",
        }),
      ])

      if (!indicesRes.ok) {
        throw new Error(`Index Scan Fehler: ${indicesRes.status}`)
      }

      const indicesData = await indicesRes.json()
      setIndexScanner(indicesData.coins || [])
      setUsMarketBias(indicesData.usMarketBias || "Neutral")

      if (regimeRes.ok) {
        const regimeJson = await regimeRes.json()
        setRegimeData(regimeJson)
      }
    } catch (error) {
      console.error("scanIndices Fehler:", error)
      alert("US Markt Scanner het en Fehler gmacht.")
    } finally {
      setLoadingIndices(false)
    }
  }

  useEffect(() => {
  if (!chartContainerRef.current) return
  if (chartInitializedRef.current) return

  chartInitializedRef.current = true

  const chart = createChart(chartContainerRef.current, {
    width: chartContainerRef.current.clientWidth,
    height: 520,
    layout: {
      background: { color: "#000000" },
      textColor: "#DDDDDD",
    },
    grid: {
      vertLines: { color: "#202020" },
      horzLines: { color: "#202020" },
    },
    rightPriceScale: {
      borderColor: "#333333",
    },
    timeScale: {
      borderColor: "#333333",
      timeVisible: true,
      secondsVisible: false,
    },
  })

  const candleSeries = chart.addSeries(CandlestickSeries)
  const ema20Series = chart.addSeries(LineSeries, {
    color: "#f59e0b",
    lineWidth: 2,
  })
  const ema50Series = chart.addSeries(LineSeries, {
    color: "#60a5fa",
    lineWidth: 2,
  })

  chartInstanceRef.current = chart
  candleSeriesRef.current = candleSeries
  ema20SeriesRef.current = ema20Series
  ema50SeriesRef.current = ema50Series

  const timeScale = chart.timeScale()

  const saveRange = () => {
    visibleRangeRef.current = timeScale.getVisibleLogicalRange()
  }

  timeScale.subscribeVisibleLogicalRangeChange(saveRange)

  const handleResize = () => {
    if (!chartContainerRef.current || !chartInstanceRef.current) return
    chartInstanceRef.current.applyOptions({
      width: chartContainerRef.current.clientWidth,
    })
  }

  window.addEventListener("resize", handleResize)

  return () => {
    window.removeEventListener("resize", handleResize)
    timeScale.unsubscribeVisibleLogicalRangeChange(saveRange)
    chart.remove()
    chartInstanceRef.current = null
    candleSeriesRef.current = null
    ema20SeriesRef.current = null
    ema50SeriesRef.current = null
    setupLinesRef.current = []
    liquidationLinesRef.current = []
    liveLineRef.current = null
    visibleRangeRef.current = null
    chartInitializedRef.current = false
  }
}, [])
useEffect(() => {
  if (!chartInstanceRef.current) return
  if (!candleSeriesRef.current) return
  if (!ema20SeriesRef.current) return
  if (!ema50SeriesRef.current) return
  if (!result?.data || !Array.isArray(result.data) || result.data.length === 0) return

  const previousRange = visibleRangeRef.current

  const candles = result.data.map((c: any) => ({
    time: Number(c.time),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  }))

  candleSeriesRef.current.setData(candles)

  const closes = result.data.map((c: any) => Number(c.close))
  const ema20 = calculateEMA(closes, 20)
  const ema50 = calculateEMA(closes, 50)

  if (ema20.length > 0) {
    ema20SeriesRef.current.setData(
      result.data.slice(19).map((c: any, i: number) => ({
        time: Number(c.time),
        value: Number(ema20[i]),
      }))
    )
  } else {
    ema20SeriesRef.current.setData([])
  }

  if (ema50.length > 0) {
    ema50SeriesRef.current.setData(
      result.data.slice(49).map((c: any, i: number) => ({
        time: Number(c.time),
        value: Number(ema50[i]),
      }))
    )
  } else {
    ema50SeriesRef.current.setData([])
  }

  requestAnimationFrame(() => {
    const timeScale = chartInstanceRef.current?.timeScale()
    if (!timeScale) return

    if (previousRange) {
      timeScale.setVisibleLogicalRange(previousRange)
    } else if (shouldAutoFitOnNextDataRef.current) {
      timeScale.fitContent()
      shouldAutoFitOnNextDataRef.current = false
    }
  })
}, [result])
  useEffect(() => {
    if (!candleSeriesRef.current || !ema20SeriesRef.current || !ema50SeriesRef.current) return
    if (!result?.data || !Array.isArray(result.data)) return

    const candles = result.data || []
    if (!candles.length) return

    const previousRange = visibleRangeRef.current

    candleSeriesRef.current.setData(
      candles.map((c: any) => ({
        time: normalizeCandleTime(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }))
    )

    const closes = candles.map((c: any) => Number(c.close))
    const ema20 = calculateEMA(closes, 20)
    const ema50 = calculateEMA(closes, 50)

    if (ema20.length > 0) {
      ema20SeriesRef.current.setData(
        candles.slice(19).map((c: any, i: number) => ({
          time: normalizeCandleTime(c.time),
          value: ema20[i],
        }))
      )
    } else {
      ema20SeriesRef.current.setData([])
    }

    if (ema50.length > 0) {
      ema50SeriesRef.current.setData(
        candles.slice(49).map((c: any, i: number) => ({
          time: normalizeCandleTime(c.time),
          value: ema50[i],
        }))
      )
    } else {
      ema50SeriesRef.current.setData([])
    }

    requestAnimationFrame(() => {
      const timeScale = chartInstanceRef.current?.timeScale()
      if (!timeScale) return

      if (previousRange) {
        timeScale.setVisibleLogicalRange(previousRange)
      } else if (shouldAutoFitOnNextDataRef.current) {
        timeScale.fitContent()
        shouldAutoFitOnNextDataRef.current = false
      }
    })
  }, [result])

  useEffect(() => {
    if (!candleSeriesRef.current) return

    setupLinesRef.current.forEach((line) => {
      candleSeriesRef.current.removePriceLine(line)
    })
    setupLinesRef.current = []

    if (!result?.setup || result.setup.direction === "Neutral") return

    const entryLowLine = candleSeriesRef.current.createPriceLine({
      price: Number(result.setup.entryLow),
      color: "#eab308",
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "Entry Low",
    })

    const entryHighLine = candleSeriesRef.current.createPriceLine({
      price: Number(result.setup.entryHigh),
      color: "#eab308",
      lineWidth: 2,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "Entry High",
    })

    const stopLine = candleSeriesRef.current.createPriceLine({
      price: Number(result.setup.stopLoss),
      color: "#ef4444",
      lineWidth: 2,
      axisLabelVisible: true,
      title: "Stop",
    })

    const tp1Line = candleSeriesRef.current.createPriceLine({
      price: Number(result.setup.tp1),
      color: "#22c55e",
      lineWidth: 2,
      axisLabelVisible: true,
      title: "TP1",
    })

    const tp2Line = candleSeriesRef.current.createPriceLine({
      price: Number(result.setup.tp2),
      color: "#16a34a",
      lineWidth: 2,
      axisLabelVisible: true,
      title: "TP2",
    })

    setupLinesRef.current = [
      entryLowLine,
      entryHighLine,
      stopLine,
      tp1Line,
      tp2Line,
    ]
  }, [result?.setup])

  useEffect(() => {
    if (!candleSeriesRef.current) return

    liquidationLinesRef.current.forEach((line) => {
      candleSeriesRef.current.removePriceLine(line)
    })
    liquidationLinesRef.current = []

    if (!liquidationData?.heatmap) return

    const below = liquidationData.heatmap?.below || []
    const above = liquidationData.heatmap?.above || []

    const newLines: any[] = []

    below.slice(0, 3).forEach((level: any) => {
      const line = candleSeriesRef.current.createPriceLine({
        price: Number(level.level),
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: `Long Liq ${level.intensity}`,
      })
      newLines.push(line)
    })

    above.slice(0, 3).forEach((level: any) => {
      const line = candleSeriesRef.current.createPriceLine({
        price: Number(level.level),
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 1,
        axisLabelVisible: true,
        title: `Short Liq ${level.intensity}`,
      })
      newLines.push(line)
    })

    if (liquidationData?.liquidityBias) {
      const biasPrice = Number(livePrice ?? result?.lastPrice)

      if (!Number.isNaN(biasPrice) && biasPrice > 0) {
        const biasLine = candleSeriesRef.current.createPriceLine({
          price: biasPrice,
          color: "#9333ea",
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `Liquidity Bias: ${liquidationData.liquidityBias}`,
        })
        newLines.push(biasLine)
      }
    }

    liquidationLinesRef.current = newLines
  }, [liquidationData, result?.lastPrice, livePrice])

  useEffect(() => {
    if (!candleSeriesRef.current) return

    if (liveLineRef.current) {
      candleSeriesRef.current.removePriceLine(liveLineRef.current)
      liveLineRef.current = null
    }

    const price = Number(livePrice ?? result?.lastPrice)

    if (!price || Number.isNaN(price)) return

    liveLineRef.current = candleSeriesRef.current.createPriceLine({
      price,
      color: "#ffffff",
      lineWidth: 1,
      axisLabelVisible: true,
      title: "Live",
    })
  }, [livePrice, result?.lastPrice])
useEffect(() => {
  if (!chartInstanceRef.current) return
  if (!candleSeriesRef.current) return
  if (!ema20SeriesRef.current) return
  if (!ema50SeriesRef.current) return
  if (!result?.data || !Array.isArray(result.data) || result.data.length === 0) return

  const previousRange = visibleRangeRef.current

  const candles = result.data.map((c: any) => ({
    time: Number(c.time),
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  }))

  candleSeriesRef.current.setData(candles)

  const closes = result.data.map((c: any) => Number(c.close))
  const ema20 = calculateEMA(closes, 20)
  const ema50 = calculateEMA(closes, 50)

  if (ema20.length > 0) {
    ema20SeriesRef.current.setData(
      result.data.slice(19).map((c: any, i: number) => ({
        time: Number(c.time),
        value: Number(ema20[i]),
      }))
    )
  } else {
    ema20SeriesRef.current.setData([])
  }

  if (ema50.length > 0) {
    ema50SeriesRef.current.setData(
      result.data.slice(49).map((c: any, i: number) => ({
        time: Number(c.time),
        value: Number(ema50[i]),
      }))
    )
  } else {
    ema50SeriesRef.current.setData([])
  }

  requestAnimationFrame(() => {
    const timeScale = chartInstanceRef.current?.timeScale()
    if (!timeScale) return

    if (previousRange) {
      timeScale.setVisibleLogicalRange(previousRange)
    } else if (shouldAutoFitOnNextDataRef.current) {
      timeScale.fitContent()
      shouldAutoFitOnNextDataRef.current = false
    }
  })
}, [result])
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = new Date()
      setNowTime(now.toLocaleTimeString())

      const seconds = getIntervalSeconds(interval)
      const nowSeconds = Math.floor(now.getTime() / 1000)
      const remaining = seconds - (nowSeconds % seconds)

      const minutes = Math.floor(remaining / 60)
      const secs = remaining % 60

      setCountdown(`${minutes}m ${secs}s`)
    }, 1000)

    return () => window.clearInterval(timer)
  }, [interval])

  useEffect(() => {
    if (!result?.symbol || !result?.interval) return

    const wsSymbol = String(result.symbol).toLowerCase()
    const wsInterval = result.interval
    const streamName = `${wsSymbol}@kline_${wsInterval}`

    const wsUrl =
      marketType === "futures"
        ? `wss://fstream.binance.com/ws/${streamName}`
        : `wss://stream.binance.com:9443/ws/${streamName}`

    let socket: WebSocket | null = null

    try {
      socket = new WebSocket(wsUrl)
      setLiveStatus("Connecting...")

      socket.onopen = () => {
        setLiveStatus("Live")
      }

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const kline = msg.k

          if (!kline) return

          const nextClose = Number(kline.c)
          const nextOpen = Number(kline.o)

          setLivePrice(nextClose)

          if (!Number.isNaN(nextClose) && !Number.isNaN(nextOpen) && nextOpen !== 0) {
            const changePct = ((nextClose - nextOpen) / nextOpen) * 100
            setLivePriceChange(Number(changePct.toFixed(2)))
          }

          setResult((prev: any) => {
            if (!prev?.data || !Array.isArray(prev.data)) return prev

            const candleTime = normalizeCandleTime(kline.t)

            const updatedCandle = {
              time: candleTime,
              open: Number(kline.o),
              high: Number(kline.h),
              low: Number(kline.l),
              close: Number(kline.c),
              volume: Number(kline.v),
            }

            const nextData = [...prev.data]
            const lastIndex = nextData.length - 1
            const lastCandle = nextData[lastIndex]
            const lastTime = lastCandle ? normalizeCandleTime(lastCandle.time) : 0

            if (lastCandle && lastTime === candleTime) {
              nextData[lastIndex] = updatedCandle
            } else if (!lastCandle || candleTime > lastTime) {
              nextData.push(updatedCandle)

              if (nextData.length > 250) {
                nextData.shift()
              }
            }

            return {
              ...prev,
              lastPrice: Number(kline.c),
              data: nextData,
            }
          })
        } catch (err) {
          console.error("WebSocket parse error:", err)
        }
      }

      socket.onerror = () => {
        setLiveStatus("Error")
      }

      socket.onclose = () => {
        setLiveStatus("Disconnected")
      }
    } catch (err) {
      console.error("WebSocket init error:", err)
      setLiveStatus("Error")
    }

    return () => {
      if (socket) {
        socket.close()
      }
    }
  }, [result?.symbol, result?.interval, marketType])

  useEffect(() => {
    if (!autoRefresh) return

    let counter = refreshInterval
    setRefreshCountdown(counter)

    const timer = window.setInterval(() => {
      counter -= 1
      setRefreshCountdown(counter)

      if (counter <= 0) {
        scanMarket()
        counter = refreshInterval
        setRefreshCountdown(counter)
      }
    }, 1000)

    return () => {
      window.clearInterval(timer)
    }
  }, [autoRefresh, refreshInterval, marketType, mode, scanLimit])

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch("/api/regime", {
          cache: "no-store",
        })

        if (!res.ok) return

        const data = await res.json()

console.log("ANALYSE RESULT:", data)
console.log("CANDLES:", data?.data?.length)

setResult(data)
        setRegimeData(data)
      } catch (error) {
        console.error("Regime refresh error:", error)
      }
    }, 15000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!result?.symbol) return

    const timer = window.setInterval(async () => {
      try {
        const symbolToUse = result.symbol

        const futuresRes = await fetch(`/api/futures?symbol=${symbolToUse}`, {
          cache: "no-store",
        })
        if (futuresRes.ok) {
          const futuresJson = await futuresRes.json()
          setFuturesData(futuresJson)
        }

        const futuresIntelRes = await fetch(
          `/api/futures-intel?symbol=${symbolToUse}`,
          {
            cache: "no-store",
          }
        )
        if (futuresIntelRes.ok) {
          const futuresIntelJson = await futuresIntelRes.json()
          setFuturesIntel(futuresIntelJson)
        }

        const liquidationRes = await fetch(
          `/api/liquidations?symbol=${symbolToUse}`,
          {
            cache: "no-store",
          }
        )
        if (liquidationRes.ok) {
          const liquidationJson = await liquidationRes.json()
          setLiquidationData(liquidationJson)
        }

        const oiDeltaRes = await fetch(
          `/api/oi-delta?symbol=${encodeURIComponent(symbolToUse)}`,
          {
            cache: "no-store",
          }
        )
        if (oiDeltaRes.ok) {
          const oiDeltaJson = await oiDeltaRes.json()
          setOiDeltaData(oiDeltaJson)
        }
      } catch (error) {
        console.error("Live futures pulse refresh error:", error)
      }
    }, 10000)

    return () => window.clearInterval(timer)
  }, [result?.symbol])

  useEffect(() => {
    if (!scanner.length) return

    const previous = previousScannerRef.current
    const nextAlerts: any[] = []

    for (const coin of scanner) {
      const oldCoin = previous.find((p: any) => p.symbol === coin.symbol)

      if (!oldCoin) {
        if (coin.alertLevel === "A+" || coin.alertLevel === "A") {
          nextAlerts.push({
            type: "New Setup",
            symbol: coin.symbol,
            text: `${coin.symbol} startet mit ${coin.alertLevel}`,
            time: new Date().toLocaleTimeString(),
          })
        }
        continue
      }

      if (oldCoin.alertLevel !== coin.alertLevel) {
        if (coin.alertLevel === "A+" || coin.alertLevel === "A") {
          nextAlerts.push({
            type: "Alert Upgrade",
            symbol: coin.symbol,
            text: `${coin.symbol} wechselte von ${oldCoin.alertLevel} zu ${coin.alertLevel}`,
            time: new Date().toLocaleTimeString(),
          })
        }
      }

      if (
        oldCoin.liquidationTrap !== coin.liquidationTrap &&
        coin.liquidationTrap !== "Neutral"
      ) {
        nextAlerts.push({
          type: "Trap Signal",
          symbol: coin.symbol,
          text: `${coin.symbol}: ${coin.liquidationTrap}`,
          time: new Date().toLocaleTimeString(),
        })
      }

      if (
        oldCoin.whaleMove !== coin.whaleMove &&
        coin.whaleMove !== "Neutral"
      ) {
        nextAlerts.push({
          type: "Whale Move",
          symbol: coin.symbol,
          text: `${coin.symbol}: ${coin.whaleMove}`,
          time: new Date().toLocaleTimeString(),
        })
      }

      if (
        typeof oldCoin.score === "number" &&
        typeof coin.score === "number" &&
        coin.score - oldCoin.score >= 8
      ) {
        nextAlerts.push({
          type: "Momentum Jump",
          symbol: coin.symbol,
          text: `${coin.symbol} Score sprang von ${oldCoin.score} auf ${coin.score}`,
          time: new Date().toLocaleTimeString(),
        })
      }
    }

    if (nextAlerts.length > 0) {
      setAlertHistory((prev: any[]) => [...nextAlerts, ...prev].slice(0, 30))
    }

    previousScannerRef.current = scanner
  }, [scanner])

  const displayedScanner = useMemo(() => {
    if (alertFilter === "a-plus") {
      return scanner.filter((coin: any) => coin.alertLevel === "A+")
    }

    if (alertFilter === "a-and-better") {
      return scanner.filter(
        (coin: any) => coin.alertLevel === "A+" || coin.alertLevel === "A"
      )
    }

    if (alertFilter === "watchlist") {
      return scanner.filter(
        (coin: any) =>
          coin.alertLevel === "A+" ||
          coin.alertLevel === "A" ||
          coin.alertLevel === "B" ||
          coin.alertLevel === "Watchlist"
      )
    }

    return scanner
  }, [alertFilter, scanner])

  const filteredByAssetTab = useMemo(() => {
    if (assetTab === "Alle") return displayedScanner

    if (assetTab === "Krypto") {
      return displayedScanner.filter(
        (coin: any) =>
          coin.symbol?.includes("USDT") ||
          coin.symbol?.includes("BTC") ||
          coin.symbol?.includes("ETH")
      )
    }

    if (assetTab === "Futures") {
      return displayedScanner.filter((coin: any) => coin.market === "futures")
    }

    if (assetTab === "Indizes") {
      return []
    }

    return []
  }, [assetTab, displayedScanner])

  const aPlusSignals = useMemo(
    () => scanner.filter((coin: any) => coin.alertLevel === "A+").slice(0, 5),
    [scanner]
  )

  const aSignals = useMemo(
    () => scanner.filter((coin: any) => coin.alertLevel === "A").slice(0, 5),
    [scanner]
  )

  const shortSqueezeSignals = useMemo(
    () =>
      scanner
        .filter((coin: any) => coin.liquidationTrap === "Possible Short Squeeze")
        .slice(0, 5),
    [scanner]
  )

  const longFlushSignals = useMemo(
    () =>
      scanner
        .filter((coin: any) => coin.liquidationTrap === "Possible Long Flush")
        .slice(0, 5),
    [scanner]
  )

  const candles = Array.isArray(result?.data) ? result.data : []
  const latestCandle = candles.length > 0 ? candles[candles.length - 1] : null
  const previousCandle = candles.length > 1 ? candles[candles.length - 2] : null

  const liveClose = Number(latestCandle?.close ?? result?.lastPrice ?? livePrice ?? 0)

const previousClose = Number(
  previousCandle?.close ??
    (Array.isArray(result?.data) && result.data.length > 1
      ? result.data[result.data.length - 2]?.close
      : liveClose)
)

const priceChangePct =
  previousClose > 0 && liveClose > 0
    ? ((liveClose - previousClose) / previousClose) * 100
    : 0

  const currentVolume = Number(latestCandle?.volume ?? result?.volume24h ?? 0)

  const avgVolume =
    candles.length > 0
      ? candles
          .slice(-20)
          .reduce((sum: number, c: any) => sum + Number(c?.volume ?? 0), 0) /
        Math.min(candles.slice(-20).length, 20)
      : Number(result?.avgVolume ?? result?.volume24h ?? 1)

  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1
  const oiChangePct = Number(oiDeltaData?.oiDeltaPct ?? result?.oiChange ?? 0)

  const whaleSignal: WhaleSignal = useMemo(() => {
    const isWhale =
      volumeRatio >= 2.5 ||
      Math.abs(oiChangePct) >= 6 ||
      Math.abs(priceChangePct) >= 1.8

    if (!isWhale) {
      return {
        active: false,
        strength: "low",
        message: "No unusual activity detected",
      }
    }

    const ratioBase = Math.max(
      volumeRatio,
      Math.abs(oiChangePct) / 2,
      Math.abs(priceChangePct) * 1.5
    )

    const strength = getWhaleStrength(ratioBase)

    let direction = "mixed"
    if (priceChangePct > 0.3 && oiChangePct > 0) direction = "bullish"
    if (priceChangePct < -0.3 && oiChangePct > 0) direction = "bearish"

    return {
      active: true,
      strength,
      message: `Whale activity detected (${direction})`,
    }
  }, [volumeRatio, oiChangePct, priceChangePct])

  const marketRegime: MarketRegime = useMemo(() => {
    if (volumeRatio >= 2.2 && Math.abs(priceChangePct) >= 1.5) return "Volatile"
    if (oiChangePct > 3 && priceChangePct > 0.4) return "Bullish Expansion"
    if (oiChangePct > 3 && priceChangePct < -0.4) return "Bearish Expansion"
    if (Math.abs(priceChangePct) < 0.35 && Math.abs(oiChangePct) < 2.5) return "Range"
    return "Neutral"
  }, [volumeRatio, oiChangePct, priceChangePct])

  const baseScore = Number(result?.score ?? 50)

  const enhancedScore = useMemo(() => {
    return buildEnhancedScore({
      baseScore,
      oiChangePct,
      volumeRatio,
      priceChangePct,
      hasWhale: whaleSignal.active,
    })
  }, [baseScore, oiChangePct, volumeRatio, priceChangePct, whaleSignal.active])

  const bias =
    priceChangePct > 0.3 && oiChangePct > 0
      ? "Long"
      : priceChangePct < -0.3 && oiChangePct > 0
      ? "Short"
      : "Neutral"

  const confidence =
    enhancedScore >= 90 ? "Very High" : enhancedScore >= 80 ? "High" : enhancedScore >= 65 ? "Medium" : "Low"

  const liquiditySweep: LiquiditySweep = useMemo(() => {
    if (!latestCandle || !previousCandle) {
      return {
        detected: false,
        direction: "none",
        message: "No sweep detected",
      }
    }

    const bearishSweep =
      Number(latestCandle.high) > Number(previousCandle.high) &&
      Number(latestCandle.close) < Number(previousCandle.high)

    if (bearishSweep) {
      return {
        detected: true,
        direction: "bearish",
        message: "Bearish liquidity sweep detected above previous high",
      }
    }

    const bullishSweep =
      Number(latestCandle.low) < Number(previousCandle.low) &&
      Number(latestCandle.close) > Number(previousCandle.low)

    if (bullishSweep) {
      return {
        detected: true,
        direction: "bullish",
        message: "Bullish liquidity sweep detected below previous low",
      }
    }

    return {
      detected: false,
      direction: "none",
      message: "No sweep detected",
    }
  }, [latestCandle, previousCandle])

useEffect(() => {
  analyzeMarket("BTCUSDT", interval, marketType)
}, [])
  useEffect(() => {
    const nextAlerts: SmartAlert[] = []

    if (!result) {
      setAlerts([])
      lastAlertRef.current = ""
      return
    }

    if (enhancedScore >= 90) {
      nextAlerts.push({
        id: "strong-long",
        type: "bullish",
        title: "Strong Setup",
        message: `Score is ${enhancedScore}. Market looks strong on the upside.`,
        createdAt: Date.now(),
      })
    }

    if (enhancedScore <= 45) {
      nextAlerts.push({
        id: "risk-off",
        type: "bearish",
        title: "Risk Warning",
        message: `Score is ${enhancedScore}. Market structure looks weak.`,
        createdAt: Date.now(),
      })
    }

    if (whaleSignal.active) {
      nextAlerts.push({
        id: "whale",
        type: "warning",
        title: "Whale Activity",
        message: whaleSignal.message,
        createdAt: Date.now(),
      })
    }

    if (marketRegime === "Bullish Expansion") {
      nextAlerts.push({
        id: "regime-bull",
        type: "bullish",
        title: "Bullish Regime",
        message: "OI and price are expanding together.",
        createdAt: Date.now(),
      })
    }

    if (marketRegime === "Bearish Expansion") {
      nextAlerts.push({
        id: "regime-bear",
        type: "bearish",
        title: "Bearish Regime",
        message: "OI is rising while price is moving down.",
        createdAt: Date.now(),
      })
    }

    if (liquiditySweep.detected) {
      nextAlerts.push({
        id: `sweep-${liquiditySweep.direction}`,
        type: liquiditySweep.direction === "bullish" ? "bullish" : "bearish",
        title:
          liquiditySweep.direction === "bullish"
            ? "Bullish Liquidity Sweep"
            : "Bearish Liquidity Sweep",
        message: liquiditySweep.message,
        createdAt: Date.now(),
      })
    }

    const signature = nextAlerts.map((a) => a.id).sort().join("|")

    if (signature && signature !== lastAlertRef.current) {
      lastAlertRef.current = signature
      setAlerts(nextAlerts.slice(0, 5))

      if (
        notificationsEnabled &&
        typeof window !== "undefined" &&
        "Notification" in window
      ) {
        if (Notification.permission === "granted") {
          const first = nextAlerts[0]
          new Notification(first.title, {
            body: first.message,
          })
        }
      }
    }

    if (!signature) {
      lastAlertRef.current = ""
      setAlerts([])
    }
  }, [
    result,
    enhancedScore,
    whaleSignal,
    marketRegime,
    liquiditySweep,
    notificationsEnabled,
  ])

  const liveTopSignals = useMemo(() => scanner.slice(0, 5), [scanner])

  const positionData = useMemo(() => {
    if (!result?.setup || result.setup.direction === "Neutral") return null

    const account = parseFloat(accountSize)
    const risk = parseFloat(riskPercent)

    if (!account || !risk) return null

    const riskAmount = (account * risk) / 100
    const entry = Number(result.setup.entryHigh || result.lastPrice)
    const stop = Number(result.setup.stopLoss)
    const stopDistance = Math.abs(entry - stop)

    if (!stopDistance || stopDistance <= 0) return null

    const positionSize = riskAmount / stopDistance
    const positionValue = positionSize * entry

    return {
      riskAmount: riskAmount.toFixed(2),
      stopDistance: stopDistance.toFixed(4),
      positionSize: positionSize.toFixed(6),
      positionValue: positionValue.toFixed(2),
    }
  }, [accountSize, riskPercent, result])

  return (
  <main
    style={{
      padding: 24,
      maxWidth: 1280,
      margin: "0 auto",
      fontFamily: "Arial, sans-serif",
      color: "white",
      background: "black",
      minHeight: "100vh",
    }}
  >
    <h1>Market Radar</h1>
    <p>Scanner für Spot und Futures mit Macro, Regime, MTF, Funding, OI, Whale und Liquidation Bias</p>
<div
  style={{
    marginTop: 20,
    padding: 20,
    border: "1px solid #333",
    borderRadius: 10,
    background: "#111"
  }}
>
  <h2>Market Regime</h2>

  <div
    style={{
      fontSize: 24,
      fontWeight: "bold",
      color:
        regime === "Bullish Expansion"
          ? "#22c55e"
          : regime === "Bearish Expansion"
          ? "#ef4444"
          : regime === "Range"
          ? "#eab308"
          : regime === "Volatile"
          ? "#f97316"
          : "#6b7280"
    }}
  >
    {regime}
  </div>
  <div
  style={{
    marginTop: 20,
    padding: 20,
    border: "1px solid #333",
    borderRadius: 10,
    background: "#111",
  }}
>
  <h2>OI Delta Radar</h2>

  <div
    style={{
      fontSize: 24,
      fontWeight: "bold",
      color: getOiDeltaColor(oiDeltaSignal),
      marginBottom: 10,
    }}
  >
    {oiDeltaSignal}
  </div>

  <div style={{ color: "#aaa", fontSize: 14 }}>
    OI Delta: {Number(oiDeltaData?.oiDelta ?? 0).toFixed(2)}
  </div>

  <div style={{ color: "#aaa", fontSize: 14, marginTop: 6 }}>
    Price Change: {Number(oiDeltaData?.priceChange ?? 0).toFixed(2)}%
  </div>
</div>
</div>
    <div
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        padding: "10px 0",
        marginTop: 10,
      }}
    >
      {assetTabs.map((tab) => {
        const active = assetTab === tab

        return (
          <button
            key={tab}
            onClick={() => setAssetTab(tab)}
            style={{
              padding: "10px 16px",
              borderRadius: 999,
              border: "1px solid #333",
              background: active ? "white" : "#1a1a1a",
              color: active ? "black" : "white",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {tab}
          </button>
        )
      })}
    </div>

    <div
      style={{
        display: "grid",
        gap: 12,
        maxWidth: 460,
        marginTop: 20,
      }}
    >
      <input
        value={symbol}
        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
        placeholder="BTCUSDT"
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #555",
          background: "black",
          color: "white",
        }}
      />

      <select
        value={interval}
        onChange={(e) => setInterval(e.target.value)}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #555",
          background: "black",
          color: "white",
        }}
      >
        <option value="15m">Scalp</option>
        <option value="1h">Daytrading</option>
        <option value="4h">Swing</option>
        <option value="1d">Position</option>
        <option value="1w">Macro</option>
      </select>

      <select
        value={marketType}
        onChange={(e) => setMarketType(e.target.value)}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #555",
          background: "black",
          color: "white",
        }}
      >
        <option value="spot">Crypto Spot</option>
        <option value="futures">Crypto Futures</option>
      </select>

      <select
        value={mode}
        onChange={(e) => setMode(e.target.value)}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #555",
          background: "black",
          color: "white",
        }}
      >
        <option value="scalp">Scalp</option>
        <option value="daytrading">Daytrading</option>
        <option value="swing">Swing</option>
      </select>

      <select
        value={scanLimit}
        onChange={(e) => setScanLimit(e.target.value)}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #555",
          background: "black",
          color: "white",
        }}
      >
        <option value="20">20 Coins</option>
        <option value="50">50 Coins</option>
        <option value="100">100 Coins</option>
      </select>

      <input
        value={accountSize}
        onChange={(e) => setAccountSize(e.target.value)}
        placeholder="Kontogrösse"
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #555",
          background: "black",
          color: "white",
        }}
      />

      <input
        value={riskPercent}
        onChange={(e) => setRiskPercent(e.target.value)}
        placeholder="Risiko %"
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #555",
          background: "black",
          color: "white",
        }}
      />

      <select
        value={alertFilter}
        onChange={(e) => setAlertFilter(e.target.value)}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "1px solid #555",
          background: "black",
          color: "white",
        }}
      >
        <option value="all">Alle Setups</option>
        <option value="a-plus">Nur A+</option>
        <option value="a-and-better">A+ und A</option>
        <option value="watchlist">Ab Watchlist</option>
      </select>

      <button
        onClick={() => analyzeMarket()}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "none",
          cursor: "pointer",
          background: "#22c55e",
          color: "white",
          fontWeight: "bold",
        }}
      >
        Einzelanalyse starten
      </button>

      <button
        onClick={scanMarket}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "none",
          cursor: "pointer",
          background: "#2563eb",
          color: "white",
          fontWeight: "bold",
        }}
      >
        {loadingScan
          ? `Scanne ${marketType === "futures" ? "Futures" : "Spot"}...`
          : `Market Scanner (${scanLimit} ${marketType === "futures" ? "Futures" : "Spot"})`}
      </button>

      <button
        onClick={scanIndices}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "none",
          cursor: "pointer",
          background: "#9333ea",
          color: "white",
          fontWeight: "bold",
        }}
      >
        {loadingIndices ? "US Markt wird gescannt..." : "US Markt scannen"}
      </button>

      <button
        onClick={enableNotifications}
        style={{
          padding: 12,
          borderRadius: 10,
          border: "none",
          cursor: "pointer",
          background: notificationsEnabled ? "#16a34a" : "#374151",
          color: "white",
          fontWeight: "bold",
        }}
      >
        {notificationsEnabled ? "Alerts aktiviert" : "Browser Alerts aktivieren"}
      </button>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
          />
          Auto Refresh
        </label>

        <select
          value={refreshInterval}
          onChange={(e) => setRefreshInterval(Number(e.target.value))}
          style={{
            padding: 6,
            borderRadius: 6,
            background: "black",
            color: "white",
            border: "1px solid #444",
          }}
        >
          <option value={5}>5s</option>
          <option value={10}>10s</option>
          <option value={15}>15s</option>
          <option value={30}>30s</option>
          <option value={60}>60s</option>
        </select>

        {autoRefresh && (
          <span style={{ color: "#22c55e" }}>
            Nächster Scan in {refreshCountdown} Sekunden
          </span>
        )}
      </div>
    </div>

    {result && (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginTop: 30,
        }}
      >
        <div
          style={{
            border: "1px solid #333",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase" }}>
            Enhanced Score
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 32,
              fontWeight: "bold",
              color: getScoreColor(enhancedScore),
            }}
          >
            {enhancedScore}
          </div>
          <div style={{ marginTop: 8, color: "#d1d5db" }}>
            Confidence: <strong>{confidence}</strong>
          </div>
          <div style={{ color: "#d1d5db" }}>
            Bias: <strong>{bias}</strong>
          </div>
        </div>

        <div
          style={{
            border: "1px solid #333",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase" }}>
            Market Regime
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 24,
              fontWeight: "bold",
              color: getRegimeColor(marketRegime),
            }}
          >
            {marketRegime}
          </div>
          <div style={{ marginTop: 8, color: "#d1d5db" }}>
            Price Change: {priceChangePct.toFixed(2)}%
          </div>
          <div style={{ color: "#d1d5db" }}>
            OI Change: {oiChangePct.toFixed(2)}%
          </div>
        </div>

        <div
          style={{
            border: "1px solid #333",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase" }}>
            Whale Detection
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 24,
              fontWeight: "bold",
              color: whaleSignal.active
                ? whaleSignal.strength === "high"
                  ? "#ef4444"
                  : whaleSignal.strength === "medium"
                  ? "#f97316"
                  : "#eab308"
                : "#9ca3af",
            }}
          >
            {whaleSignal.active ? `Active (${whaleSignal.strength})` : "Inactive"}
          </div>
          <div style={{ marginTop: 8, color: "#d1d5db" }}>{whaleSignal.message}</div>
          <div style={{ color: "#d1d5db" }}>Volume Ratio: {volumeRatio.toFixed(2)}x</div>
        </div>

        <div
          style={{
            border: "1px solid #333",
            borderRadius: 10,
            padding: 14,
          }}
        >
          <div style={{ fontSize: 12, color: "#9ca3af", textTransform: "uppercase" }}>
            Live Status
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 24,
              fontWeight: "bold",
              color:
                liveStatus === "Live"
                  ? "#22c55e"
                  : liveStatus === "Error"
                  ? "#ef4444"
                  : "#eab308",
            }}
          >
            {liveStatus}
          </div>
          <div style={{ marginTop: 8, color: "#d1d5db" }}>
            Live Preis: {livePrice ?? result?.lastPrice ?? "-"}
          </div>
          <div style={{ color: "#d1d5db" }}>
            Live Change: {livePriceChange !== null ? `${livePriceChange}%` : "-"}
          </div>
        </div>
      </div>
    )}

    {alerts.length > 0 && (
      <div
        style={{
          marginTop: 20,
          padding: 16,
          border: "1px solid #333",
          borderRadius: 10,
          display: "grid",
          gap: 10,
        }}
      >
        <h2>Live Alerts</h2>

        {alerts.map((alert) => (
          <div
            key={alert.id}
            style={{
              padding: 12,
              border: "1px solid #222",
              borderRadius: 8,
              background: "#0a0a0a",
            }}
          >
            <div
              style={{
                fontWeight: "bold",
                color:
                  alert.type === "bullish"
                    ? "#22c55e"
                    : alert.type === "bearish"
                    ? "#ef4444"
                    : alert.type === "warning"
                    ? "#f97316"
                    : "#9ca3af",
              }}
            >
              {alert.title}
            </div>
            <div style={{ marginTop: 4, color: "#d1d5db" }}>
              {alert.message}
            </div>
          </div>
        ))}
      </div>
    )}

    {regimeData && !regimeData.error && (
      <div
        style={{
          marginTop: 30,
          padding: 16,
          border: "1px solid #333",
          borderRadius: 10,
          display: "grid",
          gap: 12,
        }}
      >
        <h2>Market Regime</h2>

        <div>
          <strong>Regime:</strong>
          <span
            style={{
              marginLeft: 6,
              color:
                regimeData.regime === "Risk On"
                  ? "#22c55e"
                  : regimeData.regime === "Risk Off"
                  ? "#ef4444"
                  : "#eab308",
            }}
          >
            {regimeData.regime}
          </span>
        </div>

        <div>
          <strong>Regime Score:</strong> {regimeData.regimeScore}
        </div>

        <div>
          <strong>US Market Bias:</strong> {regimeData.usMarketBias}
        </div>

        <div>
          <strong>Session Bias:</strong> {regimeData.sessionBias}
        </div>

        <div>
          <strong>Market State:</strong>
          <span
            style={{
              marginLeft: 6,
              color:
                regimeData.marketState?.includes("Up")
                  ? "#22c55e"
                  : regimeData.marketState?.includes("Down")
                  ? "#ef4444"
                  : "#eab308",
            }}
          >
            {regimeData.marketState}
          </span>
        </div>

        <div>
          <strong>Squeeze Environment:</strong>
          <span style={{ marginLeft: 6, color: "#22c55e" }}>
            {regimeData.squeezeEnvironment}
          </span>
        </div>

        <div>
          <strong>Long Flush Environment:</strong>
          <span style={{ marginLeft: 6, color: "#ef4444" }}>
            {regimeData.longFlushEnvironment}
          </span>
        </div>

        <div>
          <strong>Trend Day:</strong> {regimeData.trendDay ? "Ja" : "Nein"}
        </div>

        <div>
          <strong>Chop Day:</strong> {regimeData.chopDay ? "Ja" : "Nein"}
        </div>
      </div>
    )}

    {scanner.length > 0 && (
      <div
        style={{
          marginTop: 30,
          padding: 16,
          border: "1px solid #333",
          borderRadius: 10,
          display: "grid",
          gap: 12,
        }}
      >
        <h2>Setup Dashboard</h2>

        {bestOverall && (
          <div>
            <strong>Best Overall:</strong> {bestOverall.symbol} | {bestOverall.signal} | Score {bestOverall.score} | {bestOverall.alertLevel}
            <div style={{ marginTop: 4, color: "#9ca3af" }}>
              {bestOverall.whaleMove || "Neutral"} | {bestOverall.liquidationTrap || "Neutral"}
            </div>
          </div>
        )}

        {bestLong && (
          <div>
            <strong>Best Long:</strong> {bestLong.symbol} | Score {bestLong.score} | {bestLong.alertLevel}
          </div>
        )}

        {bestShort && (
          <div>
            <strong>Best Short:</strong> {bestShort.symbol} | Score {bestShort.score} | {bestShort.alertLevel}
          </div>
        )}

        {mtfData && (
          <div>
            <strong>MTF Bias:</strong> {mtfData.mtfBias} | {mtfData.mtfAlignment}
          </div>
        )}

        <div>
          <strong>US Market Bias:</strong> {usMarketBias}
        </div>

        {regimeData && (
          <>
            <div>
              <strong>Regime:</strong> {regimeData.regime} | Score {regimeData.regimeScore}
            </div>

            <div>
              <strong>Market State:</strong> {regimeData.marketState}
            </div>
          </>
        )}

        {oiDeltaData && (
          <>
            <div>
              <strong>OI Structure:</strong> {oiDeltaData.structure} | {oiDeltaData.bias}
            </div>

            <div>
              <strong>OI Delta:</strong> {oiDeltaData.oiDeltaPct}% | <strong>Funding Momentum:</strong> {oiDeltaData.fundingMomentum}
            </div>

            <div>
              <strong>OI Quality:</strong> {oiDeltaData.quality}
            </div>
          </>
        )}

        <div>
          <strong>High Quality Count:</strong> {highQualitySetups.length}
        </div>
      </div>
    )}

    {alertHistory.length > 0 && (
      <div
        style={{
          marginTop: 30,
          padding: 16,
          border: "1px solid #333",
          borderRadius: 10,
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Alert History</h2>
          <button
            onClick={() => setAlertHistory([])}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              background: "#374151",
              color: "white",
            }}
          >
            Leeren
          </button>
        </div>

        {alertHistory.map((alert: any, index: number) => (
          <div
            key={`${alert.symbol}-${alert.time}-${index}`}
            style={{
              padding: 10,
              border: "1px solid #222",
              borderRadius: 8,
            }}
          >
            <strong
              style={{
                color:
                  alert.type === "Alert Upgrade"
                    ? "#22c55e"
                    : alert.type === "Trap Signal"
                    ? "#f97316"
                    : alert.type === "Whale Move"
                    ? "#60a5fa"
                    : "#eab308",
              }}
            >
              {alert.type}
            </strong>{" "}
            | {alert.symbol} | {alert.time}
            <div style={{ marginTop: 4, color: "#d1d5db" }}>
              {alert.text}
            </div>
          </div>
        ))}
      </div>
    )}

    {scanner.length > 0 && (
      <div style={{ marginTop: 30 }}>
        <h2>Signal Board</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 12,
          }}
        >
          <div
            style={{
              border: "1px solid #333",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <h3>Fresh A+ Alerts</h3>
            {aPlusSignals.length === 0 && <p>Keine A+ Signale</p>}
            {aPlusSignals.map((coin: any, index: number) => (
              <div
                key={index}
                onClick={() => analyzeMarket(coin.symbol, coin.interval, coin.market)}
                style={{
                  marginTop: 8,
                  padding: 8,
                  border: "1px solid #222",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <strong>{coin.symbol}</strong> | {coin.signal} | <span style={{ color: getAlertColor(coin.alertLevel) }}>{coin.alertLevel}</span> | Score <span style={{ color: getScoreColor(coin.score) }}>{coin.score}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              border: "1px solid #333",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <h3>Fresh A Alerts</h3>
            {aSignals.length === 0 && <p>Keine A Signale</p>}
            {aSignals.map((coin: any, index: number) => (
              <div
                key={index}
                onClick={() => analyzeMarket(coin.symbol, coin.interval, coin.market)}
                style={{
                  marginTop: 8,
                  padding: 8,
                  border: "1px solid #222",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <strong>{coin.symbol}</strong> | {coin.signal} | <span style={{ color: getAlertColor(coin.alertLevel) }}>{coin.alertLevel}</span> | Score <span style={{ color: getScoreColor(coin.score) }}>{coin.score}</span>
              </div>
            ))}
          </div>

          <div
            style={{
              border: "1px solid #333",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <h3>Short Squeeze Candidates</h3>
            {shortSqueezeSignals.length === 0 && <p>Keine Kandidaten</p>}
            {shortSqueezeSignals.map((coin: any, index: number) => (
              <div
                key={index}
                onClick={() => analyzeMarket(coin.symbol, coin.interval, coin.market)}
                style={{
                  marginTop: 8,
                  padding: 8,
                  border: "1px solid #222",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <strong>{coin.symbol}</strong> | {coin.liquidationTrap} | {coin.alertLevel}
              </div>
            ))}
          </div>

          <div
            style={{
              border: "1px solid #333",
              borderRadius: 10,
              padding: 12,
            }}
          >
            <h3>Long Flush Candidates</h3>
            {longFlushSignals.length === 0 && <p>Keine Kandidaten</p>}
            {longFlushSignals.map((coin: any, index: number) => (
              <div
                key={index}
                onClick={() => analyzeMarket(coin.symbol, coin.interval, coin.market)}
                style={{
                  marginTop: 8,
                  padding: 8,
                  border: "1px solid #222",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                <strong>{coin.symbol}</strong> | {coin.liquidationTrap} | {coin.alertLevel}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            marginTop: 20,
            border: "1px solid #333",
            borderRadius: 10,
            padding: 12,
          }}
        >
          <h3>Top 5 Live Signals</h3>
          {liveTopSignals.length === 0 && <p>Keine Daten</p>}
          {liveTopSignals.map((coin: any, index: number) => (
            <div
              key={index}
              onClick={() => analyzeMarket(coin.symbol, coin.interval, coin.market)}
              style={{
                marginTop: 8,
                padding: 8,
                border: "1px solid #222",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              <strong>{coin.symbol}</strong> | {coin.signal} | {coin.alertLevel} | Score {coin.score} | {coin.oiStructure || "-"}
            </div>
          ))}
        </div>
      </div>
    )}

    {scanner.length > 0 && (
      <div style={{ marginTop: 30 }}>
        <h2>Score Radar</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            gap: 12,
          }}
        >
          {filteredByAssetTab.slice(0, 6).map((coin: any, index: number) => (
            <div
              key={index}
              onClick={() => analyzeMarket(coin.symbol, coin.interval, coin.market)}
              style={{
                border: "1px solid #333",
                borderRadius: 10,
                padding: 12,
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <strong>{coin.symbol}</strong>
                <span style={{ color: getAlertColor(coin.alertLevel) }}>
                  {coin.alertLevel}
                </span>
              </div>

              <div style={{ marginTop: 8, fontSize: 14 }}>
                {coin.signal} | {coin.trend}
              </div>

              <div
                style={{
                  marginTop: 10,
                  height: 10,
                  background: "#222",
                  borderRadius: 999,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${coin.score}%`,
                    height: "100%",
                    background: getScoreColor(coin.score),
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 8,
                  fontSize: 14,
                  fontWeight: "bold",
                  color: getScoreColor(coin.score),
                }}
              >
                Score: {coin.score}
              </div>

              <div style={{ marginTop: 4, fontSize: 13, color: "#9ca3af" }}>
                {coin.macroAlignment} | {coin.regimeAlignment || "-"} | {coin.futuresAlignment} | {coin.mtfStatus}
              </div>

              <div style={{ marginTop: 6, fontSize: 12, color: "#d1d5db" }}>
                {coin.whaleMove || "Neutral"}
              </div>

              <div style={{ marginTop: 4, fontSize: 12, color: "#fca5a5" }}>
                {coin.liquidationTrap || "Neutral"}
              </div>

              <div style={{ marginTop: 4, fontSize: 12, color: "#93c5fd" }}>
                {coin.oiStructure || "Neutral"} | {coin.oiBias || "Neutral"}
              </div>

              <div style={{ marginTop: 4, fontSize: 12, color: "#c4b5fd" }}>
                OI Δ {coin.oiDeltaPct ?? "-"}% | Funding {coin.oiFundingMomentum || "-"}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {topLongs.length > 0 && (
      <div style={{ marginTop: 30 }}>
        <h2 style={{ color: "#22c55e" }}>Top Long Setups</h2>
        {topLongs.map((coin: any, index: number) => (
          <div
            key={index}
            onClick={() => analyzeMarket(coin.symbol, coin.interval, coin.market)}
            style={{
              cursor: "pointer",
              padding: 10,
              border: "1px solid #1f2937",
              marginBottom: 8,
              borderRadius: 8,
            }}
          >
            <strong>{coin.symbol}</strong> | {coin.signal} | Entry {coin.entryLow} - {coin.entryHigh} | TP1 {coin.tp1} | RR {coin.rr} | {coin.alertLevel} | {coin.oiStructure || "-"} | OI Δ {coin.oiDeltaPct ?? "-"}%
          </div>
        ))}
      </div>
    )}

    {topShorts.length > 0 && (
      <div style={{ marginTop: 30 }}>
        <h2 style={{ color: "#ef4444" }}>Top Short Setups</h2>
        {topShorts.map((coin: any, index: number) => (
          <div
            key={index}
            onClick={() => analyzeMarket(coin.symbol, coin.interval, coin.market)}
            style={{
              cursor: "pointer",
              padding: 10,
              border: "1px solid #1f2937",
              marginBottom: 8,
              borderRadius: 8,
            }}
          >
            <strong>{coin.symbol}</strong> | {coin.signal} | Entry {coin.entryLow} - {coin.entryHigh} | TP1 {coin.tp1} | RR {coin.rr} | {coin.alertLevel} | {coin.oiStructure || "-"} | OI Δ {coin.oiDeltaPct ?? "-"}%
          </div>
        ))}
      </div>
    )}

    {indexScanner.length > 0 && (
      <div style={{ marginTop: 30 }}>
        <h2>US Markt Übersicht</h2>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 10,
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8 }}>Symbol</th>
                <th style={{ textAlign: "left", padding: 8 }}>Name</th>
                <th style={{ textAlign: "left", padding: 8 }}>Trend</th>
                <th style={{ textAlign: "left", padding: 8 }}>Signal</th>
                <th style={{ textAlign: "left", padding: 8 }}>Preis</th>
                <th style={{ textAlign: "left", padding: 8 }}>RSI</th>
                <th style={{ textAlign: "left", padding: 8 }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {indexScanner.map((item: any, index: number) => (
                <tr key={index} style={{ borderTop: "1px solid #333" }}>
                  <td style={{ padding: 8 }}>{item.symbol}</td>
                  <td style={{ padding: 8 }}>{item.label}</td>
                  <td style={{ padding: 8 }}>{item.trend || "-"}</td>
                  <td style={{ padding: 8 }}>{item.signal || "-"}</td>
                  <td style={{ padding: 8 }}>{item.lastPrice || "-"}</td>
                  <td style={{ padding: 8 }}>{item.rsi || "-"}</td>
                  <td style={{ padding: 8 }}>{item.score || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    {scanner.length > 0 && (
      <div style={{ marginTop: 30 }}>
        <h2>Scanner Übersicht</h2>
        <p><strong>Mode:</strong> {mode}</p>
        <p><strong>Markt:</strong> {marketType}</p>
        <p><strong>Coins:</strong> {scanner.length}</p>
        <p><strong>US Market Bias:</strong> {usMarketBias}</p>

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              marginTop: 10,
            }}
          >
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 8 }}>Coin</th>
                <th style={{ textAlign: "left", padding: 8 }}>Signal</th>
                <th style={{ textAlign: "left", padding: 8 }}>Trend</th>
                <th style={{ textAlign: "left", padding: 8 }}>Score</th>
                <th style={{ textAlign: "left", padding: 8 }}>Macro</th>
                <th style={{ textAlign: "left", padding: 8 }}>Regime</th>
                <th style={{ textAlign: "left", padding: 8 }}>Futures</th>
                <th style={{ textAlign: "left", padding: 8 }}>MTF</th>
                <th style={{ textAlign: "left", padding: 8 }}>OI</th>
                <th style={{ textAlign: "left", padding: 8 }}>OI Δ%</th>
                <th style={{ textAlign: "left", padding: 8 }}>Funding Mom</th>
                <th style={{ textAlign: "left", padding: 8 }}>Whale</th>
                <th style={{ textAlign: "left", padding: 8 }}>Trap</th>
                <th style={{ textAlign: "left", padding: 8 }}>Alert</th>
                <th style={{ textAlign: "left", padding: 8 }}>Entry</th>
                <th style={{ textAlign: "left", padding: 8 }}>Stop</th>
                <th style={{ textAlign: "left", padding: 8 }}>TP1</th>
                <th style={{ textAlign: "left", padding: 8 }}>RR</th>
              </tr>
            </thead>

            <tbody>
              {filteredByAssetTab.map((coin: any, index: number) => (
                <tr
                  key={index}
                  onClick={() => analyzeMarket(coin.symbol, coin.interval, coin.market)}
                  style={{
                    cursor: "pointer",
                    borderTop: "1px solid #333",
                  }}
                >
                  <td style={{ padding: 8 }}>{coin.symbol}</td>
                  <td style={{ padding: 8 }}>{coin.signal}</td>
                  <td style={{ padding: 8 }}>{coin.trend}</td>
                  <td style={{ padding: 8, color: getScoreColor(coin.score) }}>
                    {coin.score}
                  </td>
                  <td style={{ padding: 8 }}>{coin.macroAlignment}</td>
                  <td style={{ padding: 8 }}>{coin.regimeAlignment || "-"}</td>
                  <td style={{ padding: 8 }}>{coin.futuresAlignment}</td>
                  <td style={{ padding: 8 }}>{coin.mtfStatus}</td>
                  <td style={{ padding: 8 }}>{coin.oiStructure || "-"}</td>
                  <td style={{ padding: 8 }}>{coin.oiDeltaPct ?? "-"}</td>
                  <td style={{ padding: 8 }}>{coin.oiFundingMomentum || "-"}</td>
                  <td style={{ padding: 8 }}>{coin.whaleMove || "-"}</td>
                  <td style={{ padding: 8 }}>{coin.liquidationTrap || "-"}</td>
                  <td style={{ padding: 8, color: getAlertColor(coin.alertLevel) }}>
                    {coin.alertLevel}
                  </td>
                  <td style={{ padding: 8 }}>
                    {coin.direction !== "Neutral" ? `${coin.entryLow} - ${coin.entryHigh}` : "-"}
                  </td>
                  <td style={{ padding: 8 }}>
                    {coin.direction !== "Neutral" ? coin.stopLoss : "-"}
                  </td>
                  <td style={{ padding: 8 }}>
                    {coin.direction !== "Neutral" ? coin.tp1 : "-"}
                  </td>
                  <td style={{ padding: 8 }}>
                    {coin.direction !== "Neutral" ? coin.rr : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )}

    <div
      ref={chartContainerRef}
      style={{
        width: "100%",
        minHeight: "520px",
        marginTop: 40,
        border: "1px solid #222",
      }}
    />

    {result && (
      <>
        <div style={{ marginTop: 30 }}>
          <h2>Detailanalyse</h2>

          <div
            style={{
              marginTop: 12,
              marginBottom: 18,
              padding: 12,
              border: "1px solid #333",
              borderRadius: 10,
            }}
          >
            <h3>Live Price Stream</h3>
            <p><strong>Status:</strong> {liveStatus}</p>
            <p><strong>Live Preis:</strong> {livePrice ?? "-"}</p>
            <p>
              <strong>Live Change:</strong>{" "}
              <span
                style={{
                  color:
                    livePriceChange === null
                      ? "white"
                      : livePriceChange >= 0
                      ? "#22c55e"
                      : "#ef4444",
                }}
              >
                {livePriceChange !== null ? `${livePriceChange}%` : "-"}
              </span>
            </p>
          </div>

          <p><strong>Symbol:</strong> {result?.symbol ?? symbol}</p>
          <p><strong>Intervall:</strong> {result?.interval ?? interval}</p>
          <p><strong>Markt:</strong> {result?.market ?? marketType}</p>
          <p><strong>Letzter Preis:</strong> {result?.lastPrice ?? livePrice ?? "-"}</p>
          <p><strong>Trend:</strong> {result?.trend ?? "-"}</p>
          <p><strong>Signal:</strong> {result?.signal ?? "-"}</p>
          <p><strong>RSI:</strong> {result?.indicators?.rsi ?? "-"}</p>
          <p><strong>EMA20:</strong> {result?.indicators?.ema20 ?? "-"}</p>
          <p><strong>EMA50:</strong> {result?.indicators?.ema50 ?? "-"}</p>
          <p><strong>Support:</strong> {result?.indicators?.support ?? "-"}</p>
          <p><strong>Resistance:</strong> {result?.indicators?.resistance ?? "-"}</p>
          <p><strong>Last Update:</strong> {lastUpdated}</p>
          <p><strong>Aktuelli Uhrziit:</strong> {nowTime}</p>
          <p><strong>Nöchschti Candle in:</strong> {countdown}</p>

          {result.setup && result.setup.direction !== "Neutral" && (
            <>
              <p><strong>Richtung:</strong> {result.setup.direction}</p>
              <p><strong>Entry Zone:</strong> {result.setup.entryLow} - {result.setup.entryHigh}</p>
              <p><strong>Stop Loss:</strong> {result.setup.stopLoss}</p>
              <p><strong>TP1:</strong> {result.setup.tp1}</p>
              <p><strong>TP2:</strong> {result.setup.tp2}</p>
              <p><strong>RR:</strong> {result.setup.rr}</p>
            </>
          )}

          {positionData && (
            <>
              <h3>Positionsrechner</h3>
              <p><strong>Kontogrösse:</strong> {accountSize}</p>
              <p><strong>Risiko %:</strong> {riskPercent}</p>
              <p><strong>Max Verlust:</strong> {positionData.riskAmount}</p>
              <p><strong>Stop Distanz:</strong> {positionData.stopDistance}</p>
              <p><strong>Positionsgrösse:</strong> {positionData.positionSize}</p>
              <p><strong>Positionswert:</strong> {positionData.positionValue}</p>
            </>
          )}

          {futuresData && !futuresData.error && (
            <div style={{ marginTop: 30 }}>
              <h3>Futures Daten</h3>
              <p><strong>Mark Price:</strong> {futuresData.markPrice}</p>
              <p><strong>Index Price:</strong> {futuresData.indexPrice}</p>
              <p><strong>Funding Rate:</strong> {futuresData.fundingRate}</p>
              <p><strong>Funding Bias:</strong> {futuresData.fundingBias}</p>
              <p><strong>Open Interest:</strong> {futuresData.openInterest}</p>
              <p><strong>OI Trend:</strong> {futuresData.oiTrend}</p>
            </div>
          )}

          {futuresIntel && !futuresIntel.error && (
            <div style={{ marginTop: 30 }}>
              <h3>Futures Intel</h3>
              <p><strong>Price vs Index:</strong> {futuresIntel.priceVsIndex}</p>
              <p><strong>Futures Insight:</strong> {futuresIntel.futuresInsight}</p>
              <p><strong>Crowd Bias:</strong> {futuresIntel.crowdBias}</p>
              <p><strong>Squeeze Risk:</strong> {futuresIntel.squeezeRisk}</p>
              <p><strong>Pulse:</strong> {futuresIntel.crowdBias} | {futuresIntel.squeezeRisk}</p>
            </div>
          )}

          {oiDeltaData && !oiDeltaData.error && (
            <div style={{ marginTop: 30 }}>
              <h3>OI Delta Radar</h3>

              <p><strong>Current OI:</strong> {oiDeltaData.currentOpenInterest}</p>
              <p><strong>Previous OI:</strong> {oiDeltaData.previousOpenInterest}</p>
              <p><strong>OI Delta %:</strong> {oiDeltaData.oiDeltaPct}</p>
              <p><strong>OI Momentum:</strong> {oiDeltaData.oiMomentum}</p>

              <p><strong>Current Funding:</strong> {oiDeltaData.currentFundingRate}</p>
              <p><strong>Previous Funding:</strong> {oiDeltaData.previousFundingRate}</p>
              <p><strong>Funding Momentum:</strong> {oiDeltaData.fundingMomentum}</p>

              <p><strong>Current Close:</strong> {oiDeltaData.currentClose}</p>
              <p><strong>Previous Close:</strong> {oiDeltaData.previousClose}</p>
              <p><strong>Price Delta %:</strong> {oiDeltaData.priceDeltaPct}</p>

              <p>
                <strong>Structure:</strong>{" "}
                <span
                  style={{
                    color:
                      oiDeltaData.structure === "Trend Confirmed"
                        ? "#22c55e"
                        : oiDeltaData.structure === "Short Squeeze Build"
                        ? "#60a5fa"
                        : oiDeltaData.structure === "Long Flush"
                        ? "#ef4444"
                        : "#eab308",
                  }}
                >
                  {oiDeltaData.structure}
                </span>
              </p>

              <p>
                <strong>Bias:</strong>{" "}
                <span
                  style={{
                    color:
                      oiDeltaData.bias?.includes("Bullish")
                        ? "#22c55e"
                        : oiDeltaData.bias?.includes("Bearish")
                        ? "#ef4444"
                        : "white",
                  }}
                >
                  {oiDeltaData.bias}
                </span>
              </p>

              <p>
                <strong>Quality:</strong>{" "}
                <span
                  style={{
                    color:
                      oiDeltaData.quality === "High"
                        ? "#22c55e"
                        : oiDeltaData.quality === "Medium"
                        ? "#eab308"
                        : "#ef4444",
                  }}
                >
                  {oiDeltaData.quality}
                </span>
              </p>

              <p><strong>Note:</strong> {oiDeltaData.note}</p>
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <h3>Market Intelligence</h3>

            <p>
              <strong>Enhanced Score:</strong> {enhancedScore}
            </p>

            <p>
              <strong>Market Regime:</strong>{" "}
              <span style={{ color: getRegimeColor(marketRegime) }}>
                {marketRegime}
              </span>
            </p>

            <p>
              <strong>Whale Activity:</strong>{" "}
              {whaleSignal.active ? whaleSignal.strength : "None"}
            </p>

            <p>
              <strong>Bias:</strong> {bias}
            </p>

            <p>
              <strong>Confidence:</strong> {confidence}
            </p>
          </div>

          {mtfData && !mtfData.error && (
            <div style={{ marginTop: 30 }}>
              <h3>Multi-Timeframe Matrix</h3>
              <p><strong>MTF Bias:</strong> {mtfData.mtfBias}</p>
              <p><strong>Alignment:</strong> {mtfData.mtfAlignment}</p>

              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: 10,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: 8 }}>Intervall</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Trend</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Signal</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Preis</th>
                      <th style={{ textAlign: "left", padding: 8 }}>RSI</th>
                      <th style={{ textAlign: "left", padding: 8 }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mtfData.frames?.map((frame: any, index: number) => (
                      <tr key={index} style={{ borderTop: "1px solid #333" }}>
                        <td style={{ padding: 8 }}>{frame.interval}</td>
                        <td style={{ padding: 8 }}>{frame.trend || "-"}</td>
                        <td style={{ padding: 8 }}>{frame.signal || "-"}</td>
                        <td style={{ padding: 8 }}>{frame.lastPrice || "-"}</td>
                        <td style={{ padding: 8 }}>{frame.rsi || "-"}</td>
                        <td style={{ padding: 8 }}>{frame.score || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {liquidationData && !liquidationData.error && (
            <div style={{ marginTop: 30 }}>
              <h3>Liquidation Heatmap (Live Refresh)</h3>
              <p><strong>Liquidity Bias:</strong> {liquidationData.liquidityBias}</p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginTop: 12,
                }}
              >
                <div>
                  <strong>Unter aktuellem Preis</strong>
                  {liquidationData.heatmap?.below?.map((row: any, index: number) => (
                    <div
                      key={index}
                      style={{
                        marginTop: 6,
                        padding: 8,
                        border: "1px solid #333",
                        borderRadius: 8,
                      }}
                    >
                      {row.side} | {row.level} | {row.distancePct}% | {row.intensity}
                    </div>
                  ))}
                </div>

                <div>
                  <strong>Über aktuellem Preis</strong>
                  {liquidationData.heatmap?.above?.map((row: any, index: number) => (
                    <div
                      key={index}
                      style={{
                        marginTop: 6,
                        padding: 8,
                        border: "1px solid #333",
                        borderRadius: 8,
                      }}
                    >
                      {row.side} | {row.level} | {row.distancePct}% | {row.intensity}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    )}
  </main>
)
}