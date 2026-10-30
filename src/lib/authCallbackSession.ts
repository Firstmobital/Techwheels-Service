/** Tokens Supabase puts on the recovery / confirm redirect. */

export function readAuthCallbackParams(href?: string): {
  code: string | null
  accessToken: string | null
  refreshToken: string | null
  type: string | null
  errorDescription: string | null
} {
  const raw = href ?? (typeof window !== 'undefined' ? window.location.href : '')
  const hashIdx = raw.indexOf('#')
  const beforeHash = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw
  const hash = hashIdx >= 0 ? raw.slice(hashIdx + 1) : ''
  const queryIdx = beforeHash.indexOf('?')
  const query = queryIdx >= 0 ? beforeHash.slice(queryIdx + 1) : ''
  const search = new URLSearchParams(query)
  const hashParams = new URLSearchParams(hash)

  return {
    code: search.get('code') ?? hashParams.get('code'),
    accessToken: hashParams.get('access_token') ?? search.get('access_token'),
    refreshToken: hashParams.get('refresh_token') ?? search.get('refresh_token'),
    type: hashParams.get('type') ?? search.get('type'),
    errorDescription: hashParams.get('error_description') ?? search.get('error_description'),
  }
}

/** True when the current URL still carries a Supabase email-link payload. */
export function locationHasAuthCallbackPayload(): boolean {
  if (typeof window === 'undefined') return false
  const parsed = readAuthCallbackParams()
  return Boolean(parsed.code || parsed.accessToken || parsed.type === 'recovery' || parsed.errorDescription)
}
