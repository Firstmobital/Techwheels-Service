import { supabase } from './supabase'

export interface EstimateItem {
  id: string
  type: 'part' | 'labour'
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface CustomerEstimateRecord {
  id?: number
  estimate_no: string
  vehicle_registration_number: string
  complaint_id?: number | null
  customer_name?: string | null
  customer_phone?: string | null
  model?: string | null
  fuel?: string | null
  service_advisor_name?: string | null
  branch?: string | null
  items: EstimateItem[]
  subtotal: number
  discount: number
  gst_tax: number
  grand_total: number
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected'
  rejection_reason?: string | null
  approved_at?: string | null
  created_at?: string | null
  updated_at?: string | null
}

const LOCAL_STORAGE_ESTIMATES_KEY = 'techwheels_customer_estimates_store'

function getLocalEstimates(): CustomerEstimateRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ESTIMATES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalEstimates(list: CustomerEstimateRecord[]) {
  try {
    localStorage.setItem(LOCAL_STORAGE_ESTIMATES_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn('Failed to save estimates to localStorage:', e)
  }
}

// 1. Fetch estimate for a specific vehicle registration number
export async function fetchEstimateForVehicle(regNumber: string): Promise<CustomerEstimateRecord | null> {
  const norm = regNumber.trim().toUpperCase()
  if (!norm) return null

  // A. Try customer_estimates table
  try {
    const { data, error } = await supabase
      .from('customer_estimates')
      .select('*')
      .eq('vehicle_registration_number', norm)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data && data.items) {
      return data as CustomerEstimateRecord
    }
  } catch (err) {
    // Expected if table not yet migrated
  }

  // B. Try post_feedback_bot_data table (reliable cross-port sync)
  try {
    const { data: botRows, error: botErr } = await supabase
      .from('post_feedback_bot_data')
      .select('*')
      .eq('vehicle_registration_number', norm)
      .eq('mode', 'customer_estimate_payload')
      .order('complaint_date_time', { ascending: false })
      .limit(1)

    if (!botErr && botRows && botRows.length > 0) {
      const parsed = JSON.parse(botRows[0].feedback_text) as CustomerEstimateRecord
      if (parsed && parsed.items) {
        return parsed
      }
    }
  } catch (err) {
    console.warn('post_feedback_bot_data estimate lookup fallback error:', err)
  }

  // C. Fallback to local store
  const localList = getLocalEstimates()
  const match = localList.find((e) => e.vehicle_registration_number?.toUpperCase() === norm)
  return match || null
}

// 2. Fetch all latest estimates for admin/advisor hub
export async function fetchAllEstimates(): Promise<CustomerEstimateRecord[]> {
  const results: CustomerEstimateRecord[] = []

  // A. Try customer_estimates table
  try {
    const { data, error } = await supabase
      .from('customer_estimates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data && data.length > 0) {
      return data as CustomerEstimateRecord[]
    }
  } catch {
    // fallback
  }

  // B. Try post_feedback_bot_data table
  try {
    const { data: botRows, error: botErr } = await supabase
      .from('post_feedback_bot_data')
      .select('*')
      .eq('mode', 'customer_estimate_payload')
      .order('complaint_date_time', { ascending: false })
      .limit(50)

    if (!botErr && botRows && botRows.length > 0) {
      for (const row of botRows) {
        try {
          const parsed = JSON.parse(row.feedback_text) as CustomerEstimateRecord
          if (parsed && !results.some((r) => r.estimate_no === parsed.estimate_no)) {
            results.push(parsed)
          }
        } catch {
          // ignore parse error
        }
      }
      if (results.length > 0) {
        return results
      }
    }
  } catch {
    // fallback
  }

  return getLocalEstimates()
}

// 3. Save / Send Estimate from Service Advisor
export async function saveAndSendEstimate(estimate: CustomerEstimateRecord): Promise<CustomerEstimateRecord> {
  const payload: CustomerEstimateRecord = {
    ...estimate,
    vehicle_registration_number: estimate.vehicle_registration_number.trim().toUpperCase(),
    updated_at: new Date().toISOString(),
  }

  // Save to local store
  const localList = getLocalEstimates()
  const existingIdx = localList.findIndex(
    (e) =>
      e.estimate_no === payload.estimate_no ||
      e.vehicle_registration_number === payload.vehicle_registration_number
  )
  if (existingIdx >= 0) {
    localList[existingIdx] = { ...localList[existingIdx], ...payload }
  } else {
    localList.unshift(payload)
  }
  saveLocalEstimates(localList)

  // Broadcast window event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('techwheels_estimate_updated', { detail: payload }))
  }

