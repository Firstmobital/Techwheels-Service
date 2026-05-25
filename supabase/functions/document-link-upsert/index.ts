import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const body = await req.json()
    const { jobCardId, docType, storagePath, fileSizeMb } = body ?? {}

    if (!jobCardId || typeof jobCardId !== 'string') {
      return new Response(JSON.stringify({ error: 'jobCardId is required' }), { status: 400, headers })
    }
    if (!docType || typeof docType !== 'string') {
      return new Response(JSON.stringify({ error: 'docType is required' }), { status: 400, headers })
    }
    if (!storagePath || typeof storagePath !== 'string') {
      return new Response(JSON.stringify({ error: 'storagePath is required' }), { status: 400, headers })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRole) {
      return new Response(JSON.stringify({ error: 'Missing server configuration' }), { status: 500, headers })
    }

    const supabase = createClient(supabaseUrl, serviceRole)

    const { data: existing, error: existingError } = await supabase
      .from('documents')
      .select('id, storage_path')
      .eq('job_card_id', jobCardId)
      .eq('doc_type', docType)

    if (existingError) {
      return new Response(JSON.stringify({ error: existingError.message }), { status: 500, headers })
    }

    if ((existing ?? []).length > 0) {
      const ids = existing.map((row) => row.id)
      const oldPaths = existing
        .map((row) => row.storage_path)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)

      const { error: deleteRowsError } = await supabase
        .from('documents')
        .delete()
        .in('id', ids)

      if (deleteRowsError) {
        return new Response(JSON.stringify({ error: deleteRowsError.message }), { status: 500, headers })
      }

      if (oldPaths.length > 0) {
        const { error: removeOldError } = await supabase.storage
          .from('autodoc')
          .remove(oldPaths)

        // Do not fail the request for old-file cleanup failures.
        if (removeOldError) {
          console.warn('[document-link-upsert] Failed to remove old files:', removeOldError.message)
        }
      }
    }

    const payload = {
      job_card_id: jobCardId,
      doc_type: docType,
      storage_path: storagePath,
      file_size_mb: Number.isFinite(Number(fileSizeMb)) ? Number(fileSizeMb) : 0,
    }

    const { data: inserted, error: insertError } = await supabase
      .from('documents')
      .insert(payload)
      .select('id, job_card_id, doc_type, storage_path, file_size_mb, created_at')
      .single()

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers })
    }

    return new Response(JSON.stringify({ data: inserted }), { status: 200, headers })
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `Server error: ${(err as Error).message}` }),
      { status: 500, headers },
    )
  }
})
