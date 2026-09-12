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

  // B. Check service_reception_entries if gate_pass_issued is true
  try {
    const { data: recData } = await supabase
      .from('service_reception_entries')
      .select('reg_number, jc_number, owner_name, owner_phone, billed_amount, amount_received, gate_pass_issued, gate_pass_number, invoice_number, branch')
      .eq('reg_number', norm)
      .limit(1)

    if (recData && recData.length > 0 && recData[0].gate_pass_issued) {
      const r = recData[0]
      const gpNo = r.gate_pass_number || `GP-${r.jc_number ? r.jc_number.replace(/[^0-9]/g, '').slice(-5) : '85201'}`
      const rec: IssuedGatePassRecord = {
        gate_pass_no: gpNo,
        reg_number: norm,
        customer_name: r.owner_name || 'Customer',
        customer_phone: r.owner_phone || null,
        job_card_no: r.jc_number || 'JC-2026',
        invoice_no: r.invoice_number || `INV-${gpNo.replace('GP-', '')}`,
        billed_amount: r.billed_amount,
        amount_received: r.amount_received,
        payment_status: 'Paid',
        issued_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        issued_by: 'Accounts Desk · Dealership',
        branch: r.branch || 'Sitapura Workshop',
        qr_token: `GP_AUTH_${gpNo}_${norm}_SECURE`,
      }
      saveLocalGatePass(rec)
      return rec
    }
  } catch {
    // fallback
  }

  // C. Check local store
  const localStore = getLocalGatePasses()
  if (localStore[norm]) {
    return localStore[norm]
  }

  return null
}
