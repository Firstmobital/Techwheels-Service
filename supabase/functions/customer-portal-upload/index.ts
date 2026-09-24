/**
 * customer-portal-upload
 *
 * Customer-session protected upload broker for accidental/bodyshop service.
 * Uses the existing custom customer session token (not Supabase Auth) to:
 *  - create short-lived signed upload tickets
 *  - persist uploaded document/photo metadata against the customer's repair card
 *  - return signed URLs for all customer-visible bodyshop assets
 *
 * IMPORTANT: verify_jwt stays false because authentication is performed with
 * customer_get_repair_card/customer_get_active_job before any service-role action.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.43.5'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

const BUCKET = 'autodoc'
const MAX_FILE_SIZE = 15 * 1024 * 1024

const ALLOWED_DOC_KEYS = new Set([
  'doc_claim_form',
  'doc_rc',
  'doc_insurance',
  'doc_dl',
  'doc_aadhaar',
  'doc_pan',
  'doc_kyc',
  'doc_gst',
  'doc_company_pan',
  'doc_bank_detail',
  'doc_tp_affidavit',
])

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function text(value: unknown) {
  return String(value ?? '').trim()
}

function safeFileName(value: string) {
  const cleaned = value
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .slice(-120)
  return cleaned || 'upload.bin'
}

async function resolveContext(
  supabase: ReturnType<typeof createClient>,
  sessionToken: string,
  regNumber: string
) {
  const [{ data: repair, error: repairError }, { data: active, error: activeError }] = await Promise.all([
    supabase.rpc('customer_get_repair_card', {
      p_session_token: sessionToken,
      p_reg_number: regNumber,
    }),
    supabase.rpc('customer_get_active_job', {
      p_session_token: sessionToken,
      p_reg_number: regNumber,
    }),
  ])

  if (repairError) throw new Error(repairError.message || 'Unable to validate repair card')
  if (activeError) throw new Error(activeError.message || 'Unable to validate customer session')
  if (!repair || typeof repair !== 'object') throw new Error('No active bodyshop repair card found for this vehicle')

  const repairCard = repair as Record<string, unknown>
  const repairCardId = Number(repairCard.id)
  if (!Number.isFinite(repairCardId) || repairCardId <= 0) {
    throw new Error('Repair card is not ready for customer uploads')
  }

  const { data: cardRow, error: cardError } = await supabase
    .from('bodyshop_repair_cards')
    .select('id, reg_number, reception_entry_id, job_card_no, customer_type, branch')
    .eq('id', repairCardId)
    .single()

  if (cardError || !cardRow) throw new Error(cardError?.message || 'Repair card not found')

  let dealerCode = ''
  if (cardRow.reception_entry_id) {
    const { data: reception } = await supabase
      .from('service_reception_entries')
      .select('dealer_code')
      .eq('id', cardRow.reception_entry_id)
      .maybeSingle()
    dealerCode = text(reception?.dealer_code)
  }

  if (!dealerCode) {
    const { data: existingDoc } = await supabase
      .from('bodyshop_repair_card_documents')
      .select('dealer_code')
      .eq('repair_card_id', repairCardId)
      .not('dealer_code', 'is', null)
      .limit(1)
      .maybeSingle()
    dealerCode = text(existingDoc?.dealer_code)
  }

  if (!dealerCode) {
    throw new Error('Dealer context is not available for this repair card. Please contact your Service Advisor.')
  }

  const activePayload = (active || {}) as Record<string, unknown>
  const phone = text(activePayload.phone)

  return {
    repairCardId,
    dealerCode,
    phone,
    regNumber: text(cardRow.reg_number) || regNumber,
    receptionEntryId: cardRow.reception_entry_id ? Number(cardRow.reception_entry_id) : null,
    jobCardNo: text(cardRow.job_card_no),
    customerType: text(cardRow.customer_type),
  }
}

async function signAsset(
  supabase: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
  kind: 'document' | 'photo'
) {
  const driveUrl = text(row.drive_url)
  if (driveUrl) {
    return {
      kind,
      id: row.id,
      doc_key: row.doc_key ?? null,
      file_name: row.file_name ?? null,
      content_type: row.content_type ?? null,
      uploaded_at: row.uploaded_at ?? row.created_at ?? null,
      uploaded_by: row.uploaded_by ?? null,
      view_url: driveUrl,
    }
  }

  const bucket = text(row.storage_bucket) || BUCKET
  const path = text(row.storage_path)
  if (!path) return null

  const { data: signed, error } = await supabase.storage.from(bucket).createSignedUrl(path, 600)
  if (error || !signed?.signedUrl) return null

  return {
    kind,
    id: row.id,
    doc_key: row.doc_key ?? null,
    file_name: row.file_name ?? null,
    content_type: row.content_type ?? null,
    uploaded_at: row.uploaded_at ?? row.created_at ?? null,
    uploaded_by: row.uploaded_by ?? null,
    view_url: signed.signedUrl,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { ok: false, error: 'Method not allowed' })

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

  const action = text(body.action)
  const sessionToken = text(body.session_token)
  const regNumber = text(body.reg_number)

  if (!sessionToken || !regNumber) {
    return json(400, { ok: false, error: 'session_token and reg_number are required' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let ctx
  try {
    ctx = await resolveContext(supabase, sessionToken, regNumber)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to validate customer session'
    const status = /expired|vehicle not found|not allowed|forbidden/i.test(message) ? 403 : 400
    return json(status, { ok: false, error: message })
  }

  if (action === 'create_ticket') {
    const kind = text(body.kind) as 'document' | 'photo'
    const docKey = text(body.doc_key)
    const fileName = safeFileName(text(body.file_name))
    const contentType = text(body.content_type) || 'application/octet-stream'
    const fileSize = Number(body.file_size_bytes || 0)

    if (kind !== 'document' && kind !== 'photo') {
      return json(400, { ok: false, error: 'kind must be document or photo' })
    }
    if (kind === 'document' && !ALLOWED_DOC_KEYS.has(docKey)) {
      return json(400, { ok: false, error: 'Unsupported document type' })
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return json(400, { ok: false, error: 'File must be between 1 byte and 15 MB' })
    }

    const category = kind === 'document' ? docKey : 'damage'
    const storagePath =
      `${ctx.dealerCode}/customer-portal/${ctx.repairCardId}/${kind}/${category}/${Date.now()}_${crypto.randomUUID()}_${fileName}`

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath)

    if (signError || !signed?.token) {
      return json(500, { ok: false, error: signError?.message || 'Unable to prepare upload' })
    }

    return json(200, {
      ok: true,
      bucket: BUCKET,
      path: storagePath,
      token: signed.token,
      repair_card_id: ctx.repairCardId,
    })
  }

  if (action === 'complete_upload') {
    const kind = text(body.kind) as 'document' | 'photo'
    const docKey = text(body.doc_key)
    const storagePath = text(body.path)
    const fileName = safeFileName(text(body.file_name))
    const contentType = text(body.content_type) || 'application/octet-stream'
    const fileSize = Number(body.file_size_bytes || 0)

    const allowedPrefix = `${ctx.dealerCode}/customer-portal/${ctx.repairCardId}/`
    if (!storagePath || !storagePath.startsWith(allowedPrefix)) {
      return json(403, { ok: false, error: 'Upload path does not belong to this repair card' })
    }
    if (kind !== 'document' && kind !== 'photo') {
      return json(400, { ok: false, error: 'kind must be document or photo' })
    }
    if (kind === 'document' && !ALLOWED_DOC_KEYS.has(docKey)) {
      return json(400, { ok: false, error: 'Unsupported document type' })
    }

    const { data: storageRows, error: storageError } = await supabase.storage
      .from(BUCKET)
      .list(storagePath.split('/').slice(0, -1).join('/'), {
        search: storagePath.split('/').pop(),
        limit: 2,
      })

    if (storageError || !storageRows?.some((item) => item.name === storagePath.split('/').pop())) {
      return json(400, { ok: false, error: 'Uploaded file could not be verified' })
    }

    const uploader = ctx.phone ? `customer:${ctx.phone}` : 'customer-app'

    if (kind === 'document') {
      const { error: insertError } = await supabase.from('bodyshop_repair_card_documents').insert({
        dealer_code: ctx.dealerCode,
        repair_card_id: ctx.repairCardId,
        reception_entry_id: ctx.receptionEntryId,
        reg_number: ctx.regNumber,
        doc_key: docKey,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        file_name: fileName,
        content_type: contentType,
        file_size_bytes: Number.isFinite(fileSize) ? fileSize : null,
        uploaded_by: uploader,
        uploaded_at: new Date().toISOString(),
      })

      if (insertError) return json(500, { ok: false, error: insertError.message })

      const { error: updateError } = await supabase
        .from('bodyshop_repair_cards')
        .update({ [docKey]: true, updated_at: new Date().toISOString() })
        .eq('id', ctx.repairCardId)

      if (updateError) {
        return json(500, { ok: false, error: updateError.message })
      }
    } else {
      const { error: insertError } = await supabase.from('bodyshop_intake_vehicle_photos').insert({
        dealer_code: ctx.dealerCode,
        repair_card_id: ctx.repairCardId,
        reception_entry_id: ctx.receptionEntryId,
        job_card_no: ctx.jobCardNo || null,
        reg_number: ctx.regNumber,
        customer_type: ctx.customerType || null,
        storage_bucket: BUCKET,
        storage_path: storagePath,
        file_name: fileName,
        content_type: contentType,
        file_size_bytes: Number.isFinite(fileSize) ? fileSize : null,
        uploaded_by: uploader,
        uploaded_at: new Date().toISOString(),
      })

      if (insertError) return json(500, { ok: false, error: insertError.message })
    }

    return json(200, { ok: true })
  }

  if (action === 'list_assets') {
    const [{ data: documents, error: documentsError }, { data: photos, error: photosError }] = await Promise.all([
      supabase
        .from('bodyshop_repair_card_documents')
        .select('id, doc_key, storage_bucket, storage_path, drive_url, file_name, content_type, uploaded_by, uploaded_at, created_at')
        .eq('repair_card_id', ctx.repairCardId)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('bodyshop_intake_vehicle_photos')
        .select('id, storage_bucket, storage_path, drive_url, file_name, content_type, uploaded_by, uploaded_at, created_at')
        .eq('repair_card_id', ctx.repairCardId)
        .order('uploaded_at', { ascending: false }),
    ])

    if (documentsError) return json(500, { ok: false, error: documentsError.message })
    if (photosError) return json(500, { ok: false, error: photosError.message })

    const docAssets = (
      await Promise.all((documents || []).map((row) => signAsset(supabase, row as Record<string, unknown>, 'document')))
    ).filter(Boolean)

    const photoAssets = (
      await Promise.all((photos || []).map((row) => signAsset(supabase, row as Record<string, unknown>, 'photo')))
    ).filter(Boolean)

    return json(200, {
      ok: true,
      repair_card_id: ctx.repairCardId,
      documents: docAssets,
      photos: photoAssets,
    })
  }

  return json(400, { ok: false, error: 'Unsupported action' })
})
