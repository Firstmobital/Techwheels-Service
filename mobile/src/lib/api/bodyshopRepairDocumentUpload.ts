import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { normalizeBodyshopSurveyStatusForDb } from '../bodyshopSurveyStatus'
import { postUniversalDriveWithRetry, driveUrlFromUniversalResponse } from './postUniversalDriveUpload'

export type BodyshopRepairDocRow = {
  id: number
  doc_key: string
  file_name: string
  storage_path: string
  drive_url?: string | null
  drive_file_id?: string | null
}

export type BodyshopRepairCardSurveyFields = {
  id: number
  reception_entry_id?: number | null
  reg_number?: string | null
  survey_date?: string | null
  survey_status?: string | null
  survey_hold_reason?: string | null
  surveyor_name?: string | null
  surveyor_contact?: string | null
  approved_parts?: string | null
  survay_info_by?: string | null
  survay_info_at?: string | null
}

function sanitizeFileNamePart(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '') || 'document'
}

async function resolveDealerCode(receptionEntryId: number | null | undefined): Promise<string> {
  const { data: myDealer } = await supabase.rpc('my_dealer_code')
  const fromRpc = String(myDealer ?? '').trim().toUpperCase()
  if (fromRpc) return fromRpc

  const entryId = Number(receptionEntryId)
  if (Number.isFinite(entryId) && entryId > 0) {
    const { data: row } = await supabase
      .from('service_reception_entries')
      .select('dealer_code')
      .eq('id', entryId)
      .maybeSingle()
    const dc = String(row?.dealer_code ?? '').trim().toUpperCase()
    if (dc) return dc
  }

  const { data: { user } } = await supabase.auth.getUser()
  const meta = String(user?.user_metadata?.dealer_code ?? user?.app_metadata?.dealer_code ?? '').trim().toUpperCase()
  return meta || 'TATA_DEFAULT'
}

export function buildSurveyPatchAfterDocUpload(
  card: BodyshopRepairCardSurveyFields,
  draftPatch: Record<string, unknown>,
): {
  cardPatch: Record<string, unknown>
  missingFields: string[]
} {
  const merged = { ...card, ...draftPatch }
  const surveyDate = String(merged.survey_date ?? '').trim()
  const surveyStatus = normalizeBodyshopSurveyStatusForDb(String(merged.survey_status ?? ''))
  const holdReason = String(merged.survey_hold_reason ?? '').trim()

  const missing: string[] = []
  if (!surveyDate) missing.push('Survey Date')
  if (surveyStatus !== 'hold' && surveyStatus !== 'approved') missing.push('Survey Status (Hold/Approved)')
  if (surveyStatus === 'hold' && !holdReason) missing.push('Hold Remark')

  const pendingCustomer = {
    customer_survey_approval_status: 'pending',
    customer_survey_rejection_reason: null,
    customer_survey_decided_at: null,
    doc_survey_approval: false,
  }

  if (missing.length > 0) {
    return { cardPatch: pendingCustomer, missingFields: missing }
  }

  const now = new Date().toISOString()
  return {
    cardPatch: {
      ...draftPatch,
      survey_date: surveyDate,
      survey_status: surveyStatus,
      survey_hold_reason: surveyStatus === 'hold' ? holdReason : null,
      surveyor_name: String(merged.surveyor_name ?? '').trim() || null,
      surveyor_contact: String(merged.surveyor_contact ?? '').trim() || null,
      approved_parts: String(merged.approved_parts ?? '').trim() || null,
      survay_info_updated_at: now,
      ...pendingCustomer,
    },
    missingFields: [],
  }
}

