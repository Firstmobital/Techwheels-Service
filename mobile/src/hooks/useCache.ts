/**
 * Cache Hooks
 * Utility hooks for common caching patterns
 */

import { useCallback } from 'react'
import { useOffline } from '../context/OfflineContext'
import { logEvent } from '../utils/logger'

/**
 * useCachedData
 * Hook for fetching data with caching support
 */
export const useCachedData = <T,>(
  key: string,
  fetchFn: () => Promise<T>,
  options?: {
    ttl?: number
    dependencies?: unknown[]
  },
) => {
  const { cacheGet, cacheSet } = useOffline()

  const fetch = useCallback(async (): Promise<T> => {
    try {
      // Try to get from cache first
      const cached = await cacheGet<T>(key)
      if (cached) {
        logEvent('cache_hit_used', { key }, 'cache-hooks')
        return cached
      }

      // Fetch fresh data
      const data = await fetchFn()

      // Cache it
      await cacheSet(key, data, options?.ttl)

      logEvent('cache_populated', { key, ttl: options?.ttl }, 'cache-hooks')
      return data
    } catch (error) {
      logEvent('cache_fetch_error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'cache-hooks')
      throw error
    }
  }, [key, fetchFn, options?.ttl, cacheGet, cacheSet])

  return { fetch }
}

/**
 * useListCache
 * Hook for caching list data
 */
export const useListCache = <T,>(
  resource: string,
  fetchFn: () => Promise<T[]>,
  options?: {
    ttl?: number
  },
) => {
  const key = `list_${resource}`
  return useCachedData(key, fetchFn, {
    ttl: options?.ttl ?? 5 * 60 * 1000, // 5 minutes default
  })
}

/**
 * useItemCache
 * Hook for caching individual items
 */
export const useItemCache = <T,>(
  resource: string,
  id: string,
  fetchFn: () => Promise<T>,
  options?: {
    ttl?: number
  },
) => {
  const key = `item_${resource}_${id}`
  return useCachedData(key, fetchFn, {
    ttl: options?.ttl ?? 10 * 60 * 1000, // 10 minutes default
  })
}

/**
 * useCacheInvalidation
 * Hook for invalidating cache
 */
export const useCacheInvalidation = () => {
  const { cacheClear } = useOffline()

  return {
    clear: cacheClear,
  }
}
