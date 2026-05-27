/**
 * Background Sync Manager
 * Uses expo-background-fetch and expo-task-manager for background sync
 * Handles periodic sync when app is in background
 */

import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import { syncQueue } from './syncQueue'
import { logEvent, flushPendingLogsToS3 } from '../utils/logger'

const BACKGROUND_SYNC_TASK = 'techwheels-background-sync'

export interface BackgroundSyncConfig {
  minimumInterval: number // Minimum interval in seconds (15 is minimum on iOS)
  handlers: Record<string, (item: any) => Promise<void>>
}

let isBackgroundSyncRegistered = false

/**
 * Initialize background sync task
 */
export const initializeBackgroundSync = async (config: BackgroundSyncConfig) => {
  try {
    // Define the task
    TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
      try {
        logEvent('background_sync_triggered', {}, 'background-sync')

        const queue = await syncQueue.getQueue()
        const pending = queue.filter(item => item.retryCount < item.maxRetries)

        if (pending.length === 0) {
          return BackgroundFetch.BackgroundFetchResult.NoData
        }

        let syncedCount = 0

        for (const item of pending) {
          try {
            const handler = config.handlers[item.resource]
            if (handler) {
              await handler(item)
              await syncQueue.dequeue(item.id)
              syncedCount++
            }
          } catch (error) {
            logEvent('background_sync_item_error', {
              resource: item.resource,
              id: item.id,
              error: error instanceof Error ? error.message : 'Unknown error',
            }, 'background-sync')
          }
        }

        logEvent('background_sync_complete', {
          synced_count: syncedCount,
          total_pending: pending.length,
        }, 'background-sync')

        // Flush logs before task completes
        await flushPendingLogsToS3({
          reason: 'background-sync-complete',
        })

        return syncedCount > 0
          ? BackgroundFetch.BackgroundFetchResult.NewData
          : BackgroundFetch.BackgroundFetchResult.NoData
      } catch (error) {
        logEvent('background_sync_error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'background-sync')

        await flushPendingLogsToS3({
          reason: 'background-sync-error',
        })

        return BackgroundFetch.BackgroundFetchResult.Failed
      }
    })

    // Register the task
    await BackgroundFetch.registerTaskAsync(BACKGROUND_SYNC_TASK, {
      minimumInterval: Math.max(config.minimumInterval, 15), // Min 15 seconds on iOS
      stopOnTerminate: false,
      startOnBoot: true,
    })

    isBackgroundSyncRegistered = true

    logEvent('background_sync_registered', {
      interval: config.minimumInterval,
    }, 'background-sync')

    return true
  } catch (error) {
    logEvent('background_sync_registration_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'background-sync')

    return false
  }
}

/**
 * Unregister background sync task
 */
export const unregisterBackgroundSync = async () => {
  try {
    if (isBackgroundSyncRegistered) {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_SYNC_TASK)
      isBackgroundSyncRegistered = false

      logEvent('background_sync_unregistered', {}, 'background-sync')
    }
  } catch (error) {
    logEvent('background_sync_unregister_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'background-sync')
  }
}

/**
 * Check if background sync is registered
 */
export const isBackgroundSyncActive = (): boolean => {
  return isBackgroundSyncRegistered
}

/**
 * Manually trigger background sync (for testing)
 */
export const triggerBackgroundSync = async () => {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_SYNC_TASK)
    logEvent('background_sync_manual_trigger', {
      task_registered: isRegistered,
    }, 'background-sync')
  } catch (error) {
    logEvent('background_sync_manual_trigger_error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 'background-sync')
  }
}
