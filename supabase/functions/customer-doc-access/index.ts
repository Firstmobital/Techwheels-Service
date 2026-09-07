import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

// Body Shop Customer App: proxies document view/upload against the existing
// 'autodoc' storage bucket, whose RLS is authenticated-staff-only (see
// repository audit). This function holds the service-role key server-side
// only -- it is never shipped to the browser -- and every action first
// re-validates the caller's session token via bodyshop_customer_session_context.

type Action = 'upload_url' | 'download_url' | 'register'

type RequestBody = {
  action?: Action
  session_token?: string
  doc_key?: string
  file_name?: string
  content_type?: string
  file_size_bytes?: number
  storage_path?: string
}

const ALLOWED_DOC_KEYS = ['doc_rc', 'doc_dl', 'doc_pan', 'doc_kyc', 'doc_insurance']

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  }

  try {
    const body = (await req.json()) as RequestBody
    const { action, session_token, doc_key } = body

    if (!session_token) {
      return new Response(JSON.stringify({ error: 'Missing session' }), { status: 401, headers: corsHeaders })
    }
    if (!doc_key || !ALLOWED_DOC_KEYS.includes(doc_key)) {
      return new Response(JSON.stringify({ error: 'Invalid document type' }), { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Re-validate the session on every call; this also confirms the caller
    // owns the reception_entry_id used to build the storage path below.
    const { data: ctx, error: ctxError } = await supabase.rpc('bodyshop_customer_session_context', {
      p_session_token: session_token,
    })
    if (ctxError || !ctx || !ctx[0]) {
      return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401, headers: corsHeaders })
    }
    const { dealer_code, reception_entry_id } = ctx[0]

    if (action === 'upload_url') {
      const path = `${dealer_code}/customer-app-docs/${reception_entry_id}/${doc_key}-${Date.now()}`
      const { data, error } = await supabase.storage.from('autodoc').createSignedUploadUrl(path)
      if (error) throw error
      return new Response(JSON.stringify({ path, token: data.token, signed_url: data.signedUrl }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    if (action === 'register') {
      const { file_name, content_type, file_size_bytes, storage_path } = body
      if (!storage_path || !storage_path.startsWith(`${dealer_code}/customer-app-docs/${reception_entry_id}/`)) {
        return new Response(JSON.stringify({ error: 'Invalid storage path' }), { status: 400, headers: corsHeaders })
      }
      const { error } = await supabase.rpc('customer_register_document', {
        p_session_token: session_token,
        p_doc_key: doc_key,
        p_storage_path: storage_path,
        p_file_name: file_name ?? 'document',
        p_content_type: content_type ?? 'application/octet-stream',
        p_file_size_bytes: file_size_bytes ?? null,
      })
      if (error) throw error
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders })
    }

    if (action === 'download_url') {
      const { data: resolved, error: resolveError } = await supabase.rpc('customer_resolve_document_path', {
        p_session_token: session_token,
        p_doc_key: doc_key,
      })
      if (resolveError) throw resolveError

      const { data: signed, error: signError } = await supabase.storage
        .from(resolved.storage_bucket)
        .createSignedUrl(resolved.storage_path, 300)
      if (signError) throw signError

      return new Response(JSON.stringify({ signed_url: signed.signedUrl }), { status: 200, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return new Response(JSON.stringify({ error: message }), { status: 400, headers: corsHeaders })
  }
})
