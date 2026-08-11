import { supabase } from '../supabase'

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
  sla_response_breached_at?: string | null
  sla_resolution_breached_at?: string | null
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

export interface HelpTicketAuditRow {
  id: string
  ticket_id: string
  action_type: string
  changed_by_name: string | null
  changed_at: string
  old_value: string | null
  new_value: string | null
  reason: string | null
}

export async function listHelpTicketCategories() {
  const { data, error } = await supabase.rpc('help_ticket_list_categories')
  if (error) throw error
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
  if (error) throw error
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
  if (error) throw error
  return (data || []) as HelpTicket[]
}

export async function getHelpTicketDetail(ticketId: string) {
  const { data, error } = await supabase.rpc('help_ticket_get_detail', {
    p_ticket_id: ticketId,
  })
  if (error) throw error
  return data as HelpTicketDetail
}

export async function sendHelpTicketMessage(input: {
  ticketId: string
  messageText: string
  visibility?: 'public' | 'internal'
  parentMessageId?: string | null
}) {
  const { data, error } = await supabase.rpc('help_ticket_send_message', {
    p_ticket_id: input.ticketId,
    p_message_text: input.messageText,
    p_visibility: input.visibility ?? 'public',
    p_parent_message_id: input.parentMessageId ?? null,
  })
  if (error) throw error
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
  if (error) throw error
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
  if (error) throw error
  return data as { id: string; status: string }
}

export async function markHelpTicketAttachmentFailed(attachmentId: string, errorText?: string) {
  const { data, error } = await supabase.rpc('help_ticket_attachment_mark_failed', {
    p_attachment_id: attachmentId,
    p_error: errorText ?? null,
  })
  if (error) throw error
  return data
}

export async function listHelpTicketsAdmin(options?: {
  status?: HelpTicketStatus[] | null
  assigneeEmployeeCode?: string | null
  priority?: HelpTicketPriority | null
  categoryKey?: string | null
  raiserDealerCode?: string | null
  limit?: number
  cursor?: string | null
}) {
  const { data, error } = await supabase.rpc('help_ticket_list_admin', {
    p_status: options?.status ?? null,
    p_assignee_employee_code: options?.assigneeEmployeeCode ?? null,
    p_priority: options?.priority ?? null,
    p_category_key: options?.categoryKey ?? null,
    p_raiser_dealer_code: options?.raiserDealerCode ?? null,
    p_limit: options?.limit ?? 50,
    p_cursor: options?.cursor ?? null,
  })
  if (error) throw error
  return (data || []) as HelpTicket[]
}

export async function listHelpTicketsAssignedToMe(limit = 50) {
  const { data, error } = await supabase.rpc('help_ticket_list_assigned_to_me', {
    p_limit: limit,
  })
  if (error) throw error
  return (data || []) as HelpTicket[]
}

export async function assignHelpTicket(ticketId: string, assigneeEmployeeCode: string, reason?: string) {
  const { data, error } = await supabase.rpc('help_ticket_assign', {
    p_ticket_id: ticketId,
    p_assignee_employee_code: assigneeEmployeeCode,
    p_reason: reason ?? null,
  })
  if (error) throw error
  return data
}

export async function updateHelpTicketStatus(input: {
  ticketId: string
  newStatus: HelpTicketStatus
  reason?: string | null
  resolutionNotes?: string | null
}) {
  const { data, error } = await supabase.rpc('help_ticket_update_status', {
    p_ticket_id: input.ticketId,
    p_new_status: input.newStatus,
    p_reason: input.reason ?? null,
    p_resolution_notes: input.resolutionNotes ?? null,
  })
  if (error) throw error
  return data
}

export async function updateHelpTicketPriority(ticketId: string, priority: HelpTicketPriority, reason?: string) {
  const { data, error } = await supabase.rpc('help_ticket_update_priority', {
    p_ticket_id: ticketId,
    p_priority: priority,
    p_reason: reason ?? null,
  })
  if (error) throw error
  return data
}

export async function holdHelpTicket(input: {
  ticketId: string
  holdReason: string
  detail?: string | null
  expectedDate?: string | null
}) {
  const { data, error } = await supabase.rpc('help_ticket_hold', {
    p_ticket_id: input.ticketId,
    p_hold_reason: input.holdReason,
    p_detail: input.detail ?? null,
    p_expected_date: input.expectedDate ?? null,
  })
  if (error) throw error
  return data
}

export async function escalateHelpTicket(ticketId: string, escalateToEmployeeCode: string, reason?: string) {
  const { data, error } = await supabase.rpc('help_ticket_escalate', {
    p_ticket_id: ticketId,
    p_escalate_to_employee_code: escalateToEmployeeCode,
    p_reason: reason ?? null,
  })
  if (error) throw error
  return data
}

export async function markHelpTicketDuplicate(ticketId: string, duplicateOfTicketId: string, reason?: string) {
  const { data, error } = await supabase.rpc('help_ticket_mark_duplicate', {
    p_ticket_id: ticketId,
    p_duplicate_of_ticket_id: duplicateOfTicketId,
    p_reason: reason ?? null,
  })
  if (error) throw error
  return data
}

export async function getHelpTicketAuditLog(ticketId: string) {
  const { data, error } = await supabase.rpc('help_ticket_get_audit_log', {
    p_ticket_id: ticketId,
  })
  if (error) throw error
  return (data || []) as HelpTicketAuditRow[]
}

export async function listHelpTicketAssignees(search?: string) {
  const { data, error } = await supabase.rpc('help_ticket_list_assignees', {
    p_search: search ?? null,
  })
  if (error) throw error
  return (data || []) as Array<{
    employee_code: string
    employee_name: string
    department: string | null
    role: string | null
  }>
}

// ── In-app notifications ─────────────────────────────────────────────────

export interface InAppHelpTicketNotification {
  id: number
  ticket_id: string
  event_type: string
  recipient_type: string
  channel: string
  status: string
  payload: Record<string, unknown> | null
  created_at: string
  seen_at: string | null
  read_at: string | null
  dismissed_at: string | null
}

export async function listMyHelpTicketNotifications(
  limit: number = 10,
  offset: number = 0,
  includeDismissed: boolean = false,
) {
  const { data, error } = await supabase.rpc('list_my_help_ticket_notifications', {
    p_limit: limit,
    p_offset: offset,
    p_include_dismissed: includeDismissed,
  })
  if (error) throw error
  return (data || []) as InAppHelpTicketNotification[]
}

export async function getUnreadHelpTicketNotificationCount() {
  const { data, error } = await supabase.rpc('get_unread_help_ticket_notification_count')
  if (error) throw error
  return Number(data || 0)
}

export async function markHelpTicketNotificationRead(notificationId: number) {
  const { data, error } = await supabase.rpc('mark_help_ticket_notification_read', {
    p_id: notificationId,
  })
  if (error) throw error
  return data
}

export async function markAllHelpTicketNotificationsRead() {
  const { data, error } = await supabase.rpc('mark_all_help_ticket_notifications_read')
  if (error) throw error
  return data
}

/** Deep link for a help-ticket in-app notification. */
export function helpTicketNotificationPath(row: Pick<InAppHelpTicketNotification, 'ticket_id' | 'recipient_type'>): string {
  const ticketId = String(row.ticket_id || '').trim()
  if (!ticketId) return '/help/tickets'
  if (row.recipient_type === 'raiser') return `/help/tickets/${ticketId}`
  return `/help-tickets?ticketId=${encodeURIComponent(ticketId)}`
}
