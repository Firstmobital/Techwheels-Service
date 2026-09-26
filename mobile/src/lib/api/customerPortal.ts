import { Linking } from 'react-native'
import { getSupabaseBaseUrl } from '../env'
import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../supabase'

const apiCache = new Map<string, { timestamp: number; data: any }>()
const CACHE_TTL_MS = 6000 // 6 seconds cache

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    apiCache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache<T>(key: string, data: T): T {
  apiCache.set(key, { timestamp: Date.now(), data })
  return data
}

export function clearCustomerPortalCache() {
  apiCache.clear()
}

function rpcErrorMessage(error: { message?: string } | null, fallback: string): string {
  const raw = error?.message || ''
  if (raw.includes('Session expired')) return 'Session expired.'
  if (raw.includes('Vehicle not found')) return 'Vehicle not found for this session.'
  if (raw.includes('forbidden')) return 'Not allowed.'
  return fallback
}

export async function customerGetActiveJob(sessionToken: string, regNumber?: string | null) {
  const cacheKey = `active_job_${sessionToken}_${regNumber || 'default'}`
  const cached = getCached<any>(cacheKey)
  if (cached) return cached

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

  return setCache(cacheKey, { ...res, job })
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

export async function customerGetComplaints(sessionToken: string, regNumber?: string | null) {
  const rawReg = (regNumber || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!rawReg) return []

  try {
    const { data: rows, error } = await supabase
      .from('post_feedback_bot_data')
      .select('id, feedback_text, service_type, service_advisor_name, branch, model, complaint_date_time, created_at')
      .ilike('vehicle_registration_number', `%${rawReg}%`)
      .eq('mode', 'customer_portal_concern')
      .order('id', { ascending: false })

    if (error) {
      console.warn('customerGetComplaints error:', error)
      return []
    }

    return (rows || []).map((r) => ({
      id: r.id,
      text: r.feedback_text,
      service_type: r.service_type,
      sa_name: r.service_advisor_name,
      branch: r.branch,
      model: r.model,
      created_at: r.complaint_date_time || r.created_at,
    }))
  } catch (err) {
    console.warn('customerGetComplaints error:', err)
    return []
  }
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
  const rawReg = (regNumber || '').trim()
  const regClean = rawReg.toUpperCase().replace(/[\s-]/g, '')
  const results: Record<string, unknown>[] = []
  const seenEstNos = new Set<string>()

  // 1. Direct query customer_estimates table in Supabase
  if (regClean) {
    try {
      const { data: estRows, error: estErr } = await supabase
        .from('customer_estimates')
        .select('*')
        .ilike('vehicle_registration_number', `%${regClean}%`)
        .order('created_at', { ascending: false })

      if (!estErr && estRows && estRows.length > 0) {
        for (const row of estRows) {
          const estNo = String(row.estimate_no || row.id || '')
          if (estNo && !seenEstNos.has(estNo)) {
            seenEstNos.add(estNo)
            results.push(row as Record<string, unknown>)
          }
        }
      }
    } catch (e) {
      console.warn('customerListEstimates customer_estimates query warning:', e)
    }
  }

  // 2. Query post_feedback_bot_data for customer_estimate_payload
  if (regClean) {
    try {
      const { data: botRows, error: botErr } = await supabase
        .from('post_feedback_bot_data')
        .select('id, feedback_text, complaint_date_time, created_at')
        .ilike('vehicle_registration_number', `%${regClean}%`)
        .eq('mode', 'customer_estimate_payload')
        .order('complaint_date_time', { ascending: false })

      if (!botErr && botRows && botRows.length > 0) {
        for (const row of botRows) {
          try {
            const parsed = JSON.parse(row.feedback_text)
            const estNo = String(parsed.estimate_no || `bot-${row.id}`)
            if (parsed && !seenEstNos.has(estNo)) {
              seenEstNos.add(estNo)
              results.push({
                ...parsed,
                estimate_id: estNo,
                estimate_no: estNo,
              })
            }
          } catch {
            // ignore JSON parse error
          }
        }
      }
    } catch (e) {
      console.warn('customerListEstimates bot payload warning:', e)
    }
  }

  // 3. RPC Fallback
  try {
    const { data: rpcRows, error: rpcErr } = await supabase.rpc('customer_list_estimates', {
      p_session_token: sessionToken,
      p_reg_number: regNumber || null,
    })
    if (!rpcErr && Array.isArray(rpcRows) && rpcRows.length > 0) {
      for (const row of rpcRows) {
        const estNo = String(row.estimate_no || row.estimate_id || '')
        if (estNo && !seenEstNos.has(estNo)) {
          seenEstNos.add(estNo)
          results.push(row as Record<string, unknown>)
        }
      }
    }
  } catch {
    // ignore
  }

  // 4. Overlay latest real-time approval/rejection event to ensure freshest state
  if (regClean && results.length > 0) {
    try {
      const { data: eventRows } = await supabase
        .from('post_feedback_bot_data')
        .select('mode, feedback_text, complaint_date_time, created_at')
        .ilike('vehicle_registration_number', `%${regClean}%`)
        .in('mode', ['customer_estimate_approval', 'customer_estimate_rejection'])
        .order('complaint_date_time', { ascending: false })
        .limit(10)

      if (eventRows && eventRows.length > 0) {
        for (const ev of eventRows) {
          const isAppr = ev.mode === 'customer_estimate_approval'
          const status = isAppr ? 'Approved' : 'Rejected'
          let reason: string | undefined = undefined
          if (!isAppr && ev.feedback_text) {
            const match = ev.feedback_text.match(/Reason:\s*(.+)$/i)
            reason = match ? match[1].trim() : ev.feedback_text
          }

          const estMatch = ev.feedback_text?.match(/Estimate\s*#?([A-Za-z0-9_-]+)/i)
          const targetEstNo = estMatch ? estMatch[1] : null

          for (const item of results) {
            if (!targetEstNo || String(item.estimate_no || item.estimate_id) === targetEstNo) {
              if (item.status !== 'Approved' && item.status !== 'Rejected') {
                item.status = status
                if (reason) item.rejection_reason = reason
              }
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return results
}

export async function customerSetEstimateDecision(
  sessionToken: string,
  estimateId: string,
  decision: 'approve' | 'reject',
  reason?: string,
  regNumber?: string | null
) {
  const isApproved = decision === 'approve'
  const finalStatus = isApproved ? 'Approved' : 'Rejected'
  const finalReason = !isApproved ? (reason || 'Estimate rejected by customer').trim() : null
  const nowIso = new Date().toISOString()
  const rawReg = (regNumber || '').trim()
  const regClean = rawReg.toUpperCase().replace(/[\s-]/g, '')

  // 1. Attempt backend RPC
  try {
    const { error } = await supabase.rpc('customer_set_estimate_decision', {
      p_session_token: sessionToken,
      p_estimate_id: estimateId,
      p_decision: decision,
      p_reason: finalReason,
    })
    if (error) {
      console.warn('customer_set_estimate_decision RPC warning:', error)
    }
  } catch (rpcErr) {
    console.warn('customer_set_estimate_decision RPC error:', rpcErr)
  }

  // 2. Direct database update to customer_estimates
  try {
    const updatePayload: Record<string, unknown> = {
      status: finalStatus,
      rejection_reason: finalReason,
      updated_at: nowIso,
    }
    if (isApproved) {
      updatePayload.approved_at = nowIso
    }

    const { error: estErr } = await supabase
      .from('customer_estimates')
      .update(updatePayload)
      .or(`estimate_no.eq.${estimateId},id.eq.${estimateId}`)

    if (estErr && regClean) {
      await supabase
        .from('customer_estimates')
        .update(updatePayload)
        .eq('vehicle_registration_number', regClean)
    }
  } catch (e) {
    console.warn('Direct customer_estimates update error:', e)
  }

  // 3. Update existing post_feedback_bot_data customer_estimate_payload
  if (regClean) {
    try {
      const { data: botRows } = await supabase
        .from('post_feedback_bot_data')
        .select('id, feedback_text')
        .ilike('vehicle_registration_number', `%${regClean}%`)
        .eq('mode', 'customer_estimate_payload')

      if (botRows && botRows.length > 0) {
        for (const row of botRows) {
          try {
            const parsed = JSON.parse(row.feedback_text)
            if (parsed) {
              parsed.status = finalStatus
              if (finalReason) parsed.rejection_reason = finalReason
              if (isApproved) parsed.approved_at = nowIso
              parsed.updated_at = nowIso

              await supabase
                .from('post_feedback_bot_data')
                .update({
                  feedback_text: JSON.stringify(parsed),
                  complaint_date_time: nowIso,
                })
                .eq('id', row.id)
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      console.warn('Update bot payload estimate error:', e)
    }
  }

  // 4. ALWAYS Insert real-time event record into post_feedback_bot_data for Service Advisor Page
  if (regClean) {
    try {
      const eventMode = isApproved ? 'customer_estimate_approval' : 'customer_estimate_rejection'
      const feedbackText = isApproved
        ? `[Estimate Approved] Customer approved Estimate #${estimateId} via app.`
        : `[Estimate Rejected] Estimate #${estimateId} rejected. Reason: ${finalReason}`

      await supabase.from('post_feedback_bot_data').insert([
        {
          vehicle_registration_number: regClean,
          feedback_text: feedbackText,
          service_type: 'Estimate decision',
          mode: eventMode,
          complaint_date_time: nowIso,
        },
      ])
    } catch (e) {
      console.warn('Insert bot estimate decision event error:', e)
    }
  }

  return { ok: true, status: finalStatus, estimate_id: estimateId }
}

export async function customerGetGatePass(sessionToken: string, regNumber?: string | null) {
  const cacheKey = `gatepass_${sessionToken}_${regNumber || 'default'}`
  const cached = getCached<Record<string, unknown>>(cacheKey)
  if (cached) return cached

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
            return setCache(cacheKey, parsed as Record<string, unknown>)
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
    if (!error && data && (data as any).gate_pass_no) return setCache(cacheKey, data as Record<string, unknown>)
  } catch {
    // fallback
  }

  return null
}

export async function customerGetSettlement(sessionToken: string, regNumber?: string | null) {
  const cacheKey = `settlement_${sessionToken}_${regNumber || 'default'}`
  const cached = getCached<Record<string, unknown>>(cacheKey)
  if (cached) return cached

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

  // If RPC returned valid billed data, trust it completely.
  // The RPC is SECURITY DEFINER and already fetches accounts_mechanical_invoices
  // + accounts_mechanical_payments which the anon client cannot read directly (RLS).
  if (rpcResult && (rpcResult.total_billed != null || rpcResult.billed_amount != null)) {
    const rpcBilled = Number(rpcResult.total_billed ?? rpcResult.billed_amount ?? 0)
    // Only skip direct queries if we have a real amount; if 0 we still try direct path
    if (rpcBilled > 0) {
      const payments = Array.isArray(rpcResult.payments) ? rpcResult.payments : []
      return setCache(cacheKey, {
        ...rpcResult,
        payments,
        total_billed: rpcBilled,
        billed_amount: rpcBilled,
        amount_received: Number(rpcResult.amount_received ?? 0),
        remaining_amount: Number(rpcResult.remaining_amount ?? rpcResult.remaining_due ?? Math.max(0, rpcBilled - Number(rpcResult.amount_received ?? 0))),
        remaining_due: Number(rpcResult.remaining_due ?? rpcResult.remaining_amount ?? Math.max(0, rpcBilled - Number(rpcResult.amount_received ?? 0))),
      })
    }
  }

  // Direct Live DB sync from accounts_mechanical_invoices & bodyshop_settlements
  // (Only reached when RPC returned null or billed_amount = 0)
  if (regClean || regNorm) {
    try {
      // 1. Fetch latest mechanical service reception entry
      // Order: invoice_done_at DESC first (most recently invoiced), then created_at DESC
      const { data: entries } = await supabase
        .from('service_reception_entries')
        .select('id, jc_number, reg_number, owner_name, owner_phone, branch, service_type, created_at, invoice_done_at, expected_invoice_amount, invoice_storage_path, invoice_file_name, invoice_drive_url')
        .or(`reg_number.ilike.%${regClean}%,reg_number.ilike.%${rawReg}%`)
        .order('invoice_done_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)

      const entry = entries && entries.length > 0 ? entries[0] : null

      // 2. Determine if the current service entry is a mechanical (non-bodyshop) service
      const entryServiceType = String(entry?.service_type || '').toLowerCase()
      const entryIsMechanical = entry && !entryServiceType.includes('accident') && !entryServiceType.includes('bodyshop')

      // 3. Fetch latest bodyshop repair card (always fetch, routing is via priority logic below)
      const { data: bsCards } = await supabase
        .from('bodyshop_repair_cards')
        .select('*')
        .or(`reg_number.ilike.%${regClean}%,reg_number.ilike.%${rawReg}%`)
        .order('created_at', { ascending: false })
        .limit(1)
      const bsCard: Record<string, unknown> | null = bsCards && bsCards.length > 0 ? (bsCards[0] as Record<string, unknown>) : null

      // Priority logic:
      // - If we have a mechanical service entry (non-bodyshop service_type), ALWAYS prefer it.
      //   The bodyshop path is only used when there's no mechanical entry or it's a bodyshop entry.
      // - Bodyshop path is used when:
      //   (a) No mechanical entry exists, but bodyshop card does, OR
      //   (b) The entry is itself a bodyshop/accidental type
      const entryTime = entry ? new Date(entry.invoice_done_at || entry.created_at || 0).getTime() : 0
      const bsTime = bsCard ? new Date(String(bsCard.updated_at || bsCard.created_at || 0)).getTime() : 0

      // Use bodyshop path only when there is no mechanical service entry OR the entry is bodyshop type
      const useBodyshopPath = bsCard && (!entry || !entryIsMechanical) && bsTime > 0

      // If Bodyshop is the active case
      if (useBodyshopPath) {
        const repairCardId = Number(bsCard.id)
        const { data: bsSettle } = await supabase
          .from('bodyshop_settlements')
          .select('*')
          .eq('repair_card_id', repairCardId)
          .maybeSingle()

        const { data: bsLines } = await supabase
          .from('bodyshop_settlement_lines')
          .select('*')
          .eq('repair_card_id', repairCardId)
          .eq('party', 'customer')
          .eq('is_reversed', false)
          .order('txn_date', { ascending: false })

        const doAmount = Number(bsSettle?.do_amount ?? 0)
        const isCashCase = doAmount === 0 && (bsCard.customer_type === 'cash' || !bsCard.insurance_company)
        const isInsuranceClaim = !isCashCase && (doAmount > 0 || Boolean(bsCard.insurance_company) || Boolean(bsCard.claim_intimation_no) || true)
        const billed = Number(bsSettle?.invoice_amount ?? bsCard.expected_invoice_amount ?? (rpcResult?.total_billed ?? rpcResult?.billed_amount ?? 0))
        const doRemaining = Number(bsSettle?.insurance_due_amount ?? doAmount)
        const diffAmount = Number(bsSettle?.customer_diff_amount ?? (doAmount > 0 ? Math.max(0, billed - doAmount) : billed))
        const customerReceived = Number(
          bsSettle?.customer_posted_amount ??
          (Array.isArray(bsLines) ? bsLines.reduce((sum, l) => sum + (Number((l as any).amount) || 0), 0) : 0)
        )
        const customerRemaining = bsSettle?.customer_remaining_amount != null
          ? Number(bsSettle.customer_remaining_amount)
          : Math.max(0, diffAmount - customerReceived)

        const isCustomerCleared = customerRemaining <= 0 && (billed > 0 || diffAmount > 0 || isInsuranceClaim)
        const overallStatus = isCustomerCleared ? 'received' : (customerReceived > 0 ? 'partial' : 'pending')

        const paymentList = (Array.isArray(bsLines) ? bsLines : []).map((l: any) => ({
          id: String(l.id),
          amount: Number(l.amount) || 0,
          payment_mode: l.payment_mode || 'Accounts Cleared',
          reference: l.reference || 'Bodyshop Accounts Clearance',
          posted_at: l.txn_date || l.created_at || new Date().toISOString(),
          payment_received_date: l.txn_date ? new Date(l.txn_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : null,
          voucher_no: l.voucher_no || null,
        }))

        return setCache(cacheKey, {
          is_bodyshop: true,
          is_insurance_claim: isInsuranceClaim,
          insurance_company: bsCard.insurance_company || bsSettle?.invoice_account || null,
          insurance_policy_no: bsCard.insurance_policy_no || null,
          claim_intimation_no: bsCard.claim_intimation_no || null,
          do_amount: doAmount,
          do_remaining: doRemaining,
          customer_diff_amount: diffAmount,
          customer_settlement_kind: bsSettle?.customer_settlement_kind || 'due',
          customer_remaining_amount: customerRemaining,
          customer_posted_amount: customerReceived,
          outstanding_amount: Number(bsSettle?.outstanding_amount ?? (doRemaining + customerRemaining)),
          reception_entry_id: bsCard.reception_entry_id,
          jc_number: bsCard.job_card_no || rpcResult?.jc_number,
          reg_number: bsCard.reg_number || regNorm,
          owner_name: bsCard.customer_name,
          branch: bsCard.branch,
          service_type: 'Accidental / Bodyshop Repair',
          total_billed: billed,
          billed_amount: billed,
          amount_received: customerReceived,
          remaining_amount: customerRemaining,
          remaining_due: customerRemaining,
          status: bsSettle?.derived_payment_status || overallStatus,
          invoice_no: bsSettle?.invoice_number || null,
          invoice_date: bsSettle?.invoice_date || null,
          payments: paymentList,
          updated_at: bsSettle?.updated_at || bsCard.created_at || new Date().toISOString(),
        })
      }

      // 3. Mechanical Service Reception & Accounts Entry
      if (entry) {
        const isAccidentService = String(entry.service_type || '').toLowerCase().includes('accident') || String(entry.service_type || '').toLowerCase().includes('bodyshop')

        const { data: inv } = await supabase
          .from('accounts_mechanical_invoices')
          .select('id, invoice_number, invoice_date, billed_amount, amount_received, payment_status, keep_on_credit, keep_on_credit_reason, updated_at')
          .eq('reception_entry_id', entry.id)
          .maybeSingle()

        // Fetch payment line items (UPI, Cash, Card, etc.)
        const { data: payments } = await supabase
          .from('accounts_mechanical_payment_lines')
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

        const billed = Number(
          inv?.billed_amount ??
          entry.expected_invoice_amount ??
          (rpcResult?.total_billed != null && Number(rpcResult.total_billed) > 0 ? rpcResult.total_billed : null) ??
          (rpcResult?.billed_amount != null && Number(rpcResult.billed_amount) > 0 ? rpcResult.billed_amount : null) ??
          (botPass?.billed_amount != null && Number(botPass.billed_amount) > 0 ? botPass.billed_amount : null) ??
          0
        )

        const paymentLineSum = Array.isArray(payments) && payments.length > 0
          ? payments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0)
          : null

        const received = Number(
          inv?.amount_received ??
          paymentLineSum ??
          (rpcResult?.amount_received != null ? rpcResult.amount_received : null) ??
          botPass?.amount_received ??
          0
        )

        const remaining = Math.max(0, billed - received)
        const status = inv?.payment_status || ((billed > 0 && remaining <= 0) ? 'received' : (received > 0 ? 'partial' : 'pending'))

        return setCache(cacheKey, {
          is_bodyshop: isAccidentService,
          is_insurance_claim: isAccidentService,
          reception_entry_id: entry.id,
          jc_number: entry.jc_number || (rpcResult?.jc_number as string) || null,
          reg_number: entry.reg_number || regNorm,
          owner_name: entry.owner_name,
          branch: entry.branch,
          service_type: entry.service_type,
          total_billed: billed,
          billed_amount: billed,
          amount_received: received,
          remaining_amount: remaining,
          remaining_due: remaining,
          status,
          invoice_no: inv?.invoice_number || (rpcResult?.invoice_no as string) || (botPass?.invoice_no as string) || null,
          invoice_date: inv?.invoice_date || (rpcResult?.invoice_date as string) || (botPass?.invoice_date as string) || (entry.invoice_done_at ? String(entry.invoice_done_at).slice(0, 10) : null),
          keep_on_credit: Boolean(inv?.keep_on_credit || botPass?.keep_on_credit),
          keep_on_credit_reason: inv?.keep_on_credit_reason || (botPass?.keep_on_credit_reason as string) || null,
          payments: (payments && payments.length > 0 ? payments : ((rpcResult?.payments as any[]) || [])),
          updated_at: inv?.updated_at || (botPass?.issued_at as string) || entry.invoice_done_at || new Date().toISOString(),
        })
      }
    } catch (dbErr) {
      console.warn('customerGetSettlement direct query note:', dbErr)
    }
  }

  return rpcResult ? setCache(cacheKey, rpcResult) : null
}

export const SCHEDULE_SERVICE_SUBTYPES = [
  '1st Service',
  '2nd Service',
  '3rd Service',
  'Mini Paid Service',
  'Paid Service',
] as const

export const DEFAULT_SERVICE_TYPES = [
  'Schedule Service – 1st Service',
  'Schedule Service – 2nd Service',
  'Schedule Service – 3rd Service',
  'Schedule Service – Mini Paid Service',
  'Schedule Service – Paid Service',
  'Accidental',
  'Running Repair',
  'Campaign',
] as const

export const DEFAULT_TIME_SLOTS = [
  '09:30 AM – 10:30 AM',
  '10:30 AM – 11:30 AM',
  '11:30 AM – 12:30 PM',
  '12:30 PM – 01:30 PM',
  '02:30 PM – 03:30 PM',
] as const

export const DEFAULT_BRANCHES = [
  'Sitapura',
  'Ajmer Road',
  'Tonk',
  'Shahpura',
] as const

export interface CustomerBookingItem {
  id: number
  lead_number: string | null
  booking_date: string
  appointment_date: string | null
  booking_time: string | null
  booking_source: string
  reg_number: string
  model: string | null
  variant: string | null
  customer_name: string | null
  customer_phone: string | null
  service_type: string | null
  complaint_description: string | null
  pickup_required: boolean
  pickup_address: string | null
  branch: string | null
  status: string
  status_reason?: string | null
  assigned_sa_name: string | null
  created_at: string
}

export async function customerFetchBranches(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('dealer_locations')
      .select('name, is_service_center')
      .eq('is_active', true)

    if (!error && Array.isArray(data) && data.length > 0) {
      const serviceBranches = data
        .filter((d: any) => d.is_service_center !== false && !String(d.name || '').toLowerCase().includes('jagatpura'))
        .map((d: any) => String(d.name))
      if (serviceBranches.length > 0) return serviceBranches
    }
  } catch (err) {
    console.warn('customerFetchBranches fallback used:', err)
  }
  return [...DEFAULT_BRANCHES]
}

export async function customerSubmitBooking(
  sessionToken: string,
  regNumber: string,
  payload: {
    service_type: string
    appointment_date: string
    booking_time: string
    branch: string
    pickup_required?: boolean
    pickup_address?: string
    complaint_description?: string
    owner_name?: string | null
    owner_phone?: string | null
    model?: string | null
    variant?: string | null
    km_reading?: number | null
    fuel_type?: string | null
  }
): Promise<{ success: boolean; booking_id?: number; lead_number?: string; status?: string; message: string }> {
  const normReg = (regNumber || '').trim().toUpperCase().replace(/\s+/g, '')
  if (!normReg) {
    throw new Error('Vehicle registration is required.')
  }
  if (!payload.service_type) {
    throw new Error('Please select a service type.')
  }
  if (!payload.appointment_date) {
    throw new Error('Please select a preferred date.')
  }
  if (!payload.booking_time) {
    throw new Error('Please select an appointment time slot.')
  }
  if (!payload.branch) {
    throw new Error('Please select a service center branch.')
  }
  if (payload.pickup_required && !payload.pickup_address?.trim()) {
    throw new Error('Please enter complete pickup address.')
  }

  // 1. Strict Duplicate Booking Check: Prevent double booking on same vehicle + same date if already submitted
  try {
    // Check service_bookings table
    const { data: existingBookings } = await supabase
      .from('service_bookings')
      .select('id, lead_number, status, appointment_date, booking_time')
      .eq('reg_number', normReg)
      .eq('appointment_date', payload.appointment_date)
      .neq('status', 'Cancelled')
      .limit(5)

    if (existingBookings && existingBookings.length > 0) {
      const match = (existingBookings as { id: number; lead_number: string | null; booking_time: string | null }[])[0]
      if (match) {
        throw new Error(`A booking (${match.lead_number || `#${match.id}`}) is already active for vehicle ${normReg} on ${payload.appointment_date}. Duplicate bookings are not allowed.`)
      }
    }

    // Check post_feedback_bot_data for customer portal bookings (excluding cancelled / rejected)
    const { data: existingBot } = await supabase
      .from('post_feedback_bot_data')
      .select('id, vehicle_registration_number, feedback_text, complaint_date_time, robot_status')
      .eq('vehicle_registration_number', normReg)
      .in('mode', ['customer_portal_concern', 'customer_booking_portal'])
      .ilike('feedback_text', '%SERVICE BOOKING REQUEST%')
      .order('id', { ascending: false })
      .limit(5)

    if (existingBot && Array.isArray(existingBot) && existingBot.length > 0) {
      for (const b of existingBot) {
        const isBotCancelled = b.robot_status === 'Cancelled' || b.robot_status?.toLowerCase().includes('cancel') || b.robot_status?.toLowerCase().includes('reject')
        if (isBotCancelled) continue
        const txt = b.feedback_text || ''
        if (txt.includes(payload.appointment_date)) {
          throw new Error(`A service booking request is already submitted for vehicle ${normReg} on ${payload.appointment_date}. Please contact our service team for any modifications.`)
        }
      }
    }
  } catch (dupErr: any) {
    if (dupErr.message && (dupErr.message.includes('already') || dupErr.message.includes('Duplicate'))) {
      throw dupErr
    }
    console.warn('Duplicate check warning:', dupErr)
  }

  // 2. Insert into public.service_bookings with graceful RPC fallback
  const todayStr = new Date().toISOString().split('T')[0]
  const bookingRow = {
    booking_source: 'Customer App',
    status: 'New',
    booking_date: todayStr,
    appointment_date: payload.appointment_date,
    booking_time: payload.booking_time,
    reg_number: normReg,
    model: payload.model || null,
    variant: payload.variant || null,
    fuel_type: payload.fuel_type || null,
    km_reading: payload.km_reading != null ? Number(payload.km_reading) : null,
    customer_name: payload.owner_name || 'Customer',
    customer_phone: payload.owner_phone || '',
    service_type: payload.service_type,
    complaint_description: payload.complaint_description || null,
    pickup_required: Boolean(payload.pickup_required),
    drop_required: false,
    pickup_address: payload.pickup_required ? payload.pickup_address?.trim() || null : null,
    branch: payload.branch,
  }

  let insertedBookingId: number | undefined
  let insertedLeadNumber: string | undefined

  try {
    const { data: inserted, error: insertErr } = await supabase
      .from('service_bookings')
      .insert([bookingRow])
      .select('id, lead_number, status')
      .single()

    if (!insertErr && inserted) {
      insertedBookingId = (inserted as { id: number }).id
      insertedLeadNumber = (inserted as { lead_number?: string }).lead_number || `SB-${(inserted as { id: number }).id}`
    } else if (insertErr) {
      console.warn('Direct service_bookings insert note (RLS):', insertErr.message)
    }
  } catch (directErr) {
    console.warn('Direct service_bookings insert catch:', directErr)
  }

  // 3. Robust fallback to customer_submit_complaint RPC (SECURITY DEFINER, always authorized)
  if (!insertedBookingId) {
    try {
      const summaryText = [
        `SERVICE BOOKING REQUEST`,
        `Type: ${payload.service_type}`,
        `Date: ${payload.appointment_date} | Slot: ${payload.booking_time}`,
        `Branch: ${payload.branch}`,
        `Pickup: ${payload.pickup_required ? `Yes (${payload.pickup_address || ''})` : 'No (Self Visit)'}`,
        payload.complaint_description ? `Complaints: ${payload.complaint_description}` : '',
      ].filter(Boolean).join('\n')

      const complaintRes = await customerSubmitComplaint(sessionToken, normReg, {
        text: summaryText,
        feedback_text: summaryText,
        service_type: payload.service_type,
        branch: payload.branch,
        owner_name: payload.owner_name || 'Customer',
        model: payload.model || null,
      })

      const botId = (complaintRes as { id?: number })?.id || Date.now().toString().slice(-6)
      insertedBookingId = Number(botId) || Date.now()
      insertedLeadNumber = `SB-${botId}`
    } catch (rpcErr: any) {
      console.error('Failed to submit booking via RPC:', rpcErr)
      throw new Error(rpcErr.message || 'Booking could not be submitted. Please try again.')
    }
  }

  return {
    success: true,
    booking_id: insertedBookingId,
    lead_number: insertedLeadNumber || `SB-${insertedBookingId}`,
    status: 'New',
    message: 'Service booking submitted successfully!',
  }
}

export async function customerListMyBookings(
  sessionToken: string,
  regNumber?: string | null,
  phone?: string | null
): Promise<CustomerBookingItem[]> {
  const normReg = (regNumber || '').trim().toUpperCase().replace(/\s+/g, '')
  const normPhone = (phone || '').trim()

  // 1. Primary: Use dedicated security-definer RPC that has full access to service_bookings
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('customer_list_my_bookings', {
      p_session_token: sessionToken,
      p_reg_number: normReg || null,
    })

    if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
      return rpcData as CustomerBookingItem[]
    }
  } catch (rpcErr) {
    console.warn('customer_list_my_bookings RPC fallback:', rpcErr)
  }

  const items: CustomerBookingItem[] = []

  // 2. Direct table fetch from service_bookings (if authenticated or RLS permitted)
  try {
    let query = supabase.from('service_bookings').select('*')

    if (normReg && normPhone) {
      query = query.or(`reg_number.eq.${normReg},customer_phone.eq.${normPhone}`)
    } else if (normReg) {
      query = query.eq('reg_number', normReg)
    } else if (normPhone) {
      query = query.eq('customer_phone', normPhone)
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(20)
    if (!error && Array.isArray(data)) {
      items.push(...(data as CustomerBookingItem[]))
    }
  } catch (err) {
    console.warn('Error fetching service_bookings:', err)
  }

  // 3. Fallback: Fetch from post_feedback_bot_data for bookings submitted via bot RPC
  if (normReg) {
    try {
      const { data: botRows } = await supabase
        .from('post_feedback_bot_data')
        .select('id, vehicle_registration_number, customer_name, mobile_number, service_type, branch, model, feedback_text, complaint_date_time, robot_status, service_advisor_name')
        .eq('vehicle_registration_number', normReg)
        .in('mode', ['customer_portal_concern', 'customer_booking_portal'])
        .order('id', { ascending: false })
        .limit(10)

      if (botRows && Array.isArray(botRows)) {
        for (const b of botRows) {
          const text = b.feedback_text || ''
          const typeMatch = text.match(/Type:\s*([^\n\r]+)/i)
          const dateMatch = text.match(/Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i)
          const slotMatch = text.match(/Slot:\s*([^\n\r]+)/i)
          const branchMatch = text.match(/Branch:\s*([^\n\r]+)/i)
          const pickupMatch = text.match(/Pickup:\s*([^\n\r]+)/i)
          const complaintsMatch = text.match(/Complaints:\s*([\s\S]+)/i)

          const isPickup = pickupMatch ? pickupMatch[1].toLowerCase().startsWith('yes') : false
          let pickupAddress: string | null = null
          if (isPickup && pickupMatch) {
            const addrInParen = pickupMatch[1].match(/\((.+)\)/)
            pickupAddress = addrInParen ? addrInParen[1].trim() : null
          }

          const apptDate = dateMatch ? dateMatch[1] : null
          const apptSlot = slotMatch ? slotMatch[1].trim() : null
          const serviceType = typeMatch ? typeMatch[1].trim() : (b.service_type || 'Service Booking')
          const branch = branchMatch ? branchMatch[1].trim() : (b.branch || 'Sitapura')
          const complaint = complaintsMatch ? complaintsMatch[1].trim() : null

          // Check if service_bookings already has a matching row for this vehicle + appointment date
          const normBotReg = (b.vehicle_registration_number || '').trim().toUpperCase().replace(/\s+/g, '')
          const existingSB = items.find(it => {
            const normItemReg = (it.reg_number || '').trim().toUpperCase().replace(/\s+/g, '')
            const isSameVeh = normItemReg === normBotReg
            const isSameAppt = apptDate && it.appointment_date === apptDate
            const isSameId = it.id === Number(b.id) || (it.lead_number && (it.lead_number.includes(String(b.id)) || it.lead_number === `SB-${b.id}`))
            return isSameVeh && (isSameAppt || isSameId)
          })

          if (existingSB) {
            // Update any missing fields in existingSB while preserving its authoritative status
            if (!existingSB.appointment_date && apptDate) existingSB.appointment_date = apptDate
            if (!existingSB.booking_time && apptSlot) existingSB.booking_time = apptSlot
            if (!existingSB.pickup_address && pickupAddress) existingSB.pickup_address = pickupAddress
            if (!existingSB.complaint_description && complaint) existingSB.complaint_description = complaint
            if (!existingSB.assigned_sa_name && b.service_advisor_name) existingSB.assigned_sa_name = b.service_advisor_name
          } else {
            const botStatus = b.robot_status || 'New'
            items.push({
              id: Number(b.id),
              lead_number: `SB-${b.id}`,
              booking_date: (b.complaint_date_time || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
              appointment_date: apptDate,
              booking_time: apptSlot,
              booking_source: 'Customer App',
              reg_number: b.vehicle_registration_number,
              model: b.model || null,
              variant: null,
              customer_name: b.customer_name || null,
              customer_phone: b.mobile_number || null,
              service_type: serviceType,
              complaint_description: complaint,
              pickup_required: isPickup,
              pickup_address: pickupAddress,
              branch: branch,
              status: botStatus,
              assigned_sa_name: b.service_advisor_name || null,
              created_at: b.complaint_date_time || new Date().toISOString(),
            })
          }
        }
      }
    } catch (botErr) {
      console.warn('Error fetching bot bookings fallback:', botErr)
    }
  }

  return items
}

async function attachEstimateDocumentToRepairCard(
  sessionToken: string,
  regNumber: string,
  card: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (parseBodyshopEstimateDocument(card)) return card
  try {
    const { data, error } = await supabase.rpc('customer_get_bodyshop_document', {
      p_session_token: sessionToken,
      p_reg_number: regNumber,
      p_doc_key: 'doc_estimate',
    })
    if (error || !data || typeof data !== 'object') return card
    const estimate = normalizeEstimateDocRow(data as Record<string, unknown>)
    if (!estimate) return card
    return { ...card, estimate_document: estimate }
  } catch {
    return card
  }
}

export async function customerGetRepairCard(
  sessionToken: string,
  regNumber?: string | null,
  opts?: { bypassCache?: boolean }
) {
  const normReg = (regNumber || '').trim().toUpperCase().replace(/[\s-]/g, '')
  if (!normReg) return null

  const cacheKey = `repair_card_${sessionToken}_${normReg}`
  if (opts?.bypassCache) apiCache.delete(cacheKey)
  const cached = getCached<Record<string, unknown>>(cacheKey)
  if (cached) return cached

  // 1. Direct RPC
  try {
    const { data, error } = await supabase.rpc('customer_get_repair_card', {
      p_session_token: sessionToken,
      p_reg_number: regNumber || null,
    })
    if (!error && data) {
      const row = await attachEstimateDocumentToRepairCard(
        sessionToken,
        regNumber || normReg,
        data as Record<string, unknown>
      )
      return setCache(cacheKey, row)
    }
  } catch (rpcErr) {
    console.warn('customer_get_repair_card RPC note:', rpcErr)
  }

  // 2. Direct table lookup in bodyshop_repair_cards
  try {
    const { data: rows, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('*')
      .ilike('reg_number', `%${normReg}%`)
      .order('created_at', { ascending: false })
      .limit(1)

    if (!error && rows && rows.length > 0) {
      const row = await attachEstimateDocumentToRepairCard(
        sessionToken,
        regNumber || normReg,
        rows[0] as Record<string, unknown>
      )
      return setCache(cacheKey, row)
    }
  } catch (dbErr) {
    console.warn('bodyshop_repair_cards direct query error:', dbErr)
  }

  return null
}

export type CustomerBodyshopEstimateDocument = {
  doc_key?: string | null
  file_name?: string | null
  content_type?: string | null
  drive_url?: string | null
  drive_file_id?: string | null
  storage_bucket?: string | null
  storage_path?: string | null
  uploaded_at?: string | null
  uploaded_by?: string | null
}

function normalizeEstimateDocRow(raw: Record<string, unknown> | null | undefined): CustomerBodyshopEstimateDocument | null {
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as Record<string, unknown>
  const driveUrl = String(doc.drive_url ?? '').trim()
  const storagePath = String(doc.storage_path ?? '').trim()
  const fileName = String(doc.file_name ?? '').trim()
  if (!driveUrl && !storagePath && !fileName) return null
  return doc as CustomerBodyshopEstimateDocument
}

export function parseBodyshopEstimateDocument(
  card: Record<string, unknown> | null | undefined
): CustomerBodyshopEstimateDocument | null {
  const fromField = normalizeEstimateDocRow(
    card?.estimate_document && typeof card.estimate_document === 'object'
      ? (card.estimate_document as Record<string, unknown>)
      : null
  )
  if (fromField) return fromField

  const uploaded = Array.isArray(card?.uploaded_documents)
    ? (card!.uploaded_documents as Record<string, unknown>[])
    : []
  for (const row of uploaded) {
    if (String(row.doc_key ?? '').trim() !== 'doc_estimate') continue
    const parsed = normalizeEstimateDocRow(row)
    if (parsed) return parsed
  }

  return null
}

/** Workshop estimate row from list_assets (includes storage-only uploads). */
export function parseWorkshopEstimateFromAsset(row: {
  id?: number | string
  doc_key?: string | null
  file_name?: string | null
  content_type?: string | null
  drive_url?: string | null
  view_url?: string | null
  drive_pending?: boolean
} | null | undefined): CustomerBodyshopEstimateDocument | null {
  if (!row || String(row.doc_key ?? '').trim() !== 'doc_estimate') return null
  const driveUrl = String(row.drive_url ?? row.view_url ?? '').trim()
  const fileName = String(row.file_name ?? '').trim()
  const hasRow = row.id != null && String(row.id).length > 0
  if (!fileName && !driveUrl && !hasRow) return null
  return {
    doc_key: 'doc_estimate',
    file_name: fileName || 'Workshop estimate',
    content_type: row.content_type ?? null,
    drive_url: driveUrl || null,
  }
}

export function resolveWorkshopEstimateDocument(
  card: Record<string, unknown> | null | undefined,
  workshopDocuments?: Array<{
    doc_key?: string | null
    file_name?: string | null
    content_type?: string | null
    drive_url?: string | null
    view_url?: string | null
    drive_pending?: boolean
  }> | null
): CustomerBodyshopEstimateDocument | null {
  const fromCard = parseBodyshopEstimateDocument(card)
  if (fromCard) return fromCard
  const assetRow = (workshopDocuments ?? []).find((d) => String(d.doc_key ?? '').trim() === 'doc_estimate')
  return parseWorkshopEstimateFromAsset(assetRow)
}

function googleDriveFileIdFromUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!trimmed) return null
  const byPath = trimmed.match(/\/file\/d\/([^/]+)/i)
  if (byPath?.[1]) return byPath[1]
  const byQuery = trimmed.match(/[?&]id=([^&]+)/i)
  if (byQuery?.[1]) return byQuery[1]
  return null
}

function preferDirectViewUrl(
  viewUrl: string,
  doc?: CustomerBodyshopEstimateDocument | null
): string {
  const trimmed = viewUrl.trim()
  if (!trimmed) return trimmed
  const fileId = String(doc?.drive_file_id ?? '').trim() || googleDriveFileIdFromUrl(trimmed)
  if (fileId && /drive\.google\.com/i.test(trimmed)) {
    return `https://drive.google.com/uc?export=view&id=${fileId}`
  }
  return trimmed
}

function isLikelyImageViewUrl(viewUrl: string, contentType?: string | null, fileName?: string | null) {
  const type = String(contentType ?? '').toLowerCase()
  if (type.startsWith('image/')) return true
  const name = String(fileName ?? viewUrl).toLowerCase()
  return /\.(jpe?g|png|gif|webp|heic|bmp)(\?|$)/i.test(name)
}

async function fetchCustomerBodyshopDocViewUrl(
  sessionToken: string,
  reg: string,
  docKey = 'doc_estimate'
): Promise<{ view_url: string; file_name?: string | null; content_type?: string | null }> {
  const invokeBody = {
    session_token: sessionToken,
    reg_number: reg,
    doc_key: docKey,
  }

  try {
    const { data, error } = await supabase.functions.invoke('customer-portal-doc-view', {
      body: invokeBody,
    })
    if (!error && data && typeof data === 'object') {
      const row = data as { view_url?: string; error?: string; ok?: boolean }
      const viewUrl = String(row.view_url ?? '').trim()
      if (viewUrl) {
        return {
          view_url: viewUrl,
          file_name: (row as { file_name?: string }).file_name ?? null,
          content_type: (row as { content_type?: string }).content_type ?? null,
        }
      }
      if (row.error) throw new Error(String(row.error))
    }
  } catch (invokeErr) {
    console.warn('customer-portal-doc-view invoke failed, trying HTTP fallback:', invokeErr)
  }

  const supabaseUrl = (getSupabaseBaseUrl() || SUPABASE_URL).replace(/\/$/, '')
  const res = await fetch(`${supabaseUrl}/functions/v1/customer-portal-doc-view`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(invokeBody),
  })

  const payload = (await res.json().catch(() => ({}))) as {
    view_url?: string
    error?: string
    file_name?: string
    content_type?: string
  }
  const viewUrl = String(payload.view_url ?? '').trim()
  if (!res.ok || !viewUrl) {
    throw new Error(payload.error || 'Unable to open workshop estimate document.')
  }

  return {
    view_url: viewUrl,
    file_name: payload.file_name ?? null,
    content_type: payload.content_type ?? null,
  }
}

export async function customerGetBodyshopEstimateViewUrl(
  sessionToken: string,
  regNumber: string | null | undefined,
  doc?: CustomerBodyshopEstimateDocument | null
): Promise<{ viewUrl: string; fileName?: string | null; contentType?: string | null; isImage: boolean }> {
  const reg = (regNumber || '').trim()
  if (!sessionToken || !reg) {
    throw new Error('Session or vehicle not available.')
  }

  let viewUrl = ''
  let fileName = doc?.file_name ?? null
  let contentType = doc?.content_type ?? null

  try {
    const resolved = await fetchCustomerBodyshopDocViewUrl(sessionToken, reg, 'doc_estimate')
    viewUrl = preferDirectViewUrl(resolved.view_url, doc)
    fileName = resolved.file_name ?? fileName
    contentType = resolved.content_type ?? contentType
  } catch (edgeErr) {
    const driveUrl = String(doc?.drive_url ?? '').trim()
    if (!driveUrl) {
      throw edgeErr instanceof Error ? edgeErr : new Error('Unable to open workshop estimate document.')
    }
    viewUrl = preferDirectViewUrl(driveUrl, doc)
  }

  return {
    viewUrl,
    fileName,
    contentType,
    isImage: isLikelyImageViewUrl(viewUrl, contentType, fileName),
  }
}

/** Opens estimate in browser, or returns a URL for in-app image preview (Supabase signed URLs). */
export async function customerOpenBodyshopEstimateDocument(
  sessionToken: string,
  regNumber: string | null | undefined,
  doc?: CustomerBodyshopEstimateDocument | null
): Promise<{ mode: 'preview'; uri: string } | { mode: 'external' }> {
  const resolved = await customerGetBodyshopEstimateViewUrl(sessionToken, regNumber, doc)
  const useInAppPreview =
    resolved.isImage &&
    !/drive\.google\.com/i.test(resolved.viewUrl) &&
    !resolved.viewUrl.toLowerCase().includes('googleusercontent.com')

  if (useInAppPreview) {
    return { mode: 'preview', uri: resolved.viewUrl }
  }

  try {
    await Linking.openURL(resolved.viewUrl)
  } catch {
    throw new Error('Unable to open this document on your device.')
  }
  return { mode: 'external' }
}
