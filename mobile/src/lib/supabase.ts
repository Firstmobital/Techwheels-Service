import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { resolveSupabaseCredentials } from './supabaseConfig'

const extra =
  (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
  ?? (Constants.manifest2?.extra as Record<string, unknown> | undefined)
  ?? {}

const extraSupabaseUrl = typeof extra.supabaseUrl === 'string' ? extra.supabaseUrl : undefined
const extraSupabaseAnonKey = typeof extra.supabaseAnonKey === 'string' ? extra.supabaseAnonKey : undefined

const resolved = resolveSupabaseCredentials({
  envUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  envAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  extraUrl: extraSupabaseUrl,
  extraAnonKey: extraSupabaseAnonKey,
})

const supabaseUrl = resolved.url
const supabaseAnonKey = resolved.anonKey
const hasSupabaseEnv = resolved.fromEnv || Boolean(supabaseUrl && supabaseAnonKey)

if (!resolved.fromEnv) {
  console.warn('[supabase] Using embedded production Supabase URL (set EXPO_PUBLIC_SUPABASE_* in EAS for custom projects)')
}

const isStaticWebRender = Platform.OS === 'web' && typeof window === 'undefined'

const AUTH_FETCH_TIMEOUT_MS = 25000

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const outerSignal = init?.signal
  if (outerSignal) {
    if (outerSignal.aborted) {
      controller.abort(outerSignal.reason)
    } else {
      outerSignal.addEventListener('abort', () => controller.abort(outerSignal.reason), { once: true })
    }
  }
  const timer = setTimeout(() => controller.abort(new Error('auth_fetch_timeout')), AUTH_FETCH_TIMEOUT_MS)
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithTimeout,
  },
  auth: isStaticWebRender
    ? {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      }
    : {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
})

export { hasSupabaseEnv }
export const SUPABASE_URL = supabaseUrl
export const SUPABASE_ANON_KEY = supabaseAnonKey
