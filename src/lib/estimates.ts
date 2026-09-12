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

  try {
    const { data, error } = await supabase
      .from('customer_estimates')
      .select('*')
      .eq('vehicle_registration_number', norm)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) {
      return data as CustomerEstimateRecord
    }
  } catch (err) {
    console.warn('Supabase fetch estimate error, checking local store:', err)
  }

  // Fallback to local store
  const localList = getLocalEstimates()
  const match = localList.find((e) => e.vehicle_registration_number?.toUpperCase() === norm)
  return match || null
}

// 2. Fetch all latest estimates for admin/advisor hub
export async function fetchAllEstimates(): Promise<CustomerEstimateRecord[]> {
  try {
    const { data, error } = await supabase
      .from('customer_estimates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data && data.length > 0) {
      return data as CustomerEstimateRecord[]
    }
  } catch (err) {
    console.warn('Failed to fetch estimates from Supabase:', err)
  }

  return getLocalEstimates()
}

// 3. Save / Send Estimate from Service Advisor
export async function saveAndSendEstimate(estimate: CustomerEstimateRecord): Promise<CustomerEstimateRecord> {
  const payload = {
    ...estimate,
    vehicle_registration_number: estimate.vehicle_registration_number.trim().toUpperCase(),
    updated_at: new Date().toISOString(),
  }

  // Always save in localStorage for instantaneous multi-tab sync
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

  // Broadcast window event for live multi-window coordination
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('techwheels_estimate_updated', { detail: payload }))
  }

  // Save to Supabase table
  try {
    const { data, error } = await supabase
      .from('customer_estimates')
      .upsert([payload], { onConflict: 'estimate_no' })
      .select('*')
      .single()

    if (!error && data) {
      return data as CustomerEstimateRecord
    }
  } catch (err) {
    console.warn('Supabase save estimate failed, stored locally:', err)
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

  try {
    await supabase
      .from('customer_estimates')
      .update(updatePayload)
      .eq('estimate_no', estimateNo)
  } catch (err) {
    console.warn('Supabase update estimate approval failed:', err)
  }
}
