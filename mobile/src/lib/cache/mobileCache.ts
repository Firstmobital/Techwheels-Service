/**
 * Mobile App TTL Cache Manager for static master data (branches, vehicle models, pricing).
 */

import { safeStorage } from '../storageHelper'

interface MobileCacheEntry<T> {
  data: T
  expiresAt: number
}

class MobileTtlCache {
  private memory = new Map<string, MobileCacheEntry<unknown>>()

  async getOrFetch<T>(
    key: string,
    ttlMs = 30 * 60 * 1000,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const fresh = await fetcher()
    await this.set(key, fresh, ttlMs)
    return fresh
  }

  async get<T>(key: string): Promise<T | null> {
    const now = Date.now()

    // 1. In-memory check
    const mem = this.memory.get(key)
    if (mem && mem.expiresAt > now) {
      return mem.data as T
    }

    // 2. Persistent storage check
    try {
      const raw = await safeStorage.getItem(`mobile_cache_${key}`)
      if (raw) {
        const entry = JSON.parse(raw) as MobileCacheEntry<T>
        if (entry && entry.expiresAt > now) {
          this.memory.set(key, entry as MobileCacheEntry<unknown>)
          return entry.data
        }
        await safeStorage.deleteItem(`mobile_cache_${key}`)
      }
    } catch {
      // Ignore
    }

    return null
  }

  async set<T>(key: string, data: T, ttlMs = 30 * 60 * 1000): Promise<void> {
    const entry: MobileCacheEntry<T> = {
      data,
      expiresAt: Date.now() + ttlMs,
    }

    this.memory.set(key, entry as MobileCacheEntry<unknown>)

    try {
      await safeStorage.setItem(`mobile_cache_${key}`, JSON.stringify(entry))
    } catch {
      // Ignore
    }
  }

  async invalidate(key: string): Promise<void> {
    this.memory.delete(key)
    await safeStorage.deleteItem(`mobile_cache_${key}`)
  }
}

export const mobileCache = new MobileTtlCache()
