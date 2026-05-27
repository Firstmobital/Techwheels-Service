/**
 * Offline Context Provider
 * Manages offline state and provides offline utilities to the app
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useNetworkStatus, checkNetworkConnectivity } from '../hooks/useNetworkStatus'
import { offlineStorage } from '../lib/offlineStorage'
import { syncQueue, QueuedItem } from '../lib/syncQueue'
import {
  initializeBackgroundSync,
  unregisterBackgroundSync,
  isBackgroundSyncActive,
} from '../lib/backgroundSync'
import { logEvent } from '../utils/logger'

export interface OfflineContextValue {
  // Network status
  isOnline: boolean | null
  networkType: string
  isMeteredConnection: boolean | null
  
  // Offline storage
  cacheSet: <T>(key: string, value: T, ttl?: number) => Promise<void>
  cacheGet: <T>(key: string) => Promise<T | null>
  cacheClear: () => Promise<void>
  
  // Sync queue
  getQueuedItems: () => Promise<QueuedItem[]>
  enqueueSync: <T>(
    operation: string,
    resource: string,
    data: T,
    options?: { resourceId?: string; priority?: number },
  ) => Promise<string>
  
  // Stats
  pendingSync: number
  failedSync: number
  totalCacheSize: number
  
  // Background sync
  isBackgroundSyncActive: boolean
  setupBackgroundSync: (handlers: Record<string, (item: any) => Promise<void>>) => Promise<void>
}

const OfflineContext = createContext<OfflineContextValue | undefined>(undefined)

interface OfflineProviderProps {
  children: React.ReactNode
  syncHandlers?: Record<string, (item: any) => Promise<void>>
}

export const OfflineProvider: React.FC<OfflineProviderProps> = ({
  children,
  syncHandlers = {},
}) => {
  const networkStatus = useNetworkStatus()
  const [stats, setStats] = useState({
    pendingSync: 0,
    failedSync: 0,
    totalCacheSize: 0,
  })
  const [bgSyncActive, setBgSyncActive] = useState(isBackgroundSyncActive())

  // Update stats
  const updateStats = useCallback(async () => {
    try {
      const syncStats = await syncQueue.getStats()
      const cacheStats = await offlineStorage.getStats()

      setStats({
        pendingSync: syncStats.pending,
        failedSync: syncStats.failed,
        totalCacheSize: cacheStats.size,
      })
    } catch (error) {
      logEvent('offline_context_stats_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'offline-context')
    }
  }, [])

  // Setup background sync
  const setupBackgroundSync = useCallback(
    async (handlers: Record<string, (item: any) => Promise<void>>) => {
      try {
        const success = await initializeBackgroundSync({
          minimumInterval: 300, // 5 minutes
          handlers,
        })

        if (success) {
          setBgSyncActive(true)
          logEvent('offline_context_bg_sync_setup', {}, 'offline-context')
        }
      } catch (error) {
        logEvent('offline_context_bg_sync_error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'offline-context')
      }
    },
    [],
  )

  // Update stats on mount and periodically
  useEffect(() => {
    updateStats()
    const interval = setInterval(updateStats, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [updateStats])

  // Subscribe to sync queue changes
  useEffect(() => {
    const unsubscribe = syncQueue.subscribe(() => {
      updateStats()
    })

    return () => unsubscribe()
  }, [updateStats])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unregisterBackgroundSync()
    }
  }, [])

  // Log network status changes
  useEffect(() => {
    if (networkStatus.isConnected === true) {
      logEvent('offline_context_online', {
        network_type: networkStatus.type,
      }, 'offline-context')
    } else if (networkStatus.isConnected === false) {
      logEvent('offline_context_offline', {
        network_type: networkStatus.type,
      }, 'offline-context')
    }
  }, [networkStatus.isConnected, networkStatus.type])

  const value: OfflineContextValue = {
    // Network status
    isOnline: networkStatus.isConnected,
    networkType: networkStatus.type,
    isMeteredConnection: networkStatus.ismetered,

    // Offline storage
    cacheSet: offlineStorage.set.bind(offlineStorage),
    cacheGet: offlineStorage.get.bind(offlineStorage),
    cacheClear: offlineStorage.clear.bind(offlineStorage),

    // Sync queue
    getQueuedItems: syncQueue.getQueue.bind(syncQueue),
    enqueueSync: syncQueue.enqueue.bind(syncQueue),

    // Stats
    pendingSync: stats.pendingSync,
    failedSync: stats.failedSync,
    totalCacheSize: stats.totalCacheSize,

    // Background sync
    isBackgroundSyncActive: bgSyncActive,
    setupBackgroundSync,
  }

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  )
}

/**
 * Hook to use offline context
 */
export const useOffline = (): OfflineContextValue => {
  const context = useContext(OfflineContext)

  if (!context) {
    throw new Error('useOffline must be used within OfflineProvider')
  }

  return context
}
