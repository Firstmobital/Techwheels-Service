/** Production project — baked in so EAS builds always reach the right host. */
export const PRODUCTION_SUPABASE_URL = 'https://jmdndcphkmaljhwgzqxq.supabase.co'
export const PRODUCTION_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptZG5kY3Boa21hbGpod2d6cXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNTQwNTIsImV4cCI6MjA5MzYzMDA1Mn0.ZvYw9-2fsrQQbqgIUfiWlIlvklZZtnkJSJ-V-LvgDE0'

export function normalizeSupabaseProjectUrl(raw: string | undefined | null): string | null {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed || trimmed === 'undefined' || trimmed === 'null') return null
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, '')
  }
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return null
}

export function resolveSupabaseCredentials(input: {
  envUrl?: string | undefined
  envAnonKey?: string | undefined
  extraUrl?: string | undefined
  extraAnonKey?: string | undefined
}): { url: string; anonKey: string; fromEnv: boolean } {
  const url =
    normalizeSupabaseProjectUrl(input.envUrl)
    ?? normalizeSupabaseProjectUrl(input.extraUrl)
    ?? PRODUCTION_SUPABASE_URL
  const anonKey =
    String(input.envAnonKey ?? '').trim()
    || String(input.extraAnonKey ?? '').trim()
    || PRODUCTION_SUPABASE_ANON_KEY
  const fromEnv = Boolean(
    normalizeSupabaseProjectUrl(input.envUrl)
    || normalizeSupabaseProjectUrl(input.extraUrl),
  )
  return { url, anonKey, fromEnv }
}
