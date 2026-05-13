import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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
