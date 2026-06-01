import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Platform } from 'react-native'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
const hasSupabaseEnv = !!supabaseUrl && !!supabaseAnonKey
const FALLBACK_SUPABASE_URL = 'https://invalid.local'
const FALLBACK_SUPABASE_ANON_KEY = 'invalid-anon-key'

if (!hasSupabaseEnv) {
  console.warn('[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY')
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
