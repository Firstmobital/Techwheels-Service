/**
 * Logger Utility for Mobile App
 * Handles structured event logging, local storage, and S3 uploads
 * Reference: Mobile Debug Logging Playbook
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as FileSystem from 'expo-file-system/legacy'
import * as Device from 'expo-device'
import { supabase } from '../lib/supabase'

// Local log file configuration
const LOGS_DIR = `${FileSystem.documentDirectory}logs`
const LOGS_KEY = 'tw_logs_metadata'
const MAX_LOCAL_LOG_SIZE = 5 * 1024 * 1024 // 5MB max local log file
const BATCH_UPLOAD_SIZE = 100 // Upload every 100 events

export interface LogMetadata {
  stage?: string
  duration_ms?: number
  error_code?: string
  error_message?: string
  employee_id?: string
  provider?: string
  token_prefix?: string
  [key: string]: unknown
}

interface LogEntry {
  timestamp: string
  eventName: string
  metadata: LogMetadata
  module: string
  deviceId: string
}

let deviceId: string | null = null
let logBuffer: LogEntry[] = []
let isUploading = false
const FILE_LOGGING_ENABLED = false

/**
 * Initialize logger
 */
export const initializeLogger = async () => {
  try {
    // Get or create device ID
    const stored = await AsyncStorage.getItem('tw_device_id')
    if (stored) {
      deviceId = stored
    } else {
      deviceId = `device_${Date.now()}`
      await AsyncStorage.setItem('tw_device_id', deviceId)
    }

    if (FILE_LOGGING_ENABLED) {
      // Create logs directory if it doesn't exist
      const dirInfo = await FileSystem.getInfoAsync(LOGS_DIR)
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(LOGS_DIR, { intermediates: true })
      }

      // Cleanup old logs (keep only today's IST logs)
      await cleanupOldLogs()
    }
  } catch (error) {
    console.error('Logger initialization error:', error)
  }
}

/**
 * Main logging function
 */
export const logEvent = (
  eventName: string,
  metadata: LogMetadata = {},
  module: string = 'app',
) => {
  if (!deviceId) {
    console.warn('Logger not initialized, initializing now...')
    initializeLogger()
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    eventName,
    metadata,
    module,
    deviceId: deviceId || 'unknown',
  }

  logBuffer.push(entry)

  // Log to console in development
  if (__DEV__) {
    console.log(
      `[${entry.module}] ${entry.eventName}`,
      JSON.stringify(metadata),
    )
  }

  // Auto-flush if buffer reaches batch size
  if (logBuffer.length >= BATCH_UPLOAD_SIZE) {
    flushPendingLogsToS3({ reason: 'batch-full' }).catch(console.error)
  }
}

/**
 * Write logs to local file
 */
const writeLogsToFile = async (entries: LogEntry[]) => {
  if (!FILE_LOGGING_ENABLED) {
    return
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const fileName = `${deviceId}__${today}.log`
    const filePath = `${LOGS_DIR}/${fileName}`

    // Format logs as newline-delimited JSON
    const logLines = entries.map(entry => JSON.stringify(entry)).join('\n')

    // Check file size
    const fileInfo = await FileSystem.getInfoAsync(filePath)
    if (fileInfo.exists && fileInfo.size && fileInfo.size > MAX_LOCAL_LOG_SIZE) {
      // Archive old file
      const archiveName = `${deviceId}__${today}__${Date.now()}.log.archive`
      await FileSystem.moveAsync({
        from: filePath,
        to: `${LOGS_DIR}/${archiveName}`,
      })
    }

    const existing = fileInfo.exists
      ? await FileSystem.readAsStringAsync(filePath)
      : ''

    await FileSystem.writeAsStringAsync(
      filePath,
      `${existing}${logLines}\n`,
    )
  } catch (error) {
    console.error('Error writing logs to file:', error)
  }
}

/**
 * Flush pending logs to S3
 */
export const flushPendingLogsToS3 = async (options?: { reason?: string }) => {
  if (isUploading || logBuffer.length === 0 || !deviceId) {
    return
  }

  try {
    isUploading = true

    // Write to local file first
    await writeLogsToFile(logBuffer)

    // Try to upload to S3 via Supabase Storage
    const today = new Date().toISOString().split('T')[0]
    const objectName = `${deviceId}__${today}.log`

    const logsContent = logBuffer.map(entry => JSON.stringify(entry)).join('\n')

    // Upload to Supabase Storage (logs bucket)
    const { error: uploadError } = await supabase.storage
      .from('logs')
      .upload(objectName, logsContent, {
        cacheControl: '3600',
        upsert: true,
      })

    if (uploadError) {
      console.warn('Error uploading logs to S3:', uploadError)
    } else {
      logBuffer = []
      console.log(`[Logger] Flushed ${logBuffer.length} logs to S3`)
    }
  } catch (error) {
    console.error('Error flushing logs to S3:', error)
  } finally {
    isUploading = false
  }
}

/**
 * Get current log file
 */
export const getCurrentLogFile = async (): Promise<string | null> => {
  if (!FILE_LOGGING_ENABLED) {
    return null
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const fileName = `${deviceId}__${today}.log`
    const filePath = `${LOGS_DIR}/${fileName}`

    const fileInfo = await FileSystem.getInfoAsync(filePath)
    if (fileInfo.exists) {
      return await FileSystem.readAsStringAsync(filePath)
    }
  } catch (error) {
    console.error('Error reading log file:', error)
  }

  return null
}

/**
 * Cleanup old log files (keep only today's IST logs)
 */
export const cleanupOldLogs = async () => {
  if (!FILE_LOGGING_ENABLED) {
    return
  }

  try {
    const today = new Date().toISOString().split('T')[0]
    const files = await FileSystem.readDirectoryAsync(LOGS_DIR)

    for (const file of files) {
      // Keep only today's logs and archives from today
      if (
        !file.includes(today) &&
        !file.endsWith('.archive')
      ) {
        await FileSystem.deleteAsync(`${LOGS_DIR}/${file}`)
      }
    }
  } catch (error) {
    console.error('Error cleaning up old logs:', error)
  }
}

/**
 * Get device ID
 */
export const getDeviceId = (): string => {
  return deviceId || 'unknown'
}

/**
 * Get log statistics
 */
export const getLogStats = async () => {
  if (!FILE_LOGGING_ENABLED) {
    return {
      files: 0,
      totalSize: 0,
      bufferSize: logBuffer.length,
      deviceId: deviceId || 'unknown',
    }
  }

  try {
    const files = await FileSystem.readDirectoryAsync(LOGS_DIR)
    let totalSize = 0

    for (const file of files) {
      const fileInfo = await FileSystem.getInfoAsync(`${LOGS_DIR}/${file}`)
      if (fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number') {
        totalSize += fileInfo.size
      }
    }

    return {
      files: files.length,
      totalSize,
      bufferSize: logBuffer.length,
      deviceId: deviceId || 'unknown',
    }
  } catch (error) {
    console.error('Error getting log stats:', error)
    return {
      files: 0,
      totalSize: 0,
      bufferSize: logBuffer.length,
      deviceId: deviceId || 'unknown',
    }
  }
}

// Initialize on import
initializeLogger().catch(console.error)
