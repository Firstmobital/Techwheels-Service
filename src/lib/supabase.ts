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

const supabaseUrl =
	viteEnv.VITE_SUPABASE_URL ?? processEnv.EXPO_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey =
	viteEnv.VITE_SUPABASE_ANON_KEY ?? processEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey)

if (!hasSupabaseEnv) {
	console.error(
		'Missing Supabase configuration. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env.local file.',
	)
}

export const supabase = createClient(
	hasSupabaseEnv ? supabaseUrl : 'http://127.0.0.1:54321',
	hasSupabaseEnv ? supabaseAnonKey : 'missing-anon-key',
)