  // A. Save to customer_estimates table
  try {
    await supabase.from('customer_estimates').upsert([payload], { onConflict: 'estimate_no' })
  } catch {
    // fallback
  }

  // B. Save to post_feedback_bot_data for guaranteed cross-port sync (5173 -> 5174)
  try {
    const botRow = {
      vehicle_registration_number: payload.vehicle_registration_number,
      customer_name: payload.customer_name || 'Customer',
      mobile_number: payload.customer_phone || null,
      rating: payload.status === 'Approved' ? 5 : payload.status === 'Rejected' ? 1 : 4,
      feedback_text: JSON.stringify(payload),
      service_type: payload.estimate_no,
      service_advisor_name: payload.service_advisor_name || 'AMAN GUPTA',
      branch: payload.branch || 'Sitapura Workshop',
      primary_complaint_area: `Estimate: ${payload.status}`,
      mode: 'customer_estimate_payload',
      complaint_date_time: new Date().toISOString(),
    }

    // Delete older estimate payload rows for this vehicle to prevent duplicates
    await supabase
      .from('post_feedback_bot_data')
      .delete()
      .eq('vehicle_registration_number', payload.vehicle_registration_number)
      .eq('mode', 'customer_estimate_payload')

    await supabase.from('post_feedback_bot_data').insert([botRow])
  } catch (err) {
    console.warn('Cross-port estimate sync to post_feedback_bot_data failed:', err)
  }

  return payload
}

// 4. Update approval status (called from customer or SA)
export async function updateEstimateApproval(
  estimateNo: string,
  status: 'Approved' | 'Rejected',
  rejectionReason?: string
): Promise<void> {
  const updatePayload = {
    status,
    rejection_reason: rejectionReason || null,
    approved_at: status === 'Approved' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }

  // Update local store
  const localList = getLocalEstimates()
  const match = localList.find((e) => e.estimate_no === estimateNo)
  if (match) {
    Object.assign(match, updatePayload)
    saveLocalEstimates(localList)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('techwheels_estimate_updated', { detail: { estimateNo, ...updatePayload } }))
  }

  // A. Update customer_estimates table
  try {
    await supabase
      .from('customer_estimates')
      .update(updatePayload)
      .eq('estimate_no', estimateNo)
  } catch {
    // fallback
  }

  // B. Update post_feedback_bot_data row
  try {
    const { data: botRows } = await supabase
      .from('post_feedback_bot_data')
      .select('*')
      .eq('service_type', estimateNo)
      .eq('mode', 'customer_estimate_payload')
      .limit(1)

    if (botRows && botRows.length > 0) {
      const parsed = JSON.parse(botRows[0].feedback_text) as CustomerEstimateRecord
      const merged = { ...parsed, ...updatePayload }
      await supabase
        .from('post_feedback_bot_data')
        .update({
          feedback_text: JSON.stringify(merged),
          rating: status === 'Approved' ? 5 : 1,
          primary_complaint_area: `Estimate: ${status}`,
          complaint_date_time: new Date().toISOString(),
        })
        .eq('id', botRows[0].id)
    }
  } catch (err) {
    console.warn('Failed to update estimate status in post_feedback_bot_data:', err)
  }
}
