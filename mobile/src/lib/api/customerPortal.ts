import { supabase } from '../supabase'

function rpcErrorMessage(error: { message?: string } | null, fallback: string): string {
  const raw = error?.message || ''
  if (raw.includes('Session expired')) return 'Session expired.'
  if (raw.includes('Vehicle not found')) return 'Vehicle not found for this session.'
  if (raw.includes('forbidden')) return 'Not allowed.'
  return fallback
}

export async function customerGetActiveJob(sessionToken: string, regNumber?: string | null) {
  const { data, error } = await supabase.rpc('customer_get_active_job', {
    p_session_token: sessionToken,
    p_reg_number: regNumber || null,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to load job.'))

  const res = (data || {}) as {
    phone?: string
    vehicle?: Record<string, unknown> | null
    job?: Record<string, unknown> | null
  }

  const job = res.job ? { ...res.job } : null
  const regNorm = (regNumber || (res.vehicle?.reg_number as string) || (job?.reg_number as string) || '').trim().toUpperCase().replace(/\s+/g, '')
  const jc = (job?.jc_number as string) || (res.vehicle?.jc_number as string) || ''
  const jcNorm = jc.trim().toUpperCase()

  // Enrich with technician & bay if missing from RPC
  if (job && (!job.technician_name || !job.bay_no)) {
    try {
      // 1. Check technician_assignments by JC or digits
      if (jcNorm) {
        const lastDigits = jcNorm.replace(/[^0-9]/g, '').slice(-6)
        const orClause = lastDigits ? `job_card_number.eq.${jcNorm},job_card_number.ilike.%${lastDigits}%` : `job_card_number.eq.${jcNorm}`
        const { data: assignRows } = await supabase
          .from('technician_assignments')
          .select('technician_name, technician_code, bay_no, work_status, assigned_at')
          .or(orClause)
          .order('id', { ascending: false })
          .limit(1)

        if (assignRows && assignRows.length > 0 && assignRows[0].technician_name) {
          if (assignRows[0].technician_name.toLowerCase() !== 'not required') {
            job.technician_name = assignRows[0].technician_name
            job.technician_code = assignRows[0].technician_code
            job.bay_no = assignRows[0].bay_no || job.bay_no
            job.work_status = assignRows[0].work_status || job.work_status
          }
        }
      }

      // 2. Check post_feedback_bot_data for technician_allocation_payload
      if (!job.technician_name && regNorm) {
        const { data: botRows } = await supabase
          .from('post_feedback_bot_data')
          .select('feedback_text')
          .eq('vehicle_registration_number', regNorm)
          .eq('mode', 'technician_allocation_payload')
          .order('complaint_date_time', { ascending: false })
          .limit(1)

        if (botRows && botRows.length > 0) {
          try {
            const parsed = JSON.parse(botRows[0].feedback_text)
            if (parsed.technician_name && parsed.technician_name.toLowerCase() !== 'not required') {
              job.technician_name = parsed.technician_name
              job.technician_code = parsed.technician_code
              job.bay_no = parsed.bay_no || job.bay_no
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      console.warn('Enrich technician error:', e)
    }
  }

  return { ...res, job }
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
  const regNorm = (regNumber || '').trim().toUpperCase().replace(/\s+/g, '')

  // 1. Direct real-time check from post_feedback_bot_data for mode customer_gatepass_payload
  if (regNorm) {
    try {
      const { data: botRows } = await supabase
        .from('post_feedback_bot_data')
        .select('feedback_text')
        .eq('vehicle_registration_number', regNorm)
        .eq('mode', 'customer_gatepass_payload')
        .order('complaint_date_time', { ascending: false })
        .limit(1)

      if (botRows && botRows.length > 0) {
        try {
          const parsed = JSON.parse(botRows[0].feedback_text)
          if (parsed && parsed.gate_pass_no) {
            return parsed as Record<string, unknown>
          }
        } catch {
          // ignore
        }
      }
    } catch (e) {
      console.warn('customerGetGatePass bot payload error:', e)
    }
  }

  // 2. Try RPC
  try {
    const { data, error } = await supabase.rpc('customer_get_gate_pass', {
      p_session_token: sessionToken,
      p_reg_number: regNumber || null,
    })
    if (!error && data) return data as Record<string, unknown>
  } catch {
    // fallback
  }

  return null
}

export async function customerGetSettlement(sessionToken: string, regNumber?: string | null) {
  const { data, error } = await supabase.rpc('customer_get_settlement', {
    p_session_token: sessionToken,
    p_reg_number: regNumber || null,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to load settlement.'))
  return data as Record<string, unknown> | null
}

export async function customerSubmitBooking(
  sessionToken: string,
  regNumber: string,
  payload: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc('customer_submit_booking', {
    p_session_token: sessionToken,
    p_reg_number: regNumber,
    p_payload: payload,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to submit booking.'))
  return data
}

export async function customerGetRepairCard(sessionToken: string, regNumber?: string | null) {
  const { data, error } = await supabase.rpc('customer_get_repair_card', {
    p_session_token: sessionToken,
    p_reg_number: regNumber || null,
  })
  if (error) throw new Error(rpcErrorMessage(error, 'Unable to load repair tracker.'))
  return data as Record<string, unknown> | null
}
