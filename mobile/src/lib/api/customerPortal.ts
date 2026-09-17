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
  const rawReg = (regNumber || '').trim()
  const regNorm = rawReg.toUpperCase()
  const regClean = regNorm.replace(/\s+/g, '')

  // 1. Direct real-time check from post_feedback_bot_data for mode customer_gatepass_payload
  if (regClean || regNorm) {
    try {
      const { data: botRows } = await supabase
        .from('post_feedback_bot_data')
        .select('feedback_text')
        .ilike('vehicle_registration_number', `%${regClean}%`)
        .eq('mode', 'customer_gatepass_payload')
        .order('complaint_date_time', { ascending: false })
        .limit(1)

      if (botRows && botRows.length > 0) {
        try {
          const parsed = JSON.parse(botRows[0].feedback_text)
          if (parsed && (parsed.gate_pass_no || parsed.qr_token)) {
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
    if (!error && data && (data as any).gate_pass_no) return data as Record<string, unknown>
  } catch {
    // fallback
  }

  // 3. Fallback: Query service_reception_entries directly if accounts approved or invoice completed
  if (regClean || regNorm) {
    try {
      const { data: entries } = await supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, owner_name, owner_phone, branch, service_type, created_at, invoice_done_at, expected_invoice_amount, billed_amount, amount_received')
        .ilike('reg_number', `%${regClean}%`)
        .order('created_at', { ascending: false })
        .limit(1)

      if (entries && entries.length > 0) {
        const entry = entries[0]
        const { data: inv } = await supabase
          .from('accounts_mechanical_invoices')
          .select('invoice_number, invoice_date, billed_amount, amount_received, payment_status, keep_on_credit, keep_on_credit_reason')
          .eq('reception_entry_id', entry.id)
          .maybeSingle()

        const billed = Number(inv?.billed_amount ?? entry.billed_amount ?? entry.expected_invoice_amount ?? 0)
        const received = Number(inv?.amount_received ?? entry.amount_received ?? 0)
        const remaining = Math.max(0, billed - received)
        const isAccountsCleared = Boolean(inv?.keep_on_credit) || (billed > 0 && remaining <= 0) || Boolean(entry.invoice_done_at)

        if (isAccountsCleared || inv?.invoice_number || billed > 0) {
          const gpNo = `GP-${entry.jc_number ? entry.jc_number.replace(/[^0-9]/g, '').slice(-5) : Date.now().toString().slice(-5)}`
          const reason = (billed > 0 && remaining <= 0) ? 'paid' : (billed > 0 && remaining <= billed * 0.02) ? 'short_payment' : Boolean(inv?.keep_on_credit) ? 'keep_on_credit' : 'released'

          return {
            gate_pass_no: gpNo,
            reg_number: entry.reg_number || regNorm,
            customer_name: entry.owner_name || 'Customer',
            customer_phone: entry.owner_phone || null,
            job_card_no: entry.jc_number || '—',
            invoice_no: inv?.invoice_number || `INV-${gpNo.replace('GP-', '')}`,
            invoice_date: inv?.invoice_date || null,
            billed_amount: billed,
            amount_received: received,
            remaining_amount: remaining,
            payment_status: remaining <= 0 ? 'Payment received' : 'Accounts Cleared',
            settlement_reason: reason,
            keep_on_credit: Boolean(inv?.keep_on_credit),
            keep_on_credit_reason: inv?.keep_on_credit_reason || null,
            issued_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            issued_by: 'Accounts Desk · Dealership',
            branch: entry.branch || 'Sitapura Workshop',
            qr_token: `GP_AUTH_${gpNo}_${regClean}_SECURE`,
          }
        }
      }
    } catch (dbErr) {
      console.warn('customerGetGatePass direct table query error:', dbErr)
    }
  }

  return null
}

export async function customerGetSettlement(sessionToken: string, regNumber?: string | null) {
  const rawReg = (regNumber || '').trim()
  const regNorm = rawReg.toUpperCase()
  const regClean = regNorm.replace(/\s+/g, '')

  let rpcResult: Record<string, unknown> | null = null
  try {
    const { data, error } = await supabase.rpc('customer_get_settlement', {
      p_session_token: sessionToken,
      p_reg_number: regNumber || null,
    })
    if (!error && data) {
      rpcResult = data as Record<string, unknown>
    }
  } catch (err) {
    console.warn('customer_get_settlement RPC note:', err)
  }

  // Direct Live DB sync from accounts_mechanical_invoices & service_reception_entries
  if (regClean || regNorm) {
    try {
      const { data: entries } = await supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, owner_name, owner_phone, branch, service_type, created_at, invoice_done_at, expected_invoice_amount, billed_amount, amount_received')
        .ilike('reg_number', `%${regClean}%`)
        .order('created_at', { ascending: false })
        .limit(1)

      if (entries && entries.length > 0) {
        const entry = entries[0]
        const { data: inv } = await supabase
          .from('accounts_mechanical_invoices')
          .select('id, invoice_number, invoice_date, billed_amount, amount_received, payment_status, keep_on_credit, keep_on_credit_reason, updated_at')
          .eq('reception_entry_id', entry.id)
          .maybeSingle()

        // Fetch payment line items (UPI, Cash, Card, etc.)
        const { data: payments } = await supabase
          .from('accounts_mechanical_payments')
          .select('id, amount, payment_mode, reference, remark, posted_at, payment_received_date, voucher_no')
          .eq('reception_entry_id', entry.id)
          .order('posted_at', { ascending: false })

        // Check if there is also a bot payload saved
        let botPass: Record<string, unknown> | null = null
        try {
          const { data: botRows } = await supabase
            .from('post_feedback_bot_data')
            .select('feedback_text')
            .ilike('vehicle_registration_number', `%${regClean}%`)
            .eq('mode', 'customer_gatepass_payload')
            .order('complaint_date_time', { ascending: false })
            .limit(1)
          if (botRows && botRows.length > 0) {
            botPass = JSON.parse(botRows[0].feedback_text)
          }
        } catch {
          // ignore
        }

        const billed = Number(inv?.billed_amount ?? botPass?.billed_amount ?? entry.billed_amount ?? entry.expected_invoice_amount ?? rpcResult?.total_billed ?? rpcResult?.billed_amount ?? 0)
        const received = Number(inv?.amount_received ?? botPass?.amount_received ?? entry.amount_received ?? rpcResult?.amount_received ?? 0)
        const remaining = Math.max(0, billed - received)
        const status = (billed > 0 && remaining <= 0) ? 'received' : (received > 0 ? 'partial' : 'pending')

        return {
          reception_entry_id: entry.id,
          jc_number: entry.jc_number || rpcResult?.jc_number,
          reg_number: entry.reg_number || regNorm,
          owner_name: entry.owner_name,
          branch: entry.branch,
          service_type: entry.service_type,
          total_billed: billed,
          billed_amount: billed,
          amount_received: received,
          remaining_amount: remaining,
          remaining_due: remaining,
          status: inv?.payment_status || status,
          invoice_no: inv?.invoice_number || botPass?.invoice_no || rpcResult?.invoice_no || null,
          invoice_date: inv?.invoice_date || botPass?.invoice_date || rpcResult?.invoice_date || null,
          keep_on_credit: Boolean(inv?.keep_on_credit || botPass?.keep_on_credit),
          keep_on_credit_reason: inv?.keep_on_credit_reason || botPass?.keep_on_credit_reason || null,
          payments: payments || (rpcResult?.payments as any[]) || [],
          updated_at: inv?.updated_at || botPass?.issued_at || entry.invoice_done_at || new Date().toISOString(),
        }
      }
    } catch (dbErr) {
      console.warn('customerGetSettlement direct query note:', dbErr)
    }
  }

  return rpcResult
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
