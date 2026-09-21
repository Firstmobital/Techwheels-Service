/**
 * In-Memory & LocalStorage TTL Caching Utility for Web App Master Data.
 * Used to cache static reference tables (e.g. dealer_settings, parts pricing, insurance masters)
 * to eliminate repetitive network round-trips.
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
  cachedAt: number
}

class MemoryTtlCache {
  private memory = new Map<string, CacheEntry<unknown>>()

  /**
   * Get cached data or execute fetcher function if expired / absent.
   * @param key Unique cache key
   * @param ttlMs Time-to-live in milliseconds (default 15 minutes)
   * @param fetcher Async function that fetches fresh data
   */
  async getOrFetch<T>(
    key: string,
    ttlMs = 15 * 60 * 1000,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const fresh = await fetcher()
    this.set(key, fresh, ttlMs)
    return fresh
  }

  get<T>(key: string): T | null {
    const now = Date.now()

    // 1. Check memory cache first
    const memEntry = this.memory.get(key)
    if (memEntry && memEntry.expiresAt > now) {
      return memEntry.data as T
    }

    // 2. Check localStorage fallback
    try {
      const raw = localStorage.getItem(`app_cache_${key}`)
      if (raw) {
        const entry = JSON.parse(raw) as CacheEntry<T>
        if (entry && entry.expiresAt > now) {
          this.memory.set(key, entry as CacheEntry<unknown>)
          return entry.data
        }
        localStorage.removeItem(`app_cache_${key}`)
      }
    } catch {
      // Ignore localStorage errors
    }

    return null
  }

  set<T>(key: string, data: T, ttlMs = 15 * 60 * 1000): void {
    const now = Date.now()
    const entry: CacheEntry<T> = {
      data,
      expiresAt: now + ttlMs,
      cachedAt: now,
    }

    this.memory.set(key, entry as CacheEntry<unknown>)

    try {
      localStorage.setItem(`app_cache_${key}`, JSON.stringify(entry))
    } catch {
      // Ignore storage quota errors
    }
  }

  invalidate(key: string): void {
    this.memory.delete(key)
    try {
      localStorage.removeItem(`app_cache_${key}`)
    } catch {
      // Ignore
    }
  }

  clear(): void {
    this.memory.clear()
    try {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('app_cache_'))
      keys.forEach((k) => localStorage.removeItem(k))
    } catch {
      // Ignore
    }
  }
}

export const ttlCache = new MemoryTtlCache()
