import { supabase } from '../supabase'

export type UniversalDriveUploadResponse = {
  ok?: boolean
  error?: string
  drive_url?: string
  link?: string
  drive_file_id?: string
  fileId?: string
  result?: { fileId?: string; driveUrl?: string }
}

export async function postUniversalDriveWithRetry(
  payload: Record<string, unknown>,
  timeoutMs = 25000,
): Promise<{ res: Response; body: UniversalDriveUploadResponse }> {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || ''
  const sessionRes = await supabase.auth.getSession()
  const token = sessionRes.data.session?.access_token ?? ''

  if (!supabaseUrl) {
    return {
      res: new Response(null, { status: 500 }),
      body: { ok: false, error: 'Supabase URL not configured' },
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token || anonKey}`,
  }
  if (anonKey) headers.apikey = anonKey

  const send = () =>
    fetch(`${supabaseUrl}/functions/v1/universal-drive-upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
    })

  let res = await send()
  let body: UniversalDriveUploadResponse = await res.json().catch(() => ({}))
  if (!res.ok || body?.error || body?.ok === false) {
    res = await send()
    body = await res.json().catch(() => ({}))
  }
  return { res, body }
}

export function driveUrlFromUniversalResponse(body: UniversalDriveUploadResponse): string | null {
  const url =
    String(body.drive_url ?? body.link ?? body.result?.driveUrl ?? '').trim() ||
    (body.fileId ? `https://drive.google.com/file/d/${body.fileId}/view` : '') ||
    (body.drive_file_id ? `https://drive.google.com/file/d/${body.drive_file_id}/view` : '')
  return url.trim() || null
}
