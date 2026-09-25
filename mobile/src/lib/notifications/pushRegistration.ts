import Constants from 'expo-constants'
import * as Device from 'expo-device'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { supabase } from '../supabase'

const ENABLED_KEY = 'staff_push_enabled'
let androidChannelConfigured = false
let lastDeviceToken = ''

function isLikelyFcmToken(token: string) {
  return typeof token === 'string' && token.length > 40 && token.includes(':')
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
})

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android' || androidChannelConfigured) return
  await Notifications.setNotificationChannelAsync('default', {
    name: 'default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1d4ed8',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  })
  androidChannelConfigured = true
}

export function currentDeviceToken() {
  return lastDeviceToken
}

export async function readStaffPushEnabled(): Promise<boolean> {
  try {
    const { safeStorage } = await import('../storageHelper')
    const stored = await safeStorage.getItem(ENABLED_KEY)
    return stored !== 'false'
  } catch {
    return true
  }
}

export async function writeStaffPushEnabled(enabled: boolean) {
  const { safeStorage } = await import('../storageHelper')
  await safeStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false')
}

async function collectDeviceToken(): Promise<{
  token: string
  provider: 'fcm' | 'expo'
  platform: 'ios' | 'android'
} | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null

  await ensureAndroidChannel()
  const current = await Notifications.getPermissionsAsync()
  let status = current.status
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status
  }
  if (status !== 'granted') return null

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    undefined

  if (Platform.OS === 'android') {
    try {
      const native = await Notifications.getDevicePushTokenAsync()
      const token = typeof native?.data === 'string' ? native.data : ''
      if (isLikelyFcmToken(token)) {
        return { token, provider: 'fcm', platform: 'android' }
      }
    } catch {
      // Fall through to the Expo token.
    }
  }

  const expo = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)
  const token = expo?.data || ''
  if (!token) return null
  return { token, provider: 'expo', platform: Platform.OS }
}

function appVersion() {
  return Constants.expoConfig?.version || Constants.nativeAppVersion || null
}

export async function registerStaffPush() {
  const collected = await collectDeviceToken()
  if (!collected) return { ok: false as const }
  lastDeviceToken = collected.token
  const { error } = await supabase.rpc('register_staff_device_token', {
    p_device_token: collected.token,
    p_token_provider: collected.provider,
    p_token_platform: collected.platform,
    p_app_version: appVersion(),
  })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export async function deactivateStaffPush() {
  if (!lastDeviceToken) return
  const token = lastDeviceToken
  lastDeviceToken = ''
  await supabase.rpc('deactivate_staff_device_token', { p_device_token: token })
}

export async function registerCustomerPush(sessionToken: string) {
  const collected = await collectDeviceToken()
  if (!collected) return { ok: false as const }
  lastDeviceToken = collected.token
  const { error } = await supabase.rpc('customer_register_device_token', {
    p_session_token: sessionToken,
    p_device_token: collected.token,
    p_token_provider: collected.provider,
    p_token_platform: collected.platform,
    p_app_version: appVersion(),
  })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export async function deactivateCustomerPush(sessionToken: string) {
  if (!lastDeviceToken) return
  const token = lastDeviceToken
  lastDeviceToken = ''
  await supabase.rpc('customer_deactivate_device_token', {
    p_session_token: sessionToken,
    p_device_token: token,
  })
}

export async function staffPushPermissionGranted() {
  if (Platform.OS === 'web') return false
  const current = await Notifications.getPermissionsAsync()
  return current.status === 'granted'
}
