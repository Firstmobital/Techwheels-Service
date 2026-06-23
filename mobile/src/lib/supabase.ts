import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Constants from 'expo-constants'
import { Platform } from 'react-native'

const extra =
  (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
  ?? (Constants.manifest2?.extra as Record<string, unknown> | undefined)
  ?? {}

const extraSupabaseUrl = typeof extra.supabaseUrl === 'string' ? extra.supabaseUrl : undefined
const extraSupabaseAnonKey = typeof extra.supabaseAnonKey === 'string' ? extra.supabaseAnonKey : undefined

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? extraSupabaseUrl
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? extraSupabaseAnonKey
const hasSupabaseEnv = !!supabaseUrl && !!supabaseAnonKey
const FALLBACK_SUPABASE_URL = 'https://jmdndcphkmaljhwgzqxq.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'invalid-anon-key'

if (!hasSupabaseEnv) {
  console.warn('[supabase] Missing Supabase config (EXPO_PUBLIC_* and expo.extra fallback both empty)')
}

const isStaticWebRender = Platform.OS === 'web' && typeof window === 'undefined'

export const supabase = createClient(
  hasSupabaseEnv ? supabaseUrl : FALLBACK_SUPABASE_URL,
  hasSupabaseEnv ? supabaseAnonKey : FALLBACK_SUPABASE_ANON_KEY,
  {
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
  }
)

export { hasSupabaseEnv }
export const SUPABASE_URL = hasSupabaseEnv ? supabaseUrl : FALLBACK_SUPABASE_URL
export const SUPABASE_ANON_KEY = hasSupabaseEnv ? supabaseAnonKey : FALLBACK_SUPABASE_ANON_KEY
