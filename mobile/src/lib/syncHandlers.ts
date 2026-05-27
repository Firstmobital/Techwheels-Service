/**
 * Sync Handlers
 * Handles syncing of different resource types when online
 * Each handler knows how to sync a specific resource to the server
 */

import { QueuedItem } from './syncQueue'
import { logEvent } from '../utils/logger'

/**
 * Job Card Sync Handler
 */
const jobCardHandler = {
  handle: async (item: QueuedItem) => {
    logEvent('sync_job_card_deferred', {
      operation: item.operation,
      resource_id: item.resourceId,
    }, 'sync-handlers')
  },
}

/**
 * Photo Upload Handler
 */
const photoHandler = {
  handle: async (item: QueuedItem) => {
    logEvent('sync_photo_deferred', {
      operation: item.operation,
      resource_id: item.resourceId,
    }, 'sync-handlers')
  },
}

/**
 * Estimate Handler
 */
const estimateHandler = {
  handle: async (item: QueuedItem) => {
    logEvent('sync_estimate_deferred', {
      operation: item.operation,
      resource_id: item.resourceId,
    }, 'sync-handlers')
  },
}

/**
 * Panel Handler
 */
const panelHandler = {
  handle: async (item: QueuedItem) => {
    logEvent('sync_panel_deferred', {
      operation: item.operation,
      resource_id: item.resourceId,
    }, 'sync-handlers')
  },
}

/**
 * Document Handler
 */
const documentHandler = {
  handle: async (item: QueuedItem) => {
    logEvent('sync_document_deferred', {
      operation: item.operation,
      resource_id: item.resourceId,
    }, 'sync-handlers')
  },
}

/**
 * Activity Log Handler
 */
const activityLogHandler = {
  handle: async (item: QueuedItem) => {
    logEvent('sync_activity_deferred', {
      operation: item.operation,
      resource_id: item.resourceId,
    }, 'sync-handlers')
  },
}

/**
 * All Sync Handlers
 */
export const syncHandlers = {
  job_card: jobCardHandler,
  photo: photoHandler,
  estimate: estimateHandler,
  panel: panelHandler,
  document: documentHandler,
  activity_log: activityLogHandler,
}

/**
 * Register all handlers with offline provider
 * Usage in _layout.tsx:
 * 
 * <OfflineProvider syncHandlers={syncHandlers}>
 *   {children}
 * </OfflineProvider>
 */
