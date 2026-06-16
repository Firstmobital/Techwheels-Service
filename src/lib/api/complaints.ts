// ============================================================================
// COMPLAINTS MODULE — API CALLS (via Supabase RPCs)
// ============================================================================

import { supabase } from '../supabase'

export interface InAppComplaintNotification {
  id: number
  complaint_id: number
  event_type: string
  recipient_type: string
  channel: 'in_app'
  status: string
  payload: Record<string, unknown> | null
  created_at: string
  seen_at: string | null
  read_at: string | null
  dismissed_at: string | null
}

// ── Customer Portal RPCs ─────────────────────────────────────────────────

/**
 * Get complaint data by token (customer portal)
 * Returns mode ('raise' or 'view') and ticket details
 */
export async function getComplaintByToken(token: string) {
  const { data, error } = await supabase.rpc('get_complaint_by_token', { p_token: token })
  if (error) throw error
  return data
}

/**
 * Raise a new complaint (single-use, consumes the link)
 */
export async function raiseComplaint(
  token: string,
  category: string,
  title: string,
  description: string,
  options?: {
    severity_self?: string
    customer_name?: string
    customer_phone?: string
  }
) {
  const { data, error } = await supabase.rpc('raise_complaint', {
    p_token: token,
    p_category: category,
    p_title: title,
    p_description: description,
    p_severity_self: options?.severity_self || null,
    p_customer_name: options?.customer_name || null,
    p_customer_phone: options?.customer_phone || null,
  })
  if (error) throw error
  return data
}

/**
 * Add a customer message to a complaint
 */
export async function addCustomerMessage(token: string, body: string) {
  const { data, error } = await supabase.rpc('add_customer_message', {
    p_token: token,
    p_body: body,
  })
  if (error) throw error
  return data
}

/**
 * Submit CSAT rating (customer satisfaction)
 */
export async function submitCsat(
  token: string,
  rating: number,
  comment?: string
) {
  const { data, error } = await supabase.rpc('submit_csat', {
    p_token: token,
    p_rating: rating,
    p_comment: comment || null,
  })
  if (error) throw error
  return data
}

/**
 * Reopen a complaint (customer-initiated)
 */
export async function reopenComplaint(token: string, reason: string) {
  const { data, error } = await supabase.rpc('reopen_complaint', {
    p_token: token,
    p_reason: reason,
  })
  if (error) throw error
  return data
}

// ── Staff RPCs ───────────────────────────────────────────────────────────

/**
 * Acknowledge a complaint (staff)
 */
export async function acknowledge(complaintId: bigint) {
  const { data, error } = await supabase.rpc('acknowledge', { p_complaint_id: complaintId })
  if (error) throw error
  return data
}

/**
 * Move complaint to in_progress
 */
export async function startProgress(complaintId: bigint) {
  const { data, error } = await supabase.rpc('start_progress', { p_complaint_id: complaintId })
  if (error) throw error
  return data
}

/**
 * Resolve a complaint
 */
export async function resolve(complaintId: bigint) {
  const { data, error } = await supabase.rpc('resolve', { p_complaint_id: complaintId })
  if (error) throw error
  return data
}

/**
 * Close a complaint
 */
export async function close(complaintId: bigint) {
  const { data, error } = await supabase.rpc('close', { p_complaint_id: complaintId })
  if (error) throw error
  return data
}

/**
 * Set complaint priority
 */
export async function setPriority(
  complaintId: bigint,
  priority: string
) {
  const { data, error } = await supabase.rpc('set_priority', {
    p_complaint_id: complaintId,
    p_priority: priority,
  })
  if (error) throw error
  return data
}

/**
 * Reassign complaint to another staff
 */
export async function reassign(
  complaintId: bigint,
  assignedToUserId: string
) {
  const { data, error } = await supabase.rpc('reassign', {
    p_complaint_id: complaintId,
    p_assigned_to_user_id: assignedToUserId,
  })
  if (error) throw error
  return data
}

/**
 * Escalate a complaint
 */
export async function escalate(
  complaintId: bigint,
  reason: string
) {
  const { data, error } = await supabase.rpc('escalate', {
    p_complaint_id: complaintId,
    p_escalation_reason: reason,
  })
  if (error) throw error
  return data
}

/**
 * Add staff message (or internal note)
 */
export async function addStaffMessage(
  complaintId: bigint,
  body: string,
  isInternal: boolean = false
) {
  const { data, error } = await supabase.rpc('add_staff_message', {
    p_complaint_id: complaintId,
    p_body: body,
    p_is_internal: isInternal,
  })
  if (error) throw error
  return data
}

/**
 * Generate complaint link for a reception entry
 */
export async function generateComplaintLink(
  receptionEntryId: bigint
) {
  const { data, error } = await supabase.rpc('generate_complaint_link', {
    p_reception_entry_id: receptionEntryId,
  })
  if (error) throw error
  return data
}

/**
 * List current user's in-app complaint notifications.
 */
export async function listMyComplaintNotifications(
  limit: number = 10,
  offset: number = 0,
  includeDismissed: boolean = false,
) {
  const { data, error } = await supabase.rpc('list_my_complaint_notifications', {
    p_limit: limit,
    p_offset: offset,
    p_include_dismissed: includeDismissed,
  })
  if (error) throw error
  return (data || []) as InAppComplaintNotification[]
}

/**
 * Get unread in-app complaint notification count for current user.
 */
export async function getUnreadComplaintNotificationCount() {
  const { data, error } = await supabase.rpc('get_unread_complaint_notification_count')
  if (error) throw error
  return Number(data || 0)
}

/**
 * Mark one in-app complaint notification as read.
 */
export async function markComplaintNotificationRead(notificationId: number) {
  const { data, error } = await supabase.rpc('mark_complaint_notification_read', {
    p_notification_id: notificationId,
  })
  if (error) throw error
  return data
}

/**
 * Mark all in-app complaint notifications as read for current user.
 */
export async function markAllComplaintNotificationsRead() {
  const { data, error } = await supabase.rpc('mark_all_complaint_notifications_read')
  if (error) throw error
  return data
}
