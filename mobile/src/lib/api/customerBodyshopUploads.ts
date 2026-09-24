import * as FileSystem from 'expo-file-system/legacy'
import { getSupabaseBaseUrl } from '../env'
import { supabase, SUPABASE_ANON_KEY } from '../supabase'

export type CustomerBodyshopAsset = {
  kind: 'document' | 'photo'
  id: number | string
  doc_key?: string | null
  file_name?: string | null
  content_type?: string | null
  uploaded_at?: string | null
  uploaded_by?: string | null
  view_url?: string | null
}

type UploadKind = 'document' | 'photo'

type UploadRequest = {
  sessionToken: string
  regNumber: string
  kind: UploadKind
  docKey?: string
  uri: string
  fileName: string
  contentType: string
}

async function callUploadBroker(
  sessionToken: string,
  regNumber: string,
  payload: Record<string, unknown>
): Promise<any> {
  const supabaseUrl = getSupabaseBaseUrl()
  if (!supabaseUrl) throw new Error('App is not configured for uploads.')

  const res = await fetch(`${supabaseUrl}/functions/v1/customer-portal-upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      session_token: sessionToken,
      reg_number: regNumber,
      ...payload,
    }),
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || 'Customer upload request failed.')
  }
  return body
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export async function customerUploadBodyshopAsset(input: UploadRequest) {
  const fileInfo = await FileSystem.getInfoAsync(input.uri)
  const fileSize = fileInfo.exists && 'size' in fileInfo ? Number(fileInfo.size || 0) : 0
  if (!fileSize) throw new Error('Unable to read the selected file.')
  if (fileSize > 15 * 1024 * 1024) throw new Error('Please upload a file smaller than 15 MB.')

  const ticket = await callUploadBroker(input.sessionToken, input.regNumber, {
    action: 'create_ticket',
    kind: input.kind,
    doc_key: input.docKey || null,
    file_name: input.fileName,
    content_type: input.contentType,
    file_size_bytes: fileSize,
  })

  const base64 = await FileSystem.readAsStringAsync(input.uri, {
    encoding: FileSystem.EncodingType.Base64,
  })

  const { error: uploadError } = await supabase.storage
    .from(String(ticket.bucket))
    .uploadToSignedUrl(
      String(ticket.path),
      String(ticket.token),
      base64ToArrayBuffer(base64),
      { contentType: input.contentType }
    )

  if (uploadError) {
    throw new Error(uploadError.message || 'File upload failed.')
  }

  await callUploadBroker(input.sessionToken, input.regNumber, {
    action: 'complete_upload',
    kind: input.kind,
    doc_key: input.docKey || null,
    path: ticket.path,
    file_name: input.fileName,
    content_type: input.contentType,
    file_size_bytes: fileSize,
  })
}

export async function customerListBodyshopAssets(
  sessionToken: string,
  regNumber: string
): Promise<{ documents: CustomerBodyshopAsset[]; photos: CustomerBodyshopAsset[] }> {
  const body = await callUploadBroker(sessionToken, regNumber, { action: 'list_assets' })
  return {
    documents: Array.isArray(body.documents) ? body.documents : [],
    photos: Array.isArray(body.photos) ? body.photos : [],
  }
}
