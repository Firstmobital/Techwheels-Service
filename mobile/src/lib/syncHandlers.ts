/**
 * Sync Handlers
 * Handles syncing of different resource types when online
 * Each handler knows how to sync a specific resource to the server
 */

import { QueuedItem } from './syncQueue'
import * as api from './api'
import { logEvent } from '../utils/logger'

/**
 * Job Card Sync Handler
 */
const jobCardHandler = {
  handle: async (item: QueuedItem) => {
    try {
      if (item.operation === 'create') {
        const result = await api.jobCards.create(item.data as any)
        logEvent('sync_job_card_created', {
          resource_id: result.id,
        }, 'sync-handlers')
      } else if (item.operation === 'update' && item.resourceId) {
        await api.jobCards.update(item.resourceId, item.data as any)
        logEvent('sync_job_card_updated', {
          resource_id: item.resourceId,
        }, 'sync-handlers')
      } else if (item.operation === 'delete' && item.resourceId) {
        await api.jobCards.delete(item.resourceId)
        logEvent('sync_job_card_deleted', {
          resource_id: item.resourceId,
        }, 'sync-handlers')
      }
    } catch (error) {
      throw error
    }
  },
}

/**
 * Photo Upload Handler
 */
const photoHandler = {
  handle: async (item: QueuedItem) => {
    try {
      if (item.operation === 'upload') {
        const photoData = item.data as any
        const result = await api.photos.upload(
          photoData.jobCardId,
          photoData.photoPath,
          photoData.panelId,
        )
        logEvent('sync_photo_uploaded', {
          resource_id: result.id,
          job_card_id: photoData.jobCardId,
          size_kb: photoData.sizeKb,
        }, 'sync-handlers')
      }
    } catch (error) {
      throw error
    }
  },
}

/**
 * Estimate Handler
 */
const estimateHandler = {
  handle: async (item: QueuedItem) => {
    try {
      if (item.operation === 'create') {
        const result = await api.estimate.create(item.data as any)
        logEvent('sync_estimate_created', {
          resource_id: result.id,
        }, 'sync-handlers')
      } else if (item.operation === 'update' && item.resourceId) {
        await api.estimate.update(item.resourceId, item.data as any)
        logEvent('sync_estimate_updated', {
          resource_id: item.resourceId,
        }, 'sync-handlers')
      }
    } catch (error) {
      throw error
    }
  },
}

/**
 * Panel Handler
 */
const panelHandler = {
  handle: async (item: QueuedItem) => {
    try {
      if (item.operation === 'create') {
        const result = await api.panels.create(item.data as any)
        logEvent('sync_panel_created', {
          resource_id: result.id,
        }, 'sync-handlers')
      } else if (item.operation === 'update' && item.resourceId) {
        await api.panels.update(item.resourceId, item.data as any)
        logEvent('sync_panel_updated', {
          resource_id: item.resourceId,
        }, 'sync-handlers')
      }
    } catch (error) {
      throw error
    }
  },
}

/**
 * Document Handler
 */
const documentHandler = {
  handle: async (item: QueuedItem) => {
    try {
      if (item.operation === 'upload') {
        const docData = item.data as any
        const result = await api.documents.upload(
          docData.jobCardId,
          docData.documentPath,
          docData.documentType,
        )
        logEvent('sync_document_uploaded', {
          resource_id: result.id,
          job_card_id: docData.jobCardId,
          type: docData.documentType,
        }, 'sync-handlers')
      }
    } catch (error) {
      throw error
    }
  },
}

/**
 * Activity Log Handler
 */
const activityLogHandler = {
  handle: async (item: QueuedItem) => {
    try {
      if (item.operation === 'create') {
        const result = await api.activityLog.create(item.data as any)
        logEvent('sync_activity_logged', {
          resource_id: result.id,
        }, 'sync-handlers')
      }
    } catch (error) {
      throw error
    }
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
