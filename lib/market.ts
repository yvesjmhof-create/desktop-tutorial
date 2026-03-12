export async function fetchMarketData(symbol: string, interval: string) {

  const url =
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=100`

  const res = await fetch(url)

  if (!res.ok) {
    throw new Error("Fehler beim Laden der Marktdaten")
  }

  const data = await res.json()

  return data
}