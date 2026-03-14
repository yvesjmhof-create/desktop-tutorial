import { NextResponse } from "next/server"

const BASE_URLS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
]

async function fetchBinance(path: string) {
  let lastError: unknown = null

  for (const base of BASE_URLS) {
    try {
      const res = await fetch(`${base}${path}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      })

      if (!res.ok) {
        throw new Error(`Binance error ${res.status}`)
      }

      return await res.json()
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error("Binance fetch failed")
}

type CacheEntry<T> = {
  data: T
  expiry: number
}

const cache = new Map<string, CacheEntry<unknown>>()

function getCache<T>(key: string): T | null {
  const item = cache.get(key)
  if (!item) return null

  if (Date.now() > item.expiry) {
    cache.delete(key)
    return null
  }

  return item.data as T
}

function setCache<T>(key: string, data: T, ttlMs: number) {
  cache.set(key, {
    data,
    expiry: Date.now() + ttlMs,
  })
}

type Candle = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase()
  const interval = searchParams.get("interval") || "1h"
  const limit = searchParams.get("limit") || "300"

  const cacheKey = `candles:${symbol}:${interval}:${limit}`
  const cached = getCache<Candle[]>(cacheKey)

  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    const raw = await fetchBinance(
      `/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`
    )

    const candles: Candle[] = raw.map((c: any) => ({
      time: Math.floor(c[0] / 1000),
      open: Number(c[1]),
      high: Number(c[2]),
      low: Number(c[3]),
      close: Number(c[4]),
      volume: Number(c[5]),
    }))

    setCache(cacheKey, candles, 15_000)

    return NextResponse.json(candles)
  } catch (error) {
    console.error("Candles API error:", error)

    return NextResponse.json(
      { error: "Failed to load candles" },
      { status: 500 }
    )
  }
}