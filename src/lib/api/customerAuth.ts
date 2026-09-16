import { supabase } from '../supabase'
import type { CustomerVehicle } from './customer'

export interface CustomerSessionResult {
  session_token: string
  expires_at?: string
  phone: string
  vehicles: CustomerVehicle[]
}

function mapVehicle(raw: Record<string, unknown>, index: number): CustomerVehicle {
  const km = raw.km_reading
  return {
    id: Number(raw.id) || index + 1,
    reg_number: String(raw.reg_number || ''),
    model: (raw.model as string | null) ?? null,
    vin: (raw.vin as string | null) ?? null,
    owner_name: (raw.owner_name as string | null) ?? null,
    owner_phone: (raw.owner_phone as string | null) ?? null,
    service_type: (raw.service_type as string | null) ?? null,
    sa_name: (raw.sa_name as string | null) ?? null,
    sa_display_name: (raw.sa_display_name as string | null) ?? null,
    jc_number: (raw.jc_number as string | null) ?? null,
    branch: (raw.branch as string | null) ?? null,
    created_at: String(raw.created_at || new Date().toISOString()),
    invoice_done_at: (raw.invoice_done_at as string | null) ?? null,
    km_reading: km == null || km === '' ? null : Number(km),
    remark: (raw.remark as string | null) ?? null,
    estimate_storage_path: (raw.estimate_storage_path as string | null) ?? null,
    estimate_drive_url: (raw.estimate_drive_url as string | null) ?? null,
    invoice_storage_path: (raw.invoice_storage_path as string | null) ?? null,
    invoice_drive_url: (raw.invoice_drive_url as string | null) ?? null,
  }
}

function rpcErrorMessage(error: { message?: string } | null, fallback: string): string {
  const raw = error?.message || ''
  if (raw.includes('Invalid mobile number')) return 'Invalid mobile number.'
  if (raw.includes('No vehicle found')) return 'No vehicle found for this mobile number.'
  if (raw.includes('Session expired')) return 'Session expired.'
  if (raw.includes('Vehicle not found')) return 'Vehicle not found for this session.'
  if (raw.includes('forbidden')) return 'Not allowed.'
  return fallback
}

export async function customerStartSession(
  username: string,
  password: string
): Promise<{ success: boolean; data?: CustomerSessionResult; error?: string }> {
  const { data, error } = await supabase.rpc('customer_start_session', {
    p_username: username,
    p_password: password,
  })

  if (error || !data) {
    return { success: false, error: rpcErrorMessage(error, 'Invalid mobile number.') }
  }

  const payload = data as CustomerSessionResult
  const vehicles = Array.isArray(payload.vehicles)
    ? payload.vehicles.map((v, i) => mapVehicle(v as unknown as Record<string, unknown>, i))
    : []

  if (!payload.session_token || vehicles.length === 0) {
    return { success: false, error: 'No vehicle found for this mobile number.' }
  }

  return {
    success: true,
    data: {
      session_token: payload.session_token,
      expires_at: payload.expires_at,
      phone: payload.phone,
      vehicles,
    },
  }
}

export async function customerEndSession(sessionToken: string | null | undefined): Promise<void> {
  if (!sessionToken) return
  await supabase.rpc('customer_end_session', { p_session_token: sessionToken })
}

export async function customerListMyVehicles(sessionToken: string): Promise<CustomerVehicle[]> {
  const { data, error } = await supabase.rpc('customer_list_my_vehicles', {
    p_session_token: sessionToken,
  })
  if (error || !data) return []
  return (data as Record<string, unknown>[]).map((v, i) => mapVehicle(v, i))
}

export async function customerGetActiveJob(sessionToken: string, regNumber?: string | null) {
  const { data, error } = await supabase.rpc('customer_get_active_job', {
    p_session_token: sessionToken,
    p_reg_number: regNumber || null,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to load job.'))
  return data as {
    phone?: string
    vehicle?: Record<string, unknown> | null
    job?: Record<string, unknown> | null
  }
}

export async function customerGetServiceHistory(sessionToken: string, regNumber?: string | null) {
  const { data, error } = await supabase.rpc('customer_get_service_history', {
    p_session_token: sessionToken,
    p_reg_number: regNumber || null,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to load history.'))
  return (data || []) as Record<string, unknown>[]
}

export async function customerSubmitComplaint(
  sessionToken: string,
  regNumber: string,
  payload: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc('customer_submit_complaint', {
    p_session_token: sessionToken,
    p_reg_number: regNumber,
    p_payload: payload,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to submit complaint.'))
  return data
}

export async function customerSubmitFeedback(
  sessionToken: string,
  regNumber: string,
  payload: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc('customer_submit_feedback', {
    p_session_token: sessionToken,
    p_reg_number: regNumber,
    p_payload: payload,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to submit feedback.'))
  return data
}

export async function customerListEstimates(sessionToken: string, regNumber?: string | null) {
  const { data, error } = await supabase.rpc('customer_list_estimates', {
    p_session_token: sessionToken,
    p_reg_number: regNumber || null,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to load estimates.'))
  return (data || []) as Record<string, unknown>[]
}

export async function customerSetEstimateDecision(
  sessionToken: string,
  estimateId: string,
  decision: 'approve' | 'reject',
  reason?: string
) {
  const { data, error } = await supabase.rpc('customer_set_estimate_decision', {
    p_session_token: sessionToken,
    p_estimate_id: estimateId,
    p_decision: decision,
    p_reason: reason || null,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to update estimate.'))
  return data
}

export async function customerGetGatePass(sessionToken: string, regNumber?: string | null) {
  const { data, error } = await supabase.rpc('customer_get_gate_pass', {
    p_session_token: sessionToken,
    p_reg_number: regNumber || null,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to load gate pass.'))
  return data as Record<string, unknown> | null
}
