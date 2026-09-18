import { createClient } from '@supabase/supabase-js'

type EnvBag = Record<string, string | undefined>

const viteEnv: EnvBag =
	typeof import.meta !== 'undefined' && typeof import.meta.env !== 'undefined'
		? (import.meta.env as EnvBag)
		: {}

const processEnv: EnvBag =
	typeof process !== 'undefined' && process.env
		? (process.env as EnvBag)
		: {}

const FALLBACK_SUPABASE_URL = 'https://jmdndcphkmaljhwgzqxq.supabase.co'
const FALLBACK_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0'

const supabaseUrl =
	viteEnv.VITE_SUPABASE_URL ?? processEnv.EXPO_PUBLIC_SUPABASE_URL ?? FALLBACK_SUPABASE_URL
const supabaseAnonKey =
	viteEnv.VITE_SUPABASE_ANON_KEY ?? processEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? FALLBACK_SUPABASE_ANON_KEY

export { supabaseUrl, supabaseAnonKey }
export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
