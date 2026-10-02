/** Parse Supabase auth redirect URLs (PKCE code or hash tokens). */
export function parseAuthCallbackUrl(url: string): {
  code: string | null
  accessToken: string | null
  refreshToken: string | null
  type: string | null
} {
  const raw = String(url ?? '').trim()
  if (!raw) {
    return { code: null, accessToken: null, refreshToken: null, type: null }
  }

  const hashIdx = raw.indexOf('#')
  const queryPart = hashIdx >= 0 ? raw.slice(0, hashIdx) : raw
  const hashPart = hashIdx >= 0 ? raw.slice(hashIdx + 1) : ''

  const queryQ = queryPart.indexOf('?')
  const queryString = queryQ >= 0 ? queryPart.slice(queryQ + 1) : ''
  const queryParams = new URLSearchParams(queryString)
  const hashParams = new URLSearchParams(hashPart)

  const code = queryParams.get('code') ?? hashParams.get('code')
  const accessToken = hashParams.get('access_token') ?? queryParams.get('access_token')
  const refreshToken = hashParams.get('refresh_token') ?? queryParams.get('refresh_token')
  const type = hashParams.get('type') ?? queryParams.get('type')

  return { code, accessToken, refreshToken, type }
}
