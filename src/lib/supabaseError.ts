/** Normalize Supabase/PostgREST plain-object errors for UI and logs. */
export function formatSupabaseError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error === null || error === undefined) return 'Unknown error'

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    const message = record.message
    if (typeof message === 'string' && message.trim()) {
      const parts = [message.trim()]
      if (typeof record.code === 'string' && record.code) parts.push(`code=${record.code}`)
      if (typeof record.details === 'string' && record.details) parts.push(`details=${record.details}`)
      if (typeof record.hint === 'string' && record.hint) parts.push(`hint=${record.hint}`)
      return parts.join(' | ')
    }
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }

  return String(error)
}
