// ============================================================================
// COMPLAINTS MODULE — API CALLS (via Supabase RPCs)
// ============================================================================

import { supabase } from '../supabase'

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
