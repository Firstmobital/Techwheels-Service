/**
 * Offline Storage Layer
 * Manages AsyncStorage for caching frequently accessed data
 * Provides a key-value store with TTL (Time To Live) support
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { logEvent } from '../utils/logger'

export interface CacheEntry<T> {
  data: T
  timestamp: number
  ttl?: number // Time to live in milliseconds
}

export interface CacheStats {
  size: number
  entries: number
  expired: number
}

const CACHE_PREFIX = 'tw_cache_'
const CACHE_STATS_KEY = `${CACHE_PREFIX}stats`
const CACHE_METADATA_KEY = `${CACHE_PREFIX}metadata`

class OfflineStorage {
  /**
   * Set a value in AsyncStorage with optional TTL
   */
  async set<T>(
    key: string,
    value: T,
    ttl?: number, // TTL in milliseconds, undefined = no expiry
  ): Promise<void> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`
      const entry: CacheEntry<T> = {
        data: value,
        timestamp: Date.now(),
        ttl,
      }
      
      await AsyncStorage.setItem(cacheKey, JSON.stringify(entry))
      
      logEvent('cache_set', {
        key,
        ttl: ttl ? `${ttl}ms` : 'no_expiry',
        size_kb: JSON.stringify(entry).length / 1024,
      }, 'offline-storage')
    } catch (error) {
      logEvent('cache_set_error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'offline-storage')
      throw error
    }
  }

  /**
   * Get a value from AsyncStorage, checking TTL
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`
      const stored = await AsyncStorage.getItem(cacheKey)
      
      if (!stored) {
        logEvent('cache_miss', { key }, 'offline-storage')
        return null
      }

      const entry: CacheEntry<T> = JSON.parse(stored)
      
      // Check if entry has expired
      if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
        await this.delete(key)
        logEvent('cache_expired', { key, age_ms: Date.now() - entry.timestamp }, 'offline-storage')
        return null
      }

      logEvent('cache_hit', { key, age_ms: Date.now() - entry.timestamp }, 'offline-storage')
      return entry.data
    } catch (error) {
      logEvent('cache_get_error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'offline-storage')
      return null
    }
  }

  /**
   * Get multiple values
   */
  async getMultiple<T>(keys: string[]): Promise<Record<string, T | null>> {
    const result: Record<string, T | null> = {}
    
    for (const key of keys) {
      result[key] = await this.get<T>(key)
    }
    
    return result
  }

  /**
   * Delete a value
   */
  async delete(key: string): Promise<void> {
    try {
      const cacheKey = `${CACHE_PREFIX}${key}`
      await AsyncStorage.removeItem(cacheKey)
      logEvent('cache_delete', { key }, 'offline-storage')
    } catch (error) {
      logEvent('cache_delete_error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'offline-storage')
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys()
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX))
      await AsyncStorage.multiRemove(cacheKeys)
      logEvent('cache_clear_all', { cleared_count: cacheKeys.length }, 'offline-storage')
    } catch (error) {
      logEvent('cache_clear_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'offline-storage')
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const keys = await AsyncStorage.getAllKeys()
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX) && !k.includes('stats'))
      
      let totalSize = 0
      let expiredCount = 0
      
      for (const key of cacheKeys) {
        const stored = await AsyncStorage.getItem(key)
        if (stored) {
          totalSize += stored.length
          
          try {
            const entry = JSON.parse(stored) as CacheEntry<unknown>
            if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
              expiredCount++
            }
          } catch {
            // Skip invalid entries
          }
        }
      }
      
      return {
        size: totalSize,
        entries: cacheKeys.length,
        expired: expiredCount,
      }
    } catch (error) {
      logEvent('cache_stats_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'offline-storage')
      
      return {
        size: 0,
        entries: 0,
        expired: 0,
      }
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanupExpired(): Promise<number> {
    try {
      const keys = await AsyncStorage.getAllKeys()
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX) && !k.includes('stats'))
      
      let cleanedCount = 0
      
      for (const cacheKey of cacheKeys) {
        const stored = await AsyncStorage.getItem(cacheKey)
        if (stored) {
          try {
            const entry = JSON.parse(stored) as CacheEntry<unknown>
            if (entry.ttl && Date.now() - entry.timestamp > entry.ttl) {
              await AsyncStorage.removeItem(cacheKey)
              cleanedCount++
            }
          } catch {
            // Skip invalid entries
          }
        }
      }
      
      logEvent('cache_cleanup', { cleaned_count: cleanedCount }, 'offline-storage')
      return cleanedCount
    } catch (error) {
      logEvent('cache_cleanup_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'offline-storage')
      return 0
    }
  }
}

export const offlineStorage = new OfflineStorage()
