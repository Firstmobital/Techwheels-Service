/**
 * useOfflineSync Hook
 * Orchestrates offline sync operations
 * Monitors queue and syncs when online
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import { syncQueue, SyncStats } from '../lib/syncQueue'
import { useNetworkStatus } from './useNetworkStatus'
import { logEvent, flushPendingLogsToS3 } from '../utils/logger'

export interface SyncState {
  isSyncing: boolean
  lastSyncTime: number | null
  stats: SyncStats
  error: string | null
}

interface SyncHandler {
  handle: (item: any) => Promise<void>
}

export const useOfflineSync = (handlers: Record<string, SyncHandler>) => {
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    lastSyncTime: null,
    stats: { pending: 0, failed: 0, totalRetries: 0 },
    error: null,
  })

  const { isConnected } = useNetworkStatus()
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)

  // Update stats
  const updateStats = useCallback(async () => {
    const stats = await syncQueue.getStats()
    setSyncState(prev => ({ ...prev, stats }))
  }, [])

  // Sync a single item
  const syncItem = useCallback(async (item: any) => {
    try {
      const handler = handlers[item.resource]
      
      if (!handler) {
        logEvent('sync_no_handler', {
          id: item.id,
          resource: item.resource,
        }, 'offline-sync')
        
        await syncQueue.markFailed(
          item.id,
          `No handler for resource: ${item.resource}`,
        )
        return
      }

      await handler.handle(item)
      await syncQueue.dequeue(item.id)
      
      logEvent('sync_success', {
        id: item.id,
        resource: item.resource,
        operation: item.operation,
      }, 'offline-sync')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      if (item.retryCount < item.maxRetries) {
        await syncQueue.retry(item.id)
        logEvent('sync_retry', {
          id: item.id,
          resource: item.resource,
          retry_count: item.retryCount + 1,
          error: errorMessage,
        }, 'offline-sync')
      } else {
        await syncQueue.markFailed(item.id, errorMessage)
        logEvent('sync_failed', {
          id: item.id,
          resource: item.resource,
          max_retries: item.maxRetries,
          error: errorMessage,
        }, 'offline-sync')
      }
    }
  }, [handlers])

  // Sync all pending items
  const performSync = useCallback(async () => {
    if (syncState.isSyncing || !isConnected) {
      return
    }

    try {
      setSyncState(prev => ({ ...prev, isSyncing: true, error: null }))
      
      const queue = await syncQueue.getQueue()
      const pending = queue.filter(item => item.retryCount < item.maxRetries)

      if (pending.length === 0) {
        setSyncState(prev => ({
          ...prev,
          isSyncing: false,
          lastSyncTime: Date.now(),
        }))
        return
      }

      logEvent('sync_start', {
        pending_count: pending.length,
      }, 'offline-sync')

      // Process items sequentially to maintain order
      for (const item of pending) {
        await syncItem(item)
      }

      await updateStats()
      
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        lastSyncTime: Date.now(),
      }))
      
      logEvent('sync_complete', {
        synced_count: pending.length,
      }, 'offline-sync')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      setSyncState(prev => ({
        ...prev,
        isSyncing: false,
        error: errorMessage,
      }))
      
      logEvent('sync_error', {
        error: errorMessage,
      }, 'offline-sync')
    }
  }, [syncState.isSyncing, isConnected, syncItem, updateStats])

  // Auto-sync when online
  useEffect(() => {
    if (isConnected === true) {
      performSync()
    }
  }, [isConnected, performSync])

  // Periodic sync check (every 30 seconds)
  useEffect(() => {
    if (isConnected === true) {
      syncTimerRef.current = setInterval(() => {
        performSync()
      }, 30000)
    } else if (syncTimerRef.current) {
      clearInterval(syncTimerRef.current)
      syncTimerRef.current = null
    }

    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current)
      }
    }
  }, [isConnected, performSync])

  // Subscribe to queue changes
  useEffect(() => {
    updateStats()
    
    unsubscribeRef.current = syncQueue.subscribe(() => {
      updateStats()
    })

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
      }
    }
  }, [updateStats])

  return {
    ...syncState,
    sync: performSync,
  }
}
