/**
 * Logger Utility for Mobile App
 * Handles structured event logging and AWS S3 uploads.
 */

import * as Application from 'expo-application'
import Constants from 'expo-constants'
import * as FileSystem from 'expo-file-system'
import * as LegacyFileSystem from 'expo-file-system/legacy'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { uploadFileToS3 } from './s3Upload'

const IS_WEB = Platform.OS === 'web'
const IS_STATIC_WEB_RENDER = IS_WEB && typeof window === 'undefined'
const S3_UPLOAD_RATE_LIMIT_MS = 3000
const EVENT_UPLOAD_DEBOUNCE_MS = 5000

const LOG_DEVICE_ID_KEY = 'tw-log-device-id'
const LOG_DEVICE_ID_FILE = 'log-device-id.txt'
const LOG_S3_OBJECT_KEY = 'tw-log-s3-object-key'

let cachedLogDeviceId: string | null = null
let lastS3UploadTime = 0
let s3UploadThrottleBackoff = 1
let pendingEventUploadTimer: ReturnType<typeof setTimeout> | null = null
let hasLoggedMissingS3Config = false

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

type UploadLogsOptions = {
  emailOverride?: string | null
  reason?: string
}

const sanitizeId = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '-')

const sanitizeEmailForFileName = (email: string) =>
  email
    .trim()
    .toLowerCase()
    .replace('@', '_at_')
    .replace(/[^a-zA-Z0-9._-]/g, '-')

const resolveLogBaseUri = () => {
  try {
    const pathsUri = (FileSystem as unknown as { Paths?: { document?: { uri?: string } } }).Paths?.document?.uri
    if (typeof pathsUri === 'string' && pathsUri.length > 0) {
      return pathsUri
    }
  } catch {
    // Ignore Paths API failures on unsupported runtimes.
  }

  const legacyUri =
    (LegacyFileSystem as unknown as { documentDirectory?: string }).documentDirectory ||
    (FileSystem as unknown as { documentDirectory?: string }).documentDirectory

  if (typeof legacyUri === 'string' && legacyUri.length > 0) {
    return legacyUri
  }

  return 'file:///'
}

const LOG_BASE_URI = resolveLogBaseUri()
const withBaseUri = (fileName: string) =>
  `${LOG_BASE_URI}${LOG_BASE_URI.endsWith('/') ? '' : '/'}${fileName}`

const getDeviceLogFilePath = (deviceId: string) => withBaseUri(`${sanitizeId(deviceId)}-logs.txt`)
const getDeviceIdFilePath = () => withBaseUri(LOG_DEVICE_ID_FILE)

const resolveS3ObjectKey = async (deviceId: string, emailForFileName: string | null) => {
  const existingKey = await SecureStore.getItemAsync(LOG_S3_OBJECT_KEY).catch(() => null)
  if (existingKey && existingKey.trim().length > 0) {
    return sanitizeId(existingKey.trim())
  }

  const key = emailForFileName
    ? `${deviceId}__${sanitizeEmailForFileName(emailForFileName)}.log`
    : `${deviceId}.log`

  const sanitizedKey = sanitizeId(key)
  await SecureStore.setItemAsync(LOG_S3_OBJECT_KEY, sanitizedKey).catch(() => undefined)
  return sanitizedKey
}

const formatAsIST = (inputDate: Date) => {
  const istTime = new Date(inputDate.getTime() + 5.5 * 60 * 60 * 1000)
  const year = istTime.getUTCFullYear()
  const month = String(istTime.getUTCMonth() + 1).padStart(2, '0')
  const date = String(istTime.getUTCDate()).padStart(2, '0')
  const hours = String(istTime.getUTCHours()).padStart(2, '0')
  const minutes = String(istTime.getUTCMinutes()).padStart(2, '0')
  const seconds = String(istTime.getUTCSeconds()).padStart(2, '0')
  const milliseconds = String(istTime.getUTCMilliseconds()).padStart(3, '0')
  return `${year}-${month}-${date}T${hours}:${minutes}:${seconds}.${milliseconds}IST`
}

const getISTTimestamp = () => formatAsIST(new Date())

const getCurrentUserEmail = async (): Promise<string | null> => {
  try {
    const { data, error } = await supabase.auth.getUser()
    if (error || !data?.user?.email) {
      return null
    }
    return sanitizeEmailForFileName(data.user.email)
  } catch {
    return null
  }
}

