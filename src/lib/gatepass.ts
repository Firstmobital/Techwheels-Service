import { supabase } from './supabase'

export interface IssuedGatePassRecord {
  gate_pass_no: string
  reg_number: string
  customer_name: string
  customer_phone?: string | null
  job_card_no: string
  invoice_no?: string | null
  invoice_date?: string | null
  billed_amount?: number | null
  amount_received?: number | null
  payment_status: string
  issued_at: string
  issued_by: string
  branch?: string | null
  qr_token: string
}

const LOCAL_STORAGE_GATEPASS_KEY = 'techwheels_issued_gatepasses_store'

function getLocalGatePasses(): Record<string, IssuedGatePassRecord> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_GATEPASS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveLocalGatePass(record: IssuedGatePassRecord) {
  try {
    const store = getLocalGatePasses()
    const key = record.reg_number.trim().toUpperCase()
    store[key] = record
    localStorage.setItem(LOCAL_STORAGE_GATEPASS_KEY, JSON.stringify(store))
  } catch (e) {
    console.warn('Failed to save gate pass to localStorage:', e)
  }
}

// 1. Fetch issued gate pass for a vehicle
export async function fetchIssuedGatePass(regNumber: string): Promise<IssuedGatePassRecord | null> {
  const norm = regNumber.trim().toUpperCase()
  if (!norm) return null

  // A. Check post_feedback_bot_data for mode customer_gatepass_payload
  try {
    const { data, error } = await supabase
      .from('post_feedback_bot_data')
      .select('feedback_text, complaint_date_time')
      .eq('vehicle_registration_number', norm)
      .eq('mode', 'customer_gatepass_payload')
      .order('complaint_date_time', { ascending: false })
      .limit(1)

    if (!error && data && data.length > 0) {
      try {
        const parsed = JSON.parse(data[0].feedback_text) as IssuedGatePassRecord
        if (parsed && parsed.gate_pass_no) {
          saveLocalGatePass(parsed)
          return parsed
        }
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.warn('fetchIssuedGatePass bot data error:', err)
  }

  // B. Check local store
  const localStore = getLocalGatePasses()
  if (localStore[norm]) {
    return localStore[norm]
  }

  return null
}

// 2. Issue Gate Pass from Accounts Desk
export async function issueAccountsGatePass(record: IssuedGatePassRecord): Promise<IssuedGatePassRecord> {
  const norm = record.reg_number.trim().toUpperCase()
  const payload: IssuedGatePassRecord = {
    ...record,
    reg_number: norm,
    issued_at: record.issued_at || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    qr_token: `GP_AUTH_${record.gate_pass_no}_${norm}_SECURE`,
  }

  // Save to local store
  saveLocalGatePass(payload)

  // Broadcast window event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('techwheels_gatepass_issued', { detail: payload }))
  }

  // Sync to post_feedback_bot_data for customer app (port 5174)
  try {
    const botRow = {
      vehicle_registration_number: norm,
      customer_name: payload.customer_name || 'Customer',
      mobile_number: payload.customer_phone || null,
      rating: 5,
      feedback_text: JSON.stringify(payload),
      service_type: `Gate Pass #${payload.gate_pass_no}`,
      mode: 'customer_gatepass_payload',
      primary_complaint_area: 'Gate Pass Issued',
      complaint_date_time: new Date().toISOString(),
    }

    const { data: existing } = await supabase
      .from('post_feedback_bot_data')
      .select('id')
      .eq('vehicle_registration_number', norm)
      .eq('mode', 'customer_gatepass_payload')

    if (existing && existing.length > 0) {
      await supabase.from('post_feedback_bot_data').update(botRow).eq('id', existing[0].id)
    } else {
      await supabase.from('post_feedback_bot_data').insert([botRow])
    }
  } catch (err) {
    console.warn('Sync gatepass to post_feedback_bot_data failed:', err)
  }

  // Update service_reception_entries table if entry exists
  try {
    await supabase
      .from('service_reception_entries')
      .update({
        gate_pass_issued: true,
        gate_pass_number: payload.gate_pass_no,
      })
      .eq('reg_number', norm)
  } catch (err) {
    console.warn('Update service_reception_entries gatepass failed:', err)
  }

  return payload
}
