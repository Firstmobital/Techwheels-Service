/**
 * customer-portal-doc-view — Signed URL / Drive URL for customer-owned bodyshop documents.
 * Validates customer session token server-side; uses service role for storage signing.
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
  const docKey = String(body.doc_key ?? 'doc_estimate').trim() || 'doc_estimate'

  if (!sessionToken || !regNumber) {
    return json(400, { ok: false, error: 'session_token and reg_number are required' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: doc, error: docErr } = await supabase.rpc('customer_get_bodyshop_document', {
    p_session_token: sessionToken,
    p_reg_number: regNumber,
    p_doc_key: docKey,
  })

  if (docErr) {
    const msg = docErr.message || 'Unable to load document'
    const status = /session expired|vehicle not found|forbidden|not allowed/i.test(msg) ? 403 : 400
    return json(status, { ok: false, error: msg })
  }

  if (!doc || typeof doc !== 'object') {
    return json(404, { ok: false, error: 'No estimate document uploaded yet' })
  }

  const docRow = doc as Record<string, unknown>
  const driveUrl = String(docRow.drive_url ?? '').trim()
  if (driveUrl) {
    return json(200, {
      ok: true,
      view_url: driveUrl,
      file_name: docRow.file_name ?? 'Estimate',
      content_type: docRow.content_type ?? null,
    })
  }

  const bucket = String(docRow.storage_bucket ?? 'autodoc').trim() || 'autodoc'
  const storagePath = String(docRow.storage_path ?? '').trim()
  if (!storagePath) {
    return json(404, { ok: false, error: 'No estimate file available yet' })
  }

  const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 600)
  if (signErr || !signed?.signedUrl) {
    return json(500, { ok: false, error: signErr?.message ?? 'Could not open estimate file' })
  }

  return json(200, {
    ok: true,
    view_url: signed.signedUrl,
    file_name: docRow.file_name ?? 'Estimate',
    content_type: docRow.content_type ?? null,
  })
})
