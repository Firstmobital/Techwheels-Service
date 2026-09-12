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

// 1. Fetch estimate for a specific complaint ID or latest for vehicle
export async function fetchEstimateForComplaint(
  complaintId?: number | null,
  regNumber?: string
): Promise<CustomerEstimateRecord | null> {
  const norm = (regNumber || '').trim().toUpperCase()

  // 1. Look by complaintId in all estimates
  if (complaintId) {
    const all = await fetchAllEstimates()
    const match = all.find((e) => Number(e.complaint_id) === Number(complaintId))
    if (match) return match
  }

  // 2. Fallback to vehicle reg lookup
  if (norm) {
    return fetchEstimateForVehicle(norm)
  }
  return null
}

// Fetch all estimates for a specific vehicle
export async function fetchEstimatesForVehicle(regNumber: string): Promise<CustomerEstimateRecord[]> {
  const norm = regNumber.trim().toUpperCase()
  if (!norm) return []
  const all = await fetchAllEstimates()
  return all.filter((e) => e.vehicle_registration_number?.toUpperCase() === norm)
}

// Fetch latest estimate for vehicle
export async function fetchEstimateForVehicle(regNumber: string): Promise<CustomerEstimateRecord | null> {
  const list = await fetchEstimatesForVehicle(regNumber)
  return list.length > 0 ? list[0] : null
}

// 2. Fetch all estimates from Supabase / localStorage
export async function fetchAllEstimates(): Promise<CustomerEstimateRecord[]> {
  const results: CustomerEstimateRecord[] = []
  const seenEstNos = new Set<string>()

  // A. Try customer_estimates table
  try {
    const { data, error } = await supabase
      .from('customer_estimates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!error && data && data.length > 0) {
      for (const row of data) {
        if (row && row.estimate_no && !seenEstNos.has(row.estimate_no)) {
          seenEstNos.add(row.estimate_no)
          results.push(row as CustomerEstimateRecord)
        }
      }
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
      .limit(100)

    if (!botErr && botRows && botRows.length > 0) {
      for (const row of botRows) {
        try {
          const parsed = JSON.parse(row.feedback_text) as CustomerEstimateRecord
          if (parsed && parsed.estimate_no && !seenEstNos.has(parsed.estimate_no)) {
            seenEstNos.add(parsed.estimate_no)
            results.push(parsed)
          }
        } catch {
          // ignore parse error
        }
      }
    }
  } catch {
    // fallback
  }

  // C. Fallback merge local store
  const localList = getLocalEstimates()
  for (const item of localList) {
    if (item && item.estimate_no && !seenEstNos.has(item.estimate_no)) {
      seenEstNos.add(item.estimate_no)
      results.push(item)
    }
  }

  return results
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
  const existingIdx = localList.findIndex((e) => {
    if (e.estimate_no === payload.estimate_no) return true
    if (payload.complaint_id && Number(e.complaint_id) === Number(payload.complaint_id)) return true
    return false
  })

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
    const { error } = await supabase.from('customer_estimates').upsert(
      [
        {
          estimate_no: payload.estimate_no,
          vehicle_registration_number: payload.vehicle_registration_number,
          complaint_id: payload.complaint_id || null,
          customer_name: payload.customer_name,
          customer_phone: payload.customer_phone,
          model: payload.model,
          fuel: payload.fuel,
          service_advisor_name: payload.service_advisor_name,
          branch: payload.branch,
          items: payload.items,
          subtotal: payload.subtotal,
          discount: payload.discount,
          gst_tax: payload.gst_tax,
          grand_total: payload.grand_total,
          status: payload.status,
          rejection_reason: payload.rejection_reason,
          updated_at: payload.updated_at,
        },
      ],
      { onConflict: 'estimate_no' }
    )
    if (error) {
      console.warn('Upsert to customer_estimates failed:', error)
    }
  } catch (err) {
    console.warn('Supabase customer_estimates upsert error:', err)
  }

  // B. Save to post_feedback_bot_data for cross-port sync (5173 -> 5174)
  try {
    const botRow = {
      vehicle_registration_number: payload.vehicle_registration_number,
      customer_name: payload.customer_name || 'Customer',
      mobile_number: payload.customer_phone || null,
      rating: 5,
      feedback_text: JSON.stringify(payload),
      service_type: `Estimate #${payload.estimate_no}`,
      mode: 'customer_estimate_payload',
      primary_complaint_area: payload.complaint_id ? `Complaint #${payload.complaint_id}` : 'Quotation',
      complaint_date_time: payload.updated_at || new Date().toISOString(),
    }

    // Try to update existing payload record first
    const { data: existingRows } = await supabase
      .from('post_feedback_bot_data')
      .select('id, feedback_text')
      .eq('vehicle_registration_number', payload.vehicle_registration_number)
      .eq('mode', 'customer_estimate_payload')

    let matchedId: number | null = null
    if (existingRows) {
      for (const r of existingRows) {
        try {
          const parsed = JSON.parse(r.feedback_text)
          if (parsed.estimate_no === payload.estimate_no || (payload.complaint_id && Number(parsed.complaint_id) === Number(payload.complaint_id))) {
            matchedId = r.id
            break
          }
        } catch {
          // ignore
        }
      }
    }

    if (matchedId) {
      await supabase.from('post_feedback_bot_data').update(botRow).eq('id', matchedId)
    } else {
      await supabase.from('post_feedback_bot_data').insert([botRow])
    }
  } catch (err) {
    console.warn('Cross-port estimate sync to post_feedback_bot_data failed:', err)
  }

  return payload
}

// 4. Update estimate approval status
export async function updateEstimateApproval(
  estimateNo: string,
  status: 'Approved' | 'Rejected',
  rejectionReason?: string
): Promise<void> {
  const updated_at = new Date().toISOString()
  const approved_at = status === 'Approved' ? updated_at : null

  // A. Local store
  const localList = getLocalEstimates()
  const idx = localList.findIndex((e) => e.estimate_no === estimateNo)
  if (idx >= 0) {
    localList[idx].status = status
    localList[idx].updated_at = updated_at
    if (rejectionReason) localList[idx].rejection_reason = rejectionReason
    if (approved_at) localList[idx].approved_at = approved_at
    saveLocalEstimates(localList)
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('techwheels_estimate_updated', {
        detail: { estimate_no: estimateNo, status, rejection_reason: rejectionReason },
      })
    )
  }

  // B. Update customer_estimates table
  try {
    await supabase
      .from('customer_estimates')
      .update({
        status,
        rejection_reason: rejectionReason || null,
        approved_at,
        updated_at,
      })
      .eq('estimate_no', estimateNo)
  } catch (err) {
    console.warn('Failed to update estimate status in customer_estimates:', err)
  }

  // C. Update post_feedback_bot_data row
  try {
    const { data: botRows } = await supabase
      .from('post_feedback_bot_data')
      .select('id, feedback_text')
      .eq('mode', 'customer_estimate_payload')

    if (botRows) {
      for (const row of botRows) {
        try {
          const parsed = JSON.parse(row.feedback_text)
          if (parsed.estimate_no === estimateNo) {
            parsed.status = status
            if (rejectionReason) parsed.rejection_reason = rejectionReason
            if (approved_at) parsed.approved_at = approved_at
            parsed.updated_at = updated_at

            await supabase
              .from('post_feedback_bot_data')
              .update({
                feedback_text: JSON.stringify(parsed),
                complaint_date_time: updated_at,
              })
              .eq('id', row.id)
            break
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn('Failed to update estimate status in post_feedback_bot_data:', err)
  }
}