export async function uploadBodyshopRepairDocument(input: {
  card: BodyshopRepairCardSurveyFields
  draftPatch?: Record<string, unknown>
  docKey: string
  localUri: string
  fileName: string
  contentType?: string | null
  fileSizeBytes?: number | null
  mode: 'upload' | 'replace'
}): Promise<{ docRow: BodyshopRepairDocRow; cardPatch: Record<string, unknown>; missingFields: string[] }> {
  const docKey = input.docKey.trim()
  const regNo = String(input.card.reg_number ?? '').trim().toUpperCase()
  const dealerCode = await resolveDealerCode(input.card.reception_entry_id)
  const ext = input.fileName.includes('.')
    ? input.fileName.split('.').pop()
    : (input.contentType?.includes('pdf') ? 'pdf' : 'jpg')
  const safeName = sanitizeFileNamePart(input.fileName || `${docKey}.${ext}`)
  const storagePath = `${dealerCode}/service-advisor-bodyshop-docs/${input.card.id}/${docKey}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeName}`
  const mimeType = input.contentType?.trim() || 'application/octet-stream'

  let uploadUri = input.localUri
  if (input.localUri.startsWith('content://') || input.localUri.startsWith('ph://')) {
    const cacheUri = `${FileSystem.cacheDirectory}bs_doc_${Date.now()}.${ext ?? 'bin'}`
    await FileSystem.copyAsync({ from: input.localUri, to: cacheUri })
    uploadUri = cacheUri
  }

  const { data: signed, error: signedErr } = await supabase.storage
    .from(AUTODOC_BUCKET)
    .createSignedUploadUrl(storagePath)
  if (signedErr || !signed?.signedUrl) {
    throw new Error(signedErr?.message ?? 'Failed to prepare storage upload')
  }

  const uploadResult = await FileSystem.uploadAsync(signed.signedUrl, uploadUri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': mimeType },
  })
  if (uploadResult.status < 200 || uploadResult.status >= 300) {
    throw new Error(`Storage upload failed (HTTP ${uploadResult.status})`)
  }

  const { data: { user } } = await supabase.auth.getUser()
  const uploadedBy = user?.email ?? user?.id ?? null
  const receptionEntryId = Number(input.card.reception_entry_id)
  let fileSize = input.fileSizeBytes ?? 0
  if (!fileSize) {
    try {
      const info = await FileSystem.getInfoAsync(uploadUri, { size: true } as { size: boolean })
      fileSize = Number((info as { size?: number }).size ?? 0)
    } catch {
      fileSize = 0
    }
  }

  const { data: upsertedRows, error: upsertErr } = await supabase
    .from('bodyshop_repair_card_documents')
    .upsert(
      {
        dealer_code: dealerCode,
        repair_card_id: input.card.id,
        reception_entry_id: Number.isFinite(receptionEntryId) && receptionEntryId > 0 ? receptionEntryId : null,
        reg_number: regNo || null,
        doc_key: docKey,
        storage_bucket: AUTODOC_BUCKET,
        storage_path: storagePath,
        file_name: input.fileName,
        content_type: mimeType,
        file_size_bytes: fileSize,
        uploaded_by: uploadedBy,
        uploaded_at: new Date().toISOString(),
        ...(input.mode === 'replace' ? { drive_url: null, drive_file_id: null } : {}),
      },
      { onConflict: 'repair_card_id,doc_key' },
    )
    .select('id, doc_key, file_name, storage_path, drive_url, drive_file_id')
    .limit(1)

  if (upsertErr || !upsertedRows?.[0]) {
    throw new Error(upsertErr?.message ?? 'Failed to save document metadata')
  }

  const row = upsertedRows[0] as BodyshopRepairDocRow

  const { body: drivePayload } = await postUniversalDriveWithRetry({
    resource_type: 'bodyshop_document',
    resource_id: row.id,
    bucket_id: AUTODOC_BUCKET,
    object_name: storagePath,
    file_type: docKey,
    file_size_mb: Number((fileSize / (1024 * 1024)).toFixed(3)),
    registration_no: regNo,
  })

  const driveUrl = driveUrlFromUniversalResponse(drivePayload)
  const driveFileId = drivePayload.drive_file_id ?? drivePayload.fileId ?? drivePayload.result?.fileId ?? null
  if (driveUrl) {
    await supabase
      .from('bodyshop_repair_card_documents')
      .update({
        drive_url: driveUrl,
        drive_file_id: driveFileId,
        reg_number: regNo || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    row.drive_url = driveUrl
    row.drive_file_id = driveFileId
  }

  const actor = uploadedBy
  const { cardPatch, missingFields } = buildSurveyPatchAfterDocUpload(
    input.card,
    input.draftPatch ?? {},
  )
  if (actor) {
    cardPatch.survay_info_updated_by = actor
    if (!input.card.survay_info_by) cardPatch.survay_info_by = actor
    if (!input.card.survay_info_at) cardPatch.survay_info_at = new Date().toISOString()
  }

  return { docRow: row, cardPatch, missingFields }
}

export async function resendSurveyApprovalToCustomer(cardId: number): Promise<Record<string, unknown>> {
  const patch = {
    customer_survey_approval_status: 'pending',
    customer_survey_rejection_reason: null,
    customer_survey_decided_at: null,
    doc_survey_approval: false,
  }
  const { error } = await supabase.from('bodyshop_repair_cards').update(patch).eq('id', cardId)
  if (error) throw error
  return patch
}
