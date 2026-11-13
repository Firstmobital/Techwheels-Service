/**
 * customer-portal-floor-photo-view — Signed URL / Drive URL for customer-owned floor work photos.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function driveFileIdFromUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const byPath = trimmed.match(/\/file\/d\/([^/]+)/i)
  if (byPath?.[1]) return byPath[1]
  const byQuery = trimmed.match(/[?&]id=([^&]+)/i)
  if (byQuery?.[1]) return byQuery[1]
  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed) && !trimmed.includes('/')) return trimmed
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Server configuration error' })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' })
  }

  const sessionToken = String(body.session_token ?? '').trim()
  const regNumber = String(body.reg_number ?? '').trim()
  const photoId = Number(body.photo_id)
  if (!sessionToken || !regNumber || !Number.isFinite(photoId) || photoId <= 0) {
    return json(400, { ok: false, error: 'session_token, reg_number, and photo_id are required' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: photo, error: photoErr } = await supabase.rpc('customer_get_floor_work_photo', {
    p_session_token: sessionToken,
    p_reg_number: regNumber,
    p_photo_id: photoId,
  })

  if (photoErr) {
    const msg = photoErr.message || 'Unable to load photo'
    const status = /session expired|vehicle not found|forbidden|not allowed/i.test(msg) ? 403 : 400
    return json(status, { ok: false, error: msg })
  }

  if (!photo || typeof photo !== 'object') {
    return json(404, { ok: false, error: 'Photo not found' })
  }

  const row = photo as Record<string, unknown>
  const driveUrl = String(row.drive_url ?? '').trim()
  const driveId =
    String(row.drive_file_id ?? '').trim() || (driveUrl ? driveFileIdFromUrl(driveUrl) : null)
  if (driveId) {
    return json(200, {
      ok: true,
      view_url: `https://drive.google.com/uc?export=view&id=${encodeURIComponent(driveId)}`,
      file_name: row.file_name ?? 'Workshop photo',
      content_type: row.content_type ?? 'image/jpeg',
    })
  }
  if (driveUrl) {
    return json(200, {
      ok: true,
      view_url: driveUrl,
      file_name: row.file_name ?? 'Workshop photo',
      content_type: row.content_type ?? 'image/jpeg',
    })
  }

  const bucket = String(row.storage_bucket ?? 'autodoc').trim() || 'autodoc'
  const storagePath = String(row.storage_path ?? '').trim()
  if (!storagePath) {
    return json(404, { ok: false, error: 'No photo file available' })
  }

  const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 600)
  if (signErr || !signed?.signedUrl) {
    return json(500, { ok: false, error: signErr?.message ?? 'Could not open photo' })
  }

  return json(200, {
    ok: true,
    view_url: signed.signedUrl,
    file_name: row.file_name ?? 'Workshop photo',
    content_type: row.content_type ?? 'image/jpeg',
  })
})