export const getLogDeviceId = async (): Promise<string> => {
  if (cachedLogDeviceId) {
    return cachedLogDeviceId
  }

  if (IS_STATIC_WEB_RENDER) {
    cachedLogDeviceId = sanitizeId(`web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
    return cachedLogDeviceId
  }

  try {
    const storedId = await SecureStore.getItemAsync(LOG_DEVICE_ID_KEY)
    if (storedId) {
      cachedLogDeviceId = sanitizeId(storedId)
      return cachedLogDeviceId
    }

    const fileStoredId = await LegacyFileSystem.readAsStringAsync(getDeviceIdFilePath()).catch(() => null)
    if (fileStoredId) {
      cachedLogDeviceId = sanitizeId(fileStoredId.trim())
      await SecureStore.setItemAsync(LOG_DEVICE_ID_KEY, cachedLogDeviceId).catch(() => undefined)
      return cachedLogDeviceId
    }

    let nativeId: string | null = null
    try {
      nativeId = Application.getAndroidId()
    } catch {
      nativeId = null
    }
    if (!nativeId) {
      try {
        nativeId = await Application.getIosIdForVendorAsync()
      } catch {
        nativeId = null
      }
    }

    cachedLogDeviceId = sanitizeId(nativeId || `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
    await SecureStore.setItemAsync(LOG_DEVICE_ID_KEY, cachedLogDeviceId).catch(() => undefined)
    await LegacyFileSystem.writeAsStringAsync(getDeviceIdFilePath(), cachedLogDeviceId).catch(() => undefined)
    return cachedLogDeviceId
  } catch {
    cachedLogDeviceId = sanitizeId(`device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`)
    await LegacyFileSystem.writeAsStringAsync(getDeviceIdFilePath(), cachedLogDeviceId).catch(() => undefined)
    return cachedLogDeviceId
  }
}

const getS3Options = () => {
  const extra =
    (Constants.expoConfig?.extra as Record<string, string | undefined>) ||
    (((Constants as unknown as { manifest2?: { extra?: Record<string, string | undefined> } }).manifest2?.extra as Record<string, string | undefined>) || {})

  return {
    bucket: process.env.EXPO_PUBLIC_S3_BUCKET_NAME || extra.s3BucketName,
    region: process.env.EXPO_PUBLIC_AWS_REGION || extra.awsRegion,
    accessKey: process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID || extra.awsAccessKeyId,
    secretKey: process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY || extra.awsSecretAccessKey,
    successActionStatus: 201,
  }
}

export const logToFile = async (message: string, module = 'app', deviceId = 'global') => {
  if (IS_STATIC_WEB_RENDER) {
    return
  }

  const timestamp = getISTTimestamp()
  const logMessage = `[${timestamp}] [${module}] ${message}\n`
  const deviceLogFilePath = getDeviceLogFilePath(deviceId)

  try {
    const existingLogs = await LegacyFileSystem.readAsStringAsync(deviceLogFilePath).catch(() => '')
    await LegacyFileSystem.writeAsStringAsync(deviceLogFilePath, `${existingLogs}${logMessage}`)
  } catch (error) {
    console.error('Failed to write log to file:', error)
  }
}

export const uploadLogsToS3 = async (deviceId: string, options: UploadLogsOptions = {}) => {
  if (IS_STATIC_WEB_RENDER) {
    return
  }

  const now = Date.now()
  const timeSinceLastUpload = now - lastS3UploadTime
  const requiredWaitTime = S3_UPLOAD_RATE_LIMIT_MS * s3UploadThrottleBackoff

  if (timeSinceLastUpload < requiredWaitTime) {
    const waitTime = requiredWaitTime - timeSinceLastUpload
    setTimeout(() => {
      uploadLogsToS3(deviceId, options).catch((error) => {
        console.error('Deferred S3 log upload failed:', error)
      })
    }, waitTime + 100)
    return
  }

  const deviceLogFilePath = getDeviceLogFilePath(deviceId)
  const fallbackLogFilePath = getDeviceLogFilePath('global')
  const deviceLogInfo = await LegacyFileSystem.getInfoAsync(deviceLogFilePath).catch(() => null)
  const fallbackLogInfo = await LegacyFileSystem.getInfoAsync(fallbackLogFilePath).catch(() => null)

  if (!deviceLogInfo?.exists && !fallbackLogInfo?.exists) {
    return
  }

  let logs: string | null = null
  let selectedLogFilePath = deviceLogFilePath

  try {
    logs = await LegacyFileSystem.readAsStringAsync(deviceLogFilePath)
  } catch {
    try {
      logs = await LegacyFileSystem.readAsStringAsync(fallbackLogFilePath)
      selectedLogFilePath = fallbackLogFilePath
    } catch (fallbackError) {
      console.error('Failed to read log file for S3 upload:', fallbackError)
      return
    }
  }

  if (!logs || !logs.trim()) {
    return
  }

  const s3Options = getS3Options()
  if (!s3Options.bucket || !s3Options.region || !s3Options.accessKey || !s3Options.secretKey) {
    if (!hasLoggedMissingS3Config) {
      hasLoggedMissingS3Config = true
      console.warn('S3 logger config missing required values; uploads are disabled for this session', {
        hasBucket: Boolean(s3Options.bucket),
        hasRegion: Boolean(s3Options.region),
        hasAccessKey: Boolean(s3Options.accessKey),
        hasSecretKey: Boolean(s3Options.secretKey),
        reason: options.reason || 'not-set',
      })
    }
    return
  }

  const userEmail = options.emailOverride ? sanitizeEmailForFileName(options.emailOverride) : await getCurrentUserEmail()
  const fileName = await resolveS3ObjectKey(deviceId, userEmail)

  const file = {
    uri: selectedLogFilePath,
    name: fileName,
    type: 'text/plain',
  }

  try {
    lastS3UploadTime = Date.now()
    const response = await uploadFileToS3(file, s3Options)

    if (response.status === 201) {
      s3UploadThrottleBackoff = 1
    } else if (response.status === 503) {
      s3UploadThrottleBackoff = Math.min(s3UploadThrottleBackoff * 2, 16)
    } else {
      console.error('[S3] Upload failed', response)
    }
  } catch (error) {
    console.error('[S3] Upload error', error)
    s3UploadThrottleBackoff = Math.min(s3UploadThrottleBackoff * 1.5, 16)
  }
}

export const flushPendingLogsToS3 = async (options: { reason?: string } = {}) => {
  if (IS_STATIC_WEB_RENDER) {
    return
  }

  try {
    const deviceId = await getLogDeviceId()
    await uploadLogsToS3(deviceId, {
      reason: options.reason || 'startup-flush',
    })
  } catch (error) {
    console.error('flushPendingLogsToS3 failed', error)
  }
}

const scheduleEventLogUpload = (reason = 'event-log') => {
  if (IS_STATIC_WEB_RENDER) {
    return
  }

  if (pendingEventUploadTimer) {
    clearTimeout(pendingEventUploadTimer)
    pendingEventUploadTimer = null
  }

  pendingEventUploadTimer = setTimeout(() => {
    pendingEventUploadTimer = null
    flushPendingLogsToS3({ reason }).catch((error) => {
      console.error('scheduleEventLogUpload failed', error)
    })
  }, EVENT_UPLOAD_DEBOUNCE_MS)
}

export const initializeLogger = async () => {
  if (IS_STATIC_WEB_RENDER) {
    return
  }

  try {
    await getLogDeviceId()
    await cleanupOldLogs()
  } catch (error) {
    console.error('Logger initialization error:', error)
  }
}

// Keep this API unchanged for existing callers.
export const logEvent = (
  eventName: string,
  metadata: LogMetadata = {},
  module: string = 'app',
) => {
  const payload = JSON.stringify({
    eventName,
    metadata,
    module,
    timestamp: new Date().toISOString(),
  })

  if (__DEV__) {
    console.log(`[${module}] ${eventName}`, JSON.stringify(metadata))
  }

  void (async () => {
    const deviceId = await getLogDeviceId()
    await logToFile(`[EVENT: ${eventName}] ${payload}`, module, deviceId)
    scheduleEventLogUpload('event-log')
  })().catch((error) => {
    console.error('logEvent failed:', error)
  })
}

export const getCurrentLogFile = async (): Promise<string | null> => {
  if (IS_STATIC_WEB_RENDER) {
    return null
  }

  try {
    const deviceId = await getLogDeviceId()
    const filePath = getDeviceLogFilePath(deviceId)
    const fileInfo = await LegacyFileSystem.getInfoAsync(filePath)
    if (!fileInfo.exists) {
      return null
    }
    return await LegacyFileSystem.readAsStringAsync(filePath)
  } catch (error) {
    console.error('Error reading log file:', error)
    return null
  }
}

export const cleanupOldLogs = async () => {
  if (IS_STATIC_WEB_RENDER) {
    return
  }

  try {
    const deviceId = await getLogDeviceId()
    const deviceLogFilePath = getDeviceLogFilePath(deviceId)

    const allLogs = await LegacyFileSystem.readAsStringAsync(deviceLogFilePath).catch(() => null)
    if (!allLogs || !allLogs.trim()) {
      return
    }

    const now = new Date()
    const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
    const todayIST = istTime.toISOString().split('T')[0]

    const lines = allLogs.split('\n').filter((line) => {
      if (!line.trim()) {
        return false
      }
      const match = line.match(/\[(\d{4}-\d{2}-\d{2})/)
      const logDate = match ? match[1] : null
      return logDate === todayIST
    })

    const todaysLogs = lines.length > 0 ? `${lines.join('\n')}\n` : ''
    await LegacyFileSystem.writeAsStringAsync(deviceLogFilePath, todaysLogs)
  } catch (error) {
    console.error('Error cleaning up old logs:', error)
  }
}

export const getDeviceId = (): string => {
  return cachedLogDeviceId || 'unknown'
}

export const getLogStats = async () => {
  if (IS_STATIC_WEB_RENDER) {
    return {
      files: 0,
      totalSize: 0,
      bufferSize: 0,
      deviceId: cachedLogDeviceId || 'unknown',
    }
  }

  try {
    const deviceId = await getLogDeviceId()
    const filePath = getDeviceLogFilePath(deviceId)
    const fileInfo = await LegacyFileSystem.getInfoAsync(filePath)
    const totalSize = fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number' ? fileInfo.size : 0

    return {
      files: fileInfo.exists ? 1 : 0,
      totalSize,
      bufferSize: 0,
      deviceId,
    }
  } catch (error) {
    console.error('Error getting log stats:', error)
    return {
      files: 0,
      totalSize: 0,
      bufferSize: 0,
      deviceId: cachedLogDeviceId || 'unknown',
    }
  }
}

void initializeLogger().catch(console.error)
