import { supabase } from './supabase'
import { fetchEstimatesForVehicle } from './estimates'

export interface VehiclePaymentRecord {
  reg_number: string
  jc_number?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  total_billed: number
  amount_received: number
  remaining_amount: number
  status: 'Pending' | 'Partially Paid' | 'Fully Paid'
  payment_mode?: 'UPI' | 'Cash' | 'Card' | 'Net Banking' | 'Mixed'
  transaction_ref?: string
  notes?: string
  updated_at: string
  updated_by?: string
}

const LOCAL_STORAGE_PAYMENTS_KEY = 'techwheels_vehicle_payments_store'

function getLocalPayments(): Record<string, VehiclePaymentRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PAYMENTS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLocalPayment(record: VehiclePaymentRecord) {
  try {
    const store = getLocalPayments()
    const key = record.reg_number.trim().toUpperCase()
    store[key] = record
    localStorage.setItem(LOCAL_STORAGE_PAYMENTS_KEY, JSON.stringify(store))
  } catch (e) {
    console.warn('Failed to save payment to localStorage:', e)
  }
}

// 1. Fetch live payment status for a vehicle
export async function fetchVehiclePayment(regNumber: string): Promise<VehiclePaymentRecord | null> {
  const norm = regNumber.trim().toUpperCase()
  if (!norm) return null

  // A. Check post_feedback_bot_data for cross-port sync payload
  try {
    const { data: botRows, error } = await supabase
      .from('post_feedback_bot_data')
      .select('id, feedback_text, complaint_date_time')
      .eq('vehicle_registration_number', norm)
      .eq('mode', 'customer_payment_payload')
      .order('complaint_date_time', { ascending: false })
      .limit(1)

    if (!error && botRows && botRows.length > 0) {
      try {
        const parsed = JSON.parse(botRows[0].feedback_text) as VehiclePaymentRecord
        if (parsed && parsed.reg_number) {
          saveLocalPayment(parsed)
          return parsed
        }
      } catch {
        // ignore parse error
      }
    }
  } catch (err) {
    console.warn('fetchVehiclePayment bot data error:', err)
  }

  // B. Check service_reception_entries
  try {
    const { data: recData } = await supabase
      .from('service_reception_entries')
      .select('reg_number, jc_number, billed_amount, amount_received, owner_name, owner_phone, invoice_done_at')
      .eq('reg_number', norm)
      .limit(1)

    if (recData && recData.length > 0) {
      const r = recData[0]
      if (r.billed_amount != null && r.amount_received != null) {
        const total = Number(r.billed_amount) || 0
        const rec = Number(r.amount_received) || 0
        const remaining = Math.max(0, total - rec)
        const status: 'Pending' | 'Partially Paid' | 'Fully Paid' =
          total > 0 && remaining === 0 ? 'Fully Paid' : rec > 0 ? 'Partially Paid' : 'Pending'

        return {
          reg_number: norm,
          jc_number: r.jc_number || null,
          customer_name: r.owner_name || null,
          customer_phone: r.owner_phone || null,
          total_billed: total,
          amount_received: rec,
          remaining_amount: remaining,
          status,
          updated_at: r.invoice_done_at || new Date().toISOString(),
        }
      }
    }
  } catch {
    // fallback
  }

  // C. Fallback to local store
  const localStore = getLocalPayments()
  if (localStore[norm]) {
    return localStore[norm]
  }

  // D. Default fallback based on estimate
  const estimates = await fetchEstimatesForVehicle(norm)
  const estimateTotal = estimates.reduce((sum, e) => sum + (e.grand_total || 0), 0)
  if (estimateTotal > 0) {
    return {
      reg_number: norm,
      total_billed: estimateTotal,
      amount_received: 0,
      remaining_amount: estimateTotal,
      status: 'Pending',
      updated_at: new Date().toISOString(),
    }
  }

  return null
}

// 2. Save and broadcast payment status
export async function saveVehiclePayment(record: VehiclePaymentRecord): Promise<VehiclePaymentRecord> {
  const norm = record.reg_number.trim().toUpperCase()
  const remaining = Math.max(0, record.total_billed - record.amount_received)
  const status: 'Pending' | 'Partially Paid' | 'Fully Paid' =
    record.total_billed > 0 && remaining === 0
      ? 'Fully Paid'
      : record.amount_received > 0
      ? 'Partially Paid'
      : 'Pending'

  const payload: VehiclePaymentRecord = {
    ...record,
    reg_number: norm,
    remaining_amount: remaining,
    status,
    updated_at: new Date().toISOString(),
  }

  // Save locally
  saveLocalPayment(payload)

  // Broadcast window event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('techwheels_payment_updated', { detail: payload }))
  }

  // A. Sync to post_feedback_bot_data for cross-port real-time sync (5173 <-> 5174)
  try {
    const botRow = {
      vehicle_registration_number: norm,
      customer_name: payload.customer_name || 'Customer',
      mobile_number: payload.customer_phone || null,
      rating: 5,
      feedback_text: JSON.stringify(payload),
      service_type: `Payment: ${payload.status} (₹${payload.amount_received} / ₹${payload.total_billed})`,
      mode: 'customer_payment_payload',
      primary_complaint_area: payload.status,
      complaint_date_time: payload.updated_at,
    }

    const { data: existing } = await supabase
      .from('post_feedback_bot_data')
      .select('id')
      .eq('vehicle_registration_number', norm)
      .eq('mode', 'customer_payment_payload')

    if (existing && existing.length > 0) {
      await supabase.from('post_feedback_bot_data').update(botRow).eq('id', existing[0].id)
    } else {
      await supabase.from('post_feedback_bot_data').insert([botRow])
    }
  } catch (err) {
    console.warn('Sync payment to post_feedback_bot_data failed:', err)
  }

  // B. Update service_reception_entries table if entry exists
  try {
    await supabase
      .from('service_reception_entries')
      .update({
        billed_amount: payload.total_billed,
        amount_received: payload.amount_received,
        invoice_done_at: payload.status === 'Fully Paid' ? payload.updated_at : null,
      })
      .eq('reg_number', norm)
  } catch (err) {
    console.warn('Update service_reception_entries payment failed:', err)
  }

  return payload
}
