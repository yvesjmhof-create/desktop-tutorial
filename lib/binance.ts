const BASE_URLS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
]

export async function fetchBinance(path: string) {
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