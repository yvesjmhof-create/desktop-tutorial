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
type DashboardData = {
  symbol: string
  price: number
  change24h: number
  volume24h: number
  updatedAt: number
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const symbol = (searchParams.get("symbol") || "BTCUSDT").toUpperCase()

  const cacheKey = `dashboard:${symbol}`
  const cached = getCache<DashboardData>(cacheKey)

  if (cached) {
    return NextResponse.json(cached)
  }

  try {
    const [ticker24h, price] = await Promise.all([
      fetchBinance(`/api/v3/ticker/24hr?symbol=${symbol}`),
      fetchBinance(`/api/v3/ticker/price?symbol=${symbol}`),
    ])

    const result: DashboardData = {
      symbol,
      price: Number(price.price),
      change24h: Number(ticker24h.priceChangePercent),
      volume24h: Number(ticker24h.volume),
      updatedAt: Date.now(),
    }

    setCache(cacheKey, result, 10_000)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Dashboard API error:", error)

    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    )
  }
}