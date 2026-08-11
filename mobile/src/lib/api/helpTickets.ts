import { supabase } from '../supabase'

/**
 * Employee Help Lite API — allowed RPCs only.
 * Do NOT import support/admin RPCs here (list_admin, assign, hold, escalate, etc.).
 */

export type HelpTicketStatus =
  | 'new'
  | 'open'
  | 'in_progress'
  | 'waiting_raiser'
  | 'on_hold'
  | 'escalated'
  | 'resolved'
  | 'cannot_reproduce'
  | 'closed'
  | 'reopened'

export type HelpTicketPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface HelpTicketCategory {
  id: string
  key: string
  label: string
  description: string | null
  default_priority: HelpTicketPriority
  sla_response_minutes: number
  sla_resolution_minutes: number
  is_active: boolean
}

export interface HelpTicket {
  id: string
  ticket_number: string
  raiser_dealer_code: string | null
  raised_by_user_id: string
  raised_by_employee_code: string
  raised_by_name: string
  raised_by_email: string | null
  raised_by_department: string | null
  category_id: string
  category_key: string
  subject: string
  description: string
  status: HelpTicketStatus
  priority: HelpTicketPriority
  severity: string
  assigned_to_employee_code: string | null
  assigned_to_name: string | null
  assigned_at: string | null
  sla_response_at: string | null
  sla_resolution_at: string | null
  sla_paused: boolean
  first_response_at: string | null
  resolved_at: string | null
  verification_status: string
  verified_at: string | null
  closed_at: string | null
  is_escalated: boolean
  hold_reason: string | null
  resolution_notes: string | null
  created_at: string
  updated_at: string
}

export interface HelpTicketMessage {
  id: string
  ticket_id: string
  created_at: string
  created_by_employee_code: string
  created_by_name: string
  created_by_role: string | null
  message_text: string
  message_type: string
  visibility: 'public' | 'internal'
  sequence_number: number
}

export interface HelpTicketAttachment {
  id: string
  ticket_id: string
  original_filename: string
  file_size_bytes: number
  file_type: string | null
  drive_url: string | null
  drive_file_id: string | null
  status: string
  uploaded_by_name: string
  uploaded_at: string
}

export interface HelpTicketDetail {
  ticket: HelpTicket
  messages: HelpTicketMessage[]
  attachments: HelpTicketAttachment[]
  viewer: {
    employee_code: string
    is_raiser: boolean
    is_support: boolean
    can_modify: boolean
  }
}

function rpcError(error: { message?: string } | null, fallback: string): Error {
  return new Error(error?.message || fallback)
}

export async function listHelpTicketCategories() {
  const { data, error } = await supabase.rpc('help_ticket_list_categories')
  if (error) throw rpcError(error, 'Failed to load categories')
  return (data || []) as HelpTicketCategory[]
}

export async function createHelpTicket(input: {
  categoryKey: string
  subject: string
  description: string
  priority?: HelpTicketPriority | null
  severity?: string | null
}) {
  const { data, error } = await supabase.rpc('help_ticket_create', {
    p_category_key: input.categoryKey,
    p_subject: input.subject,
    p_description: input.description,
    p_priority: input.priority ?? null,
    p_severity: input.severity ?? null,
  })
  if (error) throw rpcError(error, 'Failed to create ticket')
  return data as { id: string; ticket_number: string; status: string }
}

export async function listMyHelpTickets(options?: {
  status?: HelpTicketStatus[] | null
  limit?: number
  cursor?: string | null
}) {
  const { data, error } = await supabase.rpc('help_ticket_list_mine', {
    p_status: options?.status ?? null,
    p_limit: options?.limit ?? 50,
    p_cursor: options?.cursor ?? null,
  })
  if (error) throw rpcError(error, 'Failed to load tickets')
  return (data || []) as HelpTicket[]
}

export async function getHelpTicketDetail(ticketId: string) {
  const { data, error } = await supabase.rpc('help_ticket_get_detail', {
    p_ticket_id: ticketId,
  })
  if (error) throw rpcError(error, 'Failed to load ticket')
  return data as HelpTicketDetail
}

export async function sendHelpTicketMessage(input: {
  ticketId: string
  messageText: string
}) {
  const { data, error } = await supabase.rpc('help_ticket_send_message', {
    p_ticket_id: input.ticketId,
    p_message_text: input.messageText,
    p_visibility: 'public',
    p_parent_message_id: null,
  })
  if (error) throw rpcError(error, 'Failed to send message')
  return data as { message_id: string; sequence_number: number }
}

export async function verifyHelpTicketResolution(input: {
  ticketId: string
  verified: boolean
  reason?: string | null
}) {
  const { data, error } = await supabase.rpc('help_ticket_verify_resolution', {
    p_ticket_id: input.ticketId,
    p_verified: input.verified,
    p_reason: input.reason ?? null,
  })
  if (error) throw rpcError(error, 'Failed to update resolution')
  return data as { success: boolean; status: string }
}

export async function createHelpTicketAttachmentRow(input: {
  ticketId: string
  originalFilename: string
  fileSizeBytes: number
  fileType?: string | null
  messageId?: string | null
  storageStagingPath?: string | null
}) {
  const { data, error } = await supabase.rpc('help_ticket_attachment_create', {
    p_ticket_id: input.ticketId,
    p_original_filename: input.originalFilename,
    p_file_size_bytes: input.fileSizeBytes,
    p_file_type: input.fileType ?? null,
    p_message_id: input.messageId ?? null,
    p_storage_staging_path: input.storageStagingPath ?? null,
  })
  if (error) throw rpcError(error, 'Failed to create attachment')
  return data as { id: string; status: string }
}

export async function markHelpTicketAttachmentFailed(attachmentId: string, errorText?: string) {
  const { data, error } = await supabase.rpc('help_ticket_attachment_mark_failed', {
    p_attachment_id: attachmentId,
    p_error: errorText ?? null,
  })
  if (error) throw rpcError(error, 'Failed to mark attachment failed')
  return data
}

export async function getUnreadHelpTicketNotificationCount() {
  const { data, error } = await supabase.rpc('get_unread_help_ticket_notification_count')
  if (error) throw rpcError(error, 'Failed to load unread count')
  return Number(data ?? 0)
}
