type CacheEntry<T> = {
  data: T
  expiry: number
}

const cache = new Map<string, CacheEntry<unknown>>()

export function getCache<T>(key: string): T | null {
  const item = cache.get(key)
  if (!item) return null

  if (Date.now() > item.expiry) {
    cache.delete(key)
    return null
  }

  return item.data as T
}

export function setCache<T>(key: string, data: T, ttlMs: number) {
  cache.set(key, {
    data,
    expiry: Date.now() + ttlMs,
  })
}