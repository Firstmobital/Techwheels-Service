import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { fail, ok, type ApiResult } from './types'

export type InsuranceRenewalQuoteUpload = {
  quote_drive_url: string | null
  quote_drive_file_id: string | null
  quote_storage_path: string | null
  quote_file_name: string | null
  quote_content_type: string | null
  quote_uploaded_at: string | null
}

const QUOTE_SELECT = 'quote_drive_url, quote_drive_file_id, quote_storage_path, quote_file_name, quote_content_type, quote_uploaded_at'

function sanitizeFileNamePart(value: string): string {
  return value.replace(/[^\w.\-()+ ]+/g, '_').replace(/\s+/g, '_').slice(0, 120)
}

export async function uploadInsuranceRenewalQuote(
  assignmentId: number,
  file: File,
  registrationNumber?: string | null,
): Promise<ApiResult<InsuranceRenewalQuoteUpload>> {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
  const safeName = sanitizeFileNamePart(file.name || `quote.${extension}`)
  const regPart = sanitizeFileNamePart(registrationNumber?.trim() || 'unknown-reg')
  const storagePath = `insurance-renewal-quotes/${regPart}/${assignmentId}/${Date.now()}_${safeName}`

  const uploadRes = await supabase.storage
    .from(AUTODOC_BUCKET)
    .upload(storagePath, file, { upsert: true, contentType: file.type || 'application/octet-stream' })

  if (uploadRes.error) return fail(uploadRes.error.message)

  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  const sessionRes = await supabase.auth.getSession()
  const token = sessionRes.data.session?.access_token

  if (!supabaseUrl || !token) return fail('No active session for Drive offload request')

  const driveRes = await fetch(`${supabaseUrl}/functions/v1/universal-drive-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      resource_type: 'insurance_renewal_quote',
      bucket_id: AUTODOC_BUCKET,
      object_name: storagePath,
      assignment_id: assignmentId,
      file_type: 'insurance_quote',
      file_size_mb: Number((file.size / (1024 * 1024)).toFixed(3)),
    }),
  })

  const drivePayload = await driveRes.json().catch(() => ({} as { ok?: boolean; error?: string; db_update_error?: string }))
  if (!driveRes.ok || drivePayload?.ok === false || drivePayload?.error) {
    const detail = drivePayload?.db_update_error ? ` (${drivePayload.db_update_error})` : ''
    return fail(`${drivePayload?.error || `Universal drive upload failed (${driveRes.status})`}${detail}`)
  }

  const { data, error } = await supabase
    .from('insurance_renewal_assignments')
    .select(QUOTE_SELECT)
    .eq('id', assignmentId)
    .single<InsuranceRenewalQuoteUpload>()

  if (error) return fail(error.message)
  return ok(data)
}
