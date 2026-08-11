import { supabase } from './supabase'
import { AUTODOC_BUCKET } from './autodocStorage'
import { getDealerScopeContext } from './api/auth'
import {
  createHelpTicketAttachmentRow,
  markHelpTicketAttachmentFailed,
} from './api/helpTickets'

const MAX_BYTES = 25 * 1024 * 1024

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file'
}

export async function uploadHelpTicketAttachment(input: {
  ticketId: string
  file: File
  messageId?: string | null
}): Promise<{ attachmentId: string; driveUrl?: string }> {
  const { ticketId, file, messageId } = input

  if (!file || file.size <= 0) throw new Error('File is required')
  if (file.size > MAX_BYTES) throw new Error('File exceeds 25 MB limit')

  const dealerScope = await getDealerScopeContext()
  const dealerCode = (dealerScope.data?.dealerCode || 'shared').toLowerCase()

  const created = await createHelpTicketAttachmentRow({
    ticketId,
    originalFilename: file.name,
    fileSizeBytes: file.size,
    fileType: file.type || null,
    messageId: messageId ?? null,
  })
  const attachmentId = created.id

  const storagePath =
    `${dealerCode}/help-ticket-attachments/${ticketId}/${attachmentId}/${Date.now()}_${safeFilename(file.name)}`

  try {
    const uploadRes = await supabase.storage.from(AUTODOC_BUCKET).upload(storagePath, file, {
      upsert: true,
      contentType: file.type || 'application/octet-stream',
    })
    if (uploadRes.error) throw new Error(uploadRes.error.message)

    const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
    const sessionRes = await supabase.auth.getSession()
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
        file_type: file.type || 'attachment',
        file_size_mb: Number((file.size / (1024 * 1024)).toFixed(3)),
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
