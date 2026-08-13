import * as FileSystem from 'expo-file-system/legacy'
import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'
import { getSupabaseBaseUrl } from '../env'
import {
  createHelpTicketAttachmentRow,
  markHelpTicketAttachmentFailed,
} from './helpTickets'

const MAX_BYTES = 25 * 1024 * 1024

const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'application/msword', 'application/vnd.']

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file'
}

function isAllowedType(mime: string | null | undefined, filename: string): boolean {
  const type = (mime || '').toLowerCase()
  if (ALLOWED_MIME_PREFIXES.some((p) => type.startsWith(p))) return true
  const lower = filename.toLowerCase()
  return /\.(png|jpe?g|gif|webp|pdf|docx?|xlsx?|pptx?)$/.test(lower)
}

async function resolveUploadUri(uri: string, filename: string): Promise<string> {
  if (uri.startsWith('content://') || uri.startsWith('ph://')) {
    const ext = (filename.split('.').pop() ?? 'bin').toLowerCase()
    const cacheUri = `${FileSystem.cacheDirectory}help_upload_${Date.now()}.${ext}`
    await FileSystem.copyAsync({ from: uri, to: cacheUri })
    return cacheUri
  }
  return uri
}

async function putToStorage(storagePath: string, uploadUri: string, mimeType: string) {
  const { data: signedData, error: signedErr } = await supabase.storage
    .from(AUTODOC_BUCKET)
    .createSignedUploadUrl(storagePath)
  if (signedErr || !signedData?.signedUrl) {
    throw new Error(signedErr?.message ?? 'Failed to get signed upload URL')
  }

  let lastErr: Error | null = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await FileSystem.uploadAsync(signedData.signedUrl, uploadUri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': mimeType },
      })
      if (result.status >= 200 && result.status < 300) return
      lastErr = new Error(`Storage upload failed HTTP ${result.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error('File upload failed')
    }
    if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt))
  }

  const base64 = await FileSystem.readAsStringAsync(uploadUri, {
    encoding: FileSystem.EncodingType.Base64,
  })
  const byteCharacters = globalThis.atob
    ? globalThis.atob(base64)
    : Buffer.from(base64, 'base64').toString('binary')
  const bytes = new Uint8Array(byteCharacters.length)
  for (let i = 0; i < byteCharacters.length; i += 1) bytes[i] = byteCharacters.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })

  const { data: freshSigned, error: freshErr } = await supabase.storage
    .from(AUTODOC_BUCKET)
    .createSignedUploadUrl(storagePath)
  const targetUrl = (!freshErr && freshSigned?.signedUrl) ? freshSigned.signedUrl : signedData.signedUrl

  const fallbackRes = await fetch(targetUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: blob,
  })
  if (!fallbackRes.ok) {
    throw lastErr ?? new Error(`Storage upload failed HTTP ${fallbackRes.status}`)
  }
}

export type LocalHelpAttachment = {
  uri: string
  name: string
  mimeType?: string | null
  size?: number | null
}

export async function uploadHelpTicketAttachmentFromUri(input: {
  ticketId: string
  file: LocalHelpAttachment
  messageId?: string | null
}): Promise<{ attachmentId: string; driveUrl?: string }> {
  const { ticketId, file, messageId } = input
  const filename = file.name?.trim() || 'attachment'
  const mimeType = file.mimeType || 'application/octet-stream'

  let sizeBytes = Number(file.size ?? 0)
  if (!sizeBytes || !Number.isFinite(sizeBytes)) {
    try {
      const info = await FileSystem.getInfoAsync(file.uri)
      sizeBytes = Number((info as { size?: number }).size ?? 0)
    } catch {
      sizeBytes = 0
    }
  }

  if (sizeBytes <= 0) throw new Error('File is required')
  if (sizeBytes > MAX_BYTES) throw new Error('File exceeds 25 MB limit')
  if (!isAllowedType(mimeType, filename)) {
    throw new Error('Only images, PDF, or Office files are allowed')
  }

  // autodoc RLS: first path segment must equal public.my_dealer_code() exactly (case-sensitive).
  const { data: dealerCodeRaw, error: dealerErr } = await supabase.rpc('my_dealer_code')
  if (dealerErr) throw new Error(dealerErr.message)
  const dealerCode = String(dealerCodeRaw ?? '').trim()
  if (!dealerCode) {
    throw new Error(
      'Dealer code required for attachment upload. Ensure your account has a dealer code, then retry.',
    )
  }

  const created = await createHelpTicketAttachmentRow({
    ticketId,
    originalFilename: filename,
    fileSizeBytes: sizeBytes,
    fileType: mimeType,
    messageId: messageId ?? null,
  })
  const attachmentId = created.id

  const storagePath =
    `${dealerCode}/help-ticket-attachments/${ticketId}/${attachmentId}/${Date.now()}_${safeFilename(filename)}`

  const sessionRes = await supabase.auth.getSession()

  try {
    const uploadUri = await resolveUploadUri(file.uri, filename)
    await putToStorage(storagePath, uploadUri, mimeType)

    const supabaseUrl = getSupabaseBaseUrl()?.replace(/\/$/, '')
    const token = sessionRes.data.session?.access_token
    if (!supabaseUrl || !token) throw new Error('No active session for Drive offload')

    const driveRes = await fetch(`${supabaseUrl}/functions/v1/universal-drive-upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        resource_type: 'help_ticket_attachment',
        bucket_id: AUTODOC_BUCKET,
        object_name: storagePath,
        resource_id: attachmentId,
        file_type: mimeType || 'attachment',
        file_size_mb: Number((sizeBytes / (1024 * 1024)).toFixed(3)),
      }),
    })

    const drivePayload = await driveRes.json().catch(() => ({} as { ok?: boolean; error?: string; drive_url?: string }))
    if (!driveRes.ok || drivePayload?.ok === false || drivePayload?.error) {
      throw new Error(drivePayload?.error || `Drive upload failed (${driveRes.status})`)
    }

    return { attachmentId, driveUrl: drivePayload.drive_url }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed'
    try {
      await markHelpTicketAttachmentFailed(attachmentId, message)
    } catch {
      // best-effort
    }
    throw err instanceof Error ? err : new Error(message)
  }
}
