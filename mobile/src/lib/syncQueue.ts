/**
 * Sync Queue Manager
 * Manages pending operations that need to sync with the server
 * Ensures reliable delivery and retry logic
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { logEvent } from '../utils/logger'

export type SyncOperation = 'create' | 'update' | 'delete' | 'upload'

export interface QueuedItem<T = unknown> {
  id: string
  operation: SyncOperation
  resource: string // e.g., 'job_card', 'photo', 'estimate'
  data: T
  resourceId?: string // ID of the resource being operated on
  timestamp: number
  retryCount: number
  maxRetries: number
  lastError?: string
  priority: number // Higher = more urgent
}

export interface SyncStats {
  pending: number
  failed: number
  totalRetries: number
}

const QUEUE_KEY = 'tw_sync_queue'
const QUEUE_STATS_KEY = 'tw_sync_stats'

class SyncQueue {
  private listeners: Set<() => void> = new Set()

  /**
   * Add an item to the sync queue
   */
  async enqueue<T>(
    operation: SyncOperation,
    resource: string,
    data: T,
    options?: {
      resourceId?: string
      maxRetries?: number
      priority?: number
    },
  ): Promise<string> {
    try {
      const id = `${resource}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      const item: QueuedItem<T> = {
        id,
        operation,
        resource,
        data,
        resourceId: options?.resourceId,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: options?.maxRetries ?? 5,
        priority: options?.priority ?? 0,
      }
      
      const queue = await this.getQueue()
      queue.push(item)
      
      // Sort by priority (descending) and timestamp (ascending)
      queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority
        }
        return a.timestamp - b.timestamp
      })
      
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
      
      logEvent('queue_enqueued', {
        id,
        operation,
        resource,
        total_pending: queue.length,
      }, 'sync-queue')
      
      this.notifyListeners()
      return id
    } catch (error) {
      logEvent('queue_enqueue_error', {
        operation,
        resource,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'sync-queue')
      throw error
    }
  }

  /**
   * Get all queued items
   */
  async getQueue(): Promise<QueuedItem[]> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      logEvent('queue_read_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'sync-queue')
      return []
    }
  }

  /**
   * Get items of a specific resource type
   */
  async getByResource(resource: string): Promise<QueuedItem[]> {
    const queue = await this.getQueue()
    return queue.filter(item => item.resource === resource)
  }

  /**
   * Get items by resource ID
   */
  async getByResourceId(resourceId: string): Promise<QueuedItem[]> {
    const queue = await this.getQueue()
    return queue.filter(item => item.resourceId === resourceId)
  }

  /**
   * Remove an item from the queue
   */
  async dequeue(id: string): Promise<void> {
    try {
      const queue = await this.getQueue()
      const filtered = queue.filter(item => item.id !== id)
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(filtered))
      
      logEvent('queue_dequeued', {
        id,
        remaining: filtered.length,
      }, 'sync-queue')
      
      this.notifyListeners()
    } catch (error) {
      logEvent('queue_dequeue_error', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'sync-queue')
    }
  }

  /**
   * Retry a failed item
   */
  async retry(id: string): Promise<void> {
    try {
      const queue = await this.getQueue()
      const item = queue.find(i => i.id === id)
      
      if (item && item.retryCount < item.maxRetries) {
        item.retryCount++
        item.lastError = undefined
        
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
        
        logEvent('queue_retry', {
          id,
          retry_count: item.retryCount,
          max_retries: item.maxRetries,
        }, 'sync-queue')
        
        this.notifyListeners()
      }
    } catch (error) {
      logEvent('queue_retry_error', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'sync-queue')
    }
  }

  /**
   * Mark item as failed with error message
   */
  async markFailed(id: string, error: string): Promise<void> {
    try {
      const queue = await this.getQueue()
      const item = queue.find(i => i.id === id)
      
      if (item) {
        item.lastError = error
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
        
        logEvent('queue_mark_failed', {
          id,
          error,
          retry_count: item.retryCount,
        }, 'sync-queue')
        
        this.notifyListeners()
      }
    } catch (error) {
      logEvent('queue_mark_failed_error', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'sync-queue')
    }
  }

  /**
   * Clear all queued items
   */
  async clear(): Promise<void> {
    try {
      await AsyncStorage.removeItem(QUEUE_KEY)
      logEvent('queue_clear_all', {}, 'sync-queue')
      this.notifyListeners()
    } catch (error) {
      logEvent('queue_clear_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'sync-queue')
    }
  }

  /**
   * Get sync statistics
   */
  async getStats(): Promise<SyncStats> {
    try {
      const queue = await this.getQueue()
      const pending = queue.filter(item => item.retryCount < item.maxRetries).length
      const failed = queue.filter(item => item.retryCount >= item.maxRetries).length
      const totalRetries = queue.reduce((sum, item) => sum + item.retryCount, 0)
      
      return { pending, failed, totalRetries }
    } catch (error) {
      logEvent('queue_stats_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'sync-queue')
      
      return { pending: 0, failed: 0, totalRetries: 0 }
    }
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }
}

export const syncQueue = new SyncQueue()
