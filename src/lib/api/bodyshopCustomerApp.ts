// ============================================================================
// BODY SHOP CUSTOMER APP — API CALLS (via Supabase RPCs + edge functions)
// ============================================================================
//
// Every call here is anon-safe: RPCs are session-token scoped (see
// bodyshop_customer_session_context in the 20260906093000_ migration) and
// never touch internal tables directly from the browser. Document
// upload/download goes through the customer-doc-access edge function, which
// is the only place the service-role key is used.

import { supabase, supabaseUrl } from '../supabase'
import type {
  CustomerRepairSummary,
  ThreadSummary,
  ThreadDetail,
  TicketType,
  CustomerDocumentMeta,
} from '../../components/customer-app/types'

const FUNCTIONS_URL = supabaseUrl.replace('.supabase.co', '.supabase.co/functions/v1')

/** Requests an OTP for mobile + registration number. Always returns a generic
 * response so a caller cannot enumerate valid customer identities. */
export async function requestCustomerOtp(mobile: string, regNumber: string): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${FUNCTIONS_URL}/customer-otp-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mobile, reg_number: regNumber }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? 'Unable to request code')
  return data
}

/** Verifies an OTP and returns a session token. */
export async function verifyCustomerOtp(mobile: string, otp: string): Promise<{ session_token: string; expires_in_seconds: number }> {
  const { data, error } = await supabase.rpc('verify_customer_otp', { p_mobile: mobile, p_otp: otp })
  if (error) throw error
  return data
}

export async function getCustomerRepairSummary(sessionToken: string): Promise<CustomerRepairSummary> {
  const { data, error } = await supabase.rpc('get_customer_repair_summary', { p_session_token: sessionToken })
  if (error) throw error
  return data as CustomerRepairSummary
}

// ── Communication (Query / Complaint / Chat) ────────────────────────────────

export async function listCustomerThreads(sessionToken: string): Promise<ThreadSummary[]> {
  const { data, error } = await supabase.rpc('customer_list_threads', { p_session_token: sessionToken })
  if (error) throw error
  return data?.threads ?? []
}

export async function getCustomerThread(sessionToken: string, ticketId: number): Promise<ThreadDetail> {
  const { data, error } = await supabase.rpc('customer_get_thread', { p_session_token: sessionToken, p_ticket_id: ticketId })
  if (error) throw error
  return data as ThreadDetail
}

export async function submitCustomerThread(
  sessionToken: string,
  ticketType: TicketType,
  title: string,
  description: string
): Promise<{ ticket_id: number; ticket_number: string }> {
  const { data, error } = await supabase.rpc('customer_submit_thread', {
    p_session_token: sessionToken,
    p_ticket_type: ticketType,
    p_title: title,
    p_description: description,
  })
  if (error) throw error
  return data
}

export async function postCustomerMessage(sessionToken: string, ticketId: number, body: string): Promise<{ message_id: number }> {
  const { data, error } = await supabase.rpc('customer_post_message', {
    p_session_token: sessionToken,
    p_ticket_id: ticketId,
    p_body: body,
  })
  if (error) throw error
  return data
}

// ── Documents ─────────────────────────────────────────────────────────────

export async function listCustomerDocuments(sessionToken: string): Promise<CustomerDocumentMeta[]> {
  const { data, error } = await supabase.rpc('customer_list_documents', { p_session_token: sessionToken })
  if (error) throw error
  return data?.documents ?? []
}

async function callDocAccess<T>(payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${FUNCTIONS_URL}/customer-doc-access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error ?? 'Document request failed')
  return data as T
}

export async function uploadCustomerDocument(
  sessionToken: string,
  docKey: CustomerDocumentMeta['doc_key'],
  file: File
): Promise<void> {
  const { path, signed_url: signedUrl } = await callDocAccess<{ path: string; token: string; signed_url: string }>({
    action: 'upload_url',
    session_token: sessionToken,
    doc_key: docKey,
  })

  const uploadRes = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!uploadRes.ok) throw new Error('Upload failed')

  await callDocAccess({
    action: 'register',
    session_token: sessionToken,
    doc_key: docKey,
    storage_path: path,
    file_name: file.name,
    content_type: file.type,
    file_size_bytes: file.size,
  })
}

export async function getCustomerDocumentDownloadUrl(
  sessionToken: string,
  docKey: CustomerDocumentMeta['doc_key']
): Promise<string> {
  const { signed_url: signedUrl } = await callDocAccess<{ signed_url: string }>({
    action: 'download_url',
    session_token: sessionToken,
    doc_key: docKey,
  })
  return signedUrl
}
