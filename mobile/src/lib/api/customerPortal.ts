import { supabase } from '../supabase'

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

          return setCache(cacheKey, {
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
          })
        }
      }
    } catch (dbErr) {
      console.warn('customerGetGatePass direct table query error:', dbErr)
    }
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

        return setCache(cacheKey, {
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
        })
      }
    } catch (dbErr) {
      console.warn('customerGetSettlement direct query note:', dbErr)
    }
  }

  return rpcResult ? setCache(cacheKey, rpcResult) : null
}

export const DEFAULT_SERVICE_TYPES = [
  'Running Repairs',
  'First Free Service',
  'Second Free Service',
  'Third Free Service',
  'Paid Service',
  'Mini Paid Service',
  'Accident',
  'Rusting',
  'PDI',
  'Campaign',
  'E Breakdown',
  'Updation',
] as const

export const DEFAULT_TIME_SLOTS = [
  '09:30 AM – 10:30 AM',
  '10:30 AM – 11:30 AM',
  '11:30 AM – 12:30 PM',
  '12:30 PM – 01:30 PM',
  '02:30 PM – 03:30 PM',
  '03:30 PM – 04:30 PM',
  '04:30 PM – 05:30 PM',
] as const

export const DEFAULT_BRANCHES = [
  'Sitapura',
  'Ajmer Road',
  'Tonk',
  'Shahpura',
  'Paota',
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

    // Check post_feedback_bot_data for customer portal bookings
    const { data: existingBot } = await supabase
      .from('post_feedback_bot_data')
      .select('id, vehicle_registration_number, feedback_text, complaint_date_time')
      .eq('vehicle_registration_number', normReg)
      .in('mode', ['customer_portal_concern', 'customer_booking_portal'])
      .ilike('feedback_text', '%SERVICE BOOKING REQUEST%')
      .order('id', { ascending: false })
      .limit(5)

    if (existingBot && Array.isArray(existingBot) && existingBot.length > 0) {
      for (const b of existingBot) {
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

  const items: CustomerBookingItem[] = []

  // 1. Fetch from service_bookings if accessible
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

  // 2. Fetch from post_feedback_bot_data for bookings submitted via RPC
  if (normReg) {
    try {
      const { data: botRows } = await supabase
        .from('post_feedback_bot_data')
        .select('id, vehicle_registration_number, customer_name, mobile_number, service_type, branch, model, feedback_text, complaint_date_time')
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
            const isSameId = it.id === Number(b.id) || (it.lead_number && it.lead_number.includes(String(b.id)))
            return isSameVeh && (isSameAppt || isSameId)
          })

          if (existingSB) {
            // Update any missing fields in existingSB
            if (!existingSB.appointment_date && apptDate) existingSB.appointment_date = apptDate
            if (!existingSB.booking_time && apptSlot) existingSB.booking_time = apptSlot
            if (!existingSB.pickup_address && pickupAddress) existingSB.pickup_address = pickupAddress
            if (!existingSB.complaint_description && complaint) existingSB.complaint_description = complaint
          } else {
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
              status: 'New',
              assigned_sa_name: null,
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

export async function customerGetRepairCard(sessionToken: string, regNumber?: string | null) {
  const normReg = (regNumber || '').trim().toUpperCase().replace(/[\s-]/g, '')
  if (!normReg) return null

  const cacheKey = `repair_card_${sessionToken}_${normReg}`
  const cached = getCached<Record<string, unknown>>(cacheKey)
  if (cached) return cached

  // 1. Direct RPC
  try {
    const { data, error } = await supabase.rpc('customer_get_repair_card', {
      p_session_token: sessionToken,
      p_reg_number: regNumber || null,
    })
    if (!error && data) {
      return setCache(cacheKey, data as Record<string, unknown>)
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
      return setCache(cacheKey, rows[0] as Record<string, unknown>)
    }
  } catch (dbErr) {
    console.warn('bodyshop_repair_cards direct query error:', dbErr)
  }

  return null
}
