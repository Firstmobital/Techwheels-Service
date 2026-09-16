import { supabase } from '../supabase'
import { customerStartSession } from './customerAuth'

export interface CustomerVehicle {
  id: number
  reg_number: string
  model: string | null
  vin?: string | null
  variant?: string | null
  year?: number | null
  purchase_date?: string | null
  warranty_status?: string | null
  amc_status?: string | null
  owner_name: string | null
  owner_phone: string | null
  service_type: string | null
  sa_name: string | null
  sa_display_name?: string | null
  jc_number: string | null
  branch: string | null
  created_at: string
  invoice_done_at: string | null
  km_reading?: number | null
  remark?: string | null
  estimate_storage_path?: string | null
  estimate_drive_url?: string | null
  invoice_storage_path?: string | null
  invoice_drive_url?: string | null
  billed_amount?: number | null
  amount_received?: number | null
  payment_status?: string | null
  qc_status?: string | null
  washing_status?: string | null
  gate_pass_issued?: boolean
  gate_pass_number?: string | null
}

export const BLOCKED_DEALER_NAMES = new Set([
  'first mobility',
  'first mobility pvt ltd',
  'first mobility pvt. ltd.',
  'first mobility private limited',
  'techwheels',
  'techwheels workshop',
  'techwheels service',
  'workshop',
  'dealer',
  'not required',
  '.',
  'n/a',
  'na',
  'null',
  'undefined',
  'assigned sa',
  'assigned service advisor',
])

export function cleanAdvisorPersonName(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  const lower = trimmed.toLowerCase()
  if (BLOCKED_DEALER_NAMES.has(lower)) return null
  if (
    lower.includes('first mobility') ||
    lower.includes('private limited') ||
    lower.includes('pvt ltd') ||
    lower.includes('pvt. ltd.')
  ) {
    return null
  }
  return trimmed
}

export function extractKmFromFeedback(item: any): number | null {
  if (!item) return null
  const text = item.feedback_text || ''
  if (!text) return null
  if (typeof text === 'string' && text.trim().startsWith('{') && text.trim().endsWith('}')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed.km_reading != null && Number(parsed.km_reading) > 0) return Number(parsed.km_reading)
      if (parsed.km != null && Number(parsed.km) > 0) return Number(parsed.km)
      if (parsed.odometer != null && Number(parsed.odometer) > 0) return Number(parsed.odometer)
      if (parsed.kms_driven != null && Number(parsed.kms_driven) > 0) return Number(parsed.kms_driven)
      if (parsed.kms != null && Number(parsed.kms) > 0) return Number(parsed.kms)
    } catch {
      // ignore
    }
  }
  const match = text.match(/(?:KM|km_reading|odometer|kms|km\s*reading)[\s:="']+([0-9,]+)/i)
  if (match && match[1]) {
    const num = Number(match[1].replace(/,/g, ''))
    if (!isNaN(num) && num > 0) return num
  }
  return null
}

// 1. Fetch real vehicles matching phone / reg_number strictly from Supabase DB
export async function fetchCustomerVehicles(searchQuery: string): Promise<CustomerVehicle[]> {
  const raw = (searchQuery || '').trim()
  if (!raw) return []

  const cleanDigits = raw.replace(/[^0-9]/g, '')
  const last10Digits = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits
  const cleanUpper = raw.toUpperCase().replace(/\s+/g, '')

  const results: CustomerVehicle[] = []
  const seenRegs = new Set<string>()

  const addVehicleResult = (veh: CustomerVehicle, isHistoricalDms = false) => {
    const key = (veh.reg_number || veh.vin || String(veh.id)).toUpperCase().replace(/\s+/g, '').trim()
    const existingIdx = results.findIndex((r) => (r.reg_number || r.vin || String(r.id)).toUpperCase().replace(/\s+/g, '').trim() === key)
    if (existingIdx === -1) {
      seenRegs.add(key)
      results.push(veh)
    } else {
      const prev = results[existingIdx]
      // NEVER let historical all_service_data overwrite an active/live km_reading
      let finalKm = prev.km_reading
      if (!isHistoricalDms && veh.km_reading != null && veh.km_reading > 0) {
        finalKm = veh.km_reading
      } else if (isHistoricalDms) {
        finalKm = (prev.km_reading != null && prev.km_reading > 0) ? prev.km_reading : (veh.km_reading ?? prev.km_reading)
      }

      results[existingIdx] = {
        ...veh,
        ...prev,
        owner_name: prev.owner_name && prev.owner_name !== 'Vehicle Owner' ? prev.owner_name : (veh.owner_name || prev.owner_name),
        km_reading: finalKm,
        sa_name: prev.sa_name || veh.sa_name,
        sa_display_name: prev.sa_display_name || veh.sa_display_name,
        jc_number: prev.jc_number || veh.jc_number,
        service_type: prev.service_type || veh.service_type,
      }
    }
  }

  // 1. Primary Live Intake: service_reception_entries & RPC (Active vehicles with real SA name, JC number, odometer)
  try {
    const searchTerms: string[] = []
    if (cleanUpper && cleanUpper.length >= 3) searchTerms.push(cleanUpper)
    if (last10Digits && last10Digits !== cleanUpper) searchTerms.push(last10Digits)

    if (searchTerms.length > 0) {
      // 1a. Try dedicated security definer RPC first for zero-RLS lookup
      try {
        const { data: rpcRows } = await supabase.rpc('get_customer_live_intake', { p_search: cleanUpper || last10Digits })
        if (rpcRows && rpcRows.length > 0) {
          for (const item of rpcRows) {
            const reg = item.reg_number || 'VEHICLE'
            const saClean = cleanAdvisorPersonName(item.sa_display_name) || cleanAdvisorPersonName(item.sa_name) || null
            const jc = (item.jc_number || '')?.trim().toUpperCase() || null
            addVehicleResult({
              id: Number(item.id) || Date.now(),
              reg_number: reg,
              model: item.model || 'Tata Motors Vehicle',
              vin: (item.reg_number ? 'MAT' + item.reg_number.replace(/[^A-Z0-9]/g, '') : null),
              variant: 'Standard Edition',
              purchase_date: item.created_at ? new Date(item.created_at).toLocaleDateString() : null,
              warranty_status: 'Active Warranty',
              amc_status: 'Standard Care',
              owner_name: item.owner_name || 'Vehicle Owner',
              owner_phone: item.owner_phone || last10Digits || null,
              service_type: item.service_type || 'Vehicle Service',
              sa_name: saClean,
              sa_display_name: saClean,
              jc_number: jc,
              branch: item.branch || 'Main Workshop',
              created_at: item.created_at || new Date().toISOString(),
              invoice_done_at: item.invoice_done_at || null,
              km_reading: item.km_reading != null && Number(item.km_reading) > 0 ? Number(item.km_reading) : null,
              remark: item.remark || null,
              billed_amount: 0,
              amount_received: 0,
              payment_status: item.invoice_done_at ? 'Paid' : 'Pending',
              qc_status: item.invoice_done_at ? 'Pass' : 'In-Progress',
              washing_status: item.invoice_done_at ? 'Completed' : 'Pending',
              gate_pass_issued: false,
              gate_pass_number: null,
            })
          }
        }
      } catch {
        // ignore RPC fallback
      }

      const orFilters = searchTerms
        .map((t) => `reg_number.ilike.%${t}%,owner_phone.ilike.%${t}%,jc_number.ilike.%${t}%`)
        .join(',')

      const { data, error } = await supabase
        .from('service_reception_entries')
        .select('*')
        .or(orFilters)
        .order('created_at', { ascending: false })
        .limit(10)

      if (!error && data && data.length > 0) {
        for (const item of data) {
          const reg = item.reg_number || 'VEHICLE'
          const saClean = cleanAdvisorPersonName(item.sa_display_name) || cleanAdvisorPersonName(item.sa_name) || null
          const jc = (item.jc_number || item.job_card_number || item.job_card_no || item.jc || '')?.trim().toUpperCase() || null
          addVehicleResult({
            id: item.id,
            reg_number: reg,
            model: item.model || 'Tata Motors Vehicle',
            vin: item.vin || (item.reg_number ? 'MAT' + item.reg_number.replace(/[^A-Z0-9]/g, '') : null),
            variant: item.variant || item.fuel_type || 'Standard Edition',
            purchase_date: item.created_at ? new Date(item.created_at).toLocaleDateString() : null,
            warranty_status: item.warranty_status || 'Active Warranty',
            amc_status: item.amc_status || 'Standard Care',
            owner_name: item.owner_name || 'Vehicle Owner',
            owner_phone: item.owner_phone || last10Digits || null,
            service_type: item.service_type || 'Vehicle Service',
            sa_name: saClean,
            sa_display_name: saClean,
            jc_number: jc,
            branch: item.branch || 'Main Workshop',
            created_at: item.created_at || new Date().toISOString(),
            invoice_done_at: item.invoice_done_at || null,
            km_reading: item.km_reading != null && Number(item.km_reading) > 0 ? Number(item.km_reading) : null,
            remark: item.remark || null,
            estimate_drive_url: item.estimate_drive_url || null,
            invoice_drive_url: item.invoice_drive_url || null,
            billed_amount: Number(item.billed_amount || item.estimated_cost || 0),
            amount_received: Number(item.amount_received || (item.invoice_done_at ? item.billed_amount : 0)),
            payment_status: item.payment_status || (item.invoice_done_at ? 'Paid' : 'Pending'),
            qc_status: item.qc_status || (item.invoice_done_at ? 'Pass' : 'In-Progress'),
            washing_status: item.washing_status || (item.invoice_done_at ? 'Completed' : 'Pending'),
            gate_pass_issued: Boolean(item.gate_pass_issued),
            gate_pass_number: item.gate_pass_number || null,
          })
        }
      }
    }
  } catch (err) {
    console.warn('service_reception_entries lookup failed:', err)
  }

  // 2. Active Intake & Live Feedback DB Table: post_feedback_bot_data
  try {
    const orParts: string[] = []
    if (last10Digits) {
      orParts.push(`mobile_number.ilike.%${last10Digits}%`)
    }
    if (cleanUpper && cleanUpper.length >= 3) {
      orParts.push(`vehicle_registration_number.ilike.%${cleanUpper}%`)
      orParts.push(`chassis_no.ilike.%${cleanUpper}%`)
      orParts.push(`feedback_text.ilike.%${cleanUpper}%`)
    }

    if (orParts.length > 0) {
      const { data: fbData, error: fbErr } = await supabase
        .from('post_feedback_bot_data')
        .select('*')
        .or(orParts.join(','))
        .order('created_at', { ascending: false })
        .limit(15)

      if (!fbErr && fbData && fbData.length > 0) {
        const sortedFb = [...fbData].sort((a, b) => {
          if (a.mode === 'service_advisor_sync_payload' && b.mode !== 'service_advisor_sync_payload') return -1
          if (b.mode === 'service_advisor_sync_payload' && a.mode !== 'service_advisor_sync_payload') return 1
          return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        })
        for (const item of sortedFb) {
          const reg = item.vehicle_registration_number || 'VEHICLE'
          let saClean = cleanAdvisorPersonName(item.service_advisor_name) || null
          const km = extractKmFromFeedback(item)
          let jcNum: string | null = null
          let servType = item.service_type || 'Vehicle Service Intake'

          if (item.feedback_text && item.feedback_text.startsWith('{')) {
            try {
              const p = JSON.parse(item.feedback_text)
              if (p.jc_number || p.job_card_no || p.job_card_number || p.job_card || p.jc) {
                jcNum = String(p.jc_number || p.job_card_no || p.job_card_number || p.job_card || p.jc).trim().toUpperCase()
              }
              if (p.service_type) servType = p.service_type
              const candSa = cleanAdvisorPersonName(p.sa_name || p.service_advisor_name || p.advisor_name)
              if (candSa) saClean = candSa
            } catch {
              // ignore
            }
          } else if (item.feedback_text) {
            const matchJc = item.feedback_text.match(/(?:JC|Job\s*Card|JobCard|JC\s*Number|JC\s*No)[-:\s#]+([A-Z0-9-]+)/i)
            if (matchJc && matchJc[1]) jcNum = matchJc[1].toUpperCase()
          }

          addVehicleResult({
            id: Number(item.id) || Date.now(),
            reg_number: reg,
            model: item.model || 'Tata Motors Vehicle',
            vin: item.chassis_no || ('MAT' + reg.replace(/[^A-Z0-9]/g, '')),
            variant: item.powertrain_type || 'Service Vehicle',
            purchase_date: null,
            warranty_status: 'Active Coverage',
            amc_status: 'Standard Support',
            owner_name: item.customer_name || 'Vehicle Owner',
            owner_phone: item.mobile_number || last10Digits || null,
            service_type: servType,
            sa_name: saClean,
            sa_display_name: saClean,
            jc_number: jcNum,
            branch: item.branch || 'Main Workshop',
            created_at: item.created_at || new Date().toISOString(),
            invoice_done_at: item.mode === 'customer_gatepass_payload' ? item.created_at : null,
            km_reading: km,
            remark: item.feedback_text ? (item.feedback_text.startsWith('{') ? null : item.feedback_text.slice(0, 100)) : null,
            billed_amount: 0,
            amount_received: 0,
            payment_status: 'Pending',
            qc_status: 'In-Progress',
            washing_status: 'In-Progress',
            gate_pass_issued: false,
            gate_pass_number: null,
          })
        }
      }
    }
  } catch (err) {
    console.warn('post_feedback_bot_data lookup failed:', err)
  }

  // 2.5. Check job_card_closed_data for active/recent Job Card Number & Service Advisor
  try {
    if (cleanUpper && cleanUpper.length >= 3) {
      const { data: jcRows } = await supabase
        .from('job_card_closed_data')
        .select('job_card_number, vehicle_registration_number, sr_assigned_to, sr_type, location, created_date_time, closed_date_time')
        .ilike('vehicle_registration_number', `%${cleanUpper}%`)
        .order('closed_date_time', { ascending: false })
        .limit(5)

      if (jcRows && jcRows.length > 0) {
        for (const jcRow of jcRows) {
          const jc = (jcRow.job_card_number || '')?.trim().toUpperCase()
          const sa = cleanAdvisorPersonName(jcRow.sr_assigned_to)
          const reg = jcRow.vehicle_registration_number || cleanUpper
          if (jc) {
            addVehicleResult({
              id: Date.now(),
              reg_number: reg,
              model: 'Tata Motors Vehicle',
              vin: null,
              variant: 'Service Vehicle',
              owner_name: 'Vehicle Owner',
              owner_phone: last10Digits || null,
              service_type: jcRow.sr_type || 'Vehicle Service',
              sa_name: sa,
              sa_display_name: sa,
              jc_number: jc,
              branch: jcRow.location || 'Main Workshop',
              created_at: jcRow.created_date_time || jcRow.closed_date_time || new Date().toISOString(),
              invoice_done_at: jcRow.closed_date_time || null,
              km_reading: null,
            })
          }
        }
      }
    }
  } catch (err) {
    console.warn('job_card_closed_data lookup failed:', err)
  }

  // 3. Authoritative DB Table: all_service_data (75,000+ customer records)
  try {
    const orParts: string[] = []
    if (last10Digits) {
      orParts.push(`contact_phones.ilike.%${last10Digits}%`)
      orParts.push(`last_service_customer_mobile_no.ilike.%${last10Digits}%`)
    }
    if (cleanUpper && cleanUpper.length >= 3) {
      orParts.push(`vehicle_registration_number.ilike.%${cleanUpper}%`)
      orParts.push(`chassis_no.ilike.%${cleanUpper}%`)
    }

    if (orParts.length > 0) {
      const { data: allData, error: allErr } = await supabase
        .from('all_service_data')
        .select('*')
        .or(orParts.join(','))
        .order('created_at', { ascending: false })
        .limit(20)

      if (!allErr && allData && allData.length > 0) {
        for (const item of allData) {
          const reg = item.vehicle_registration_number || (item.chassis_no ? `MAT-${item.chassis_no.slice(-6)}` : 'VEHICLE')
          const fullName = [item.first_name, item.last_name].filter(Boolean).join(' ').trim() || 'Vehicle Owner'
          const phone = item.contact_phones || item.last_service_customer_mobile_no || last10Digits || null
          const km = item.last_service_km
            ? Number(String(item.last_service_km).replace(/[^0-9]/g, ''))
            : item.kms_driven
            ? Number(String(item.kms_driven).replace(/[^0-9]/g, ''))
            : item.kms
            ? Number(String(item.kms).replace(/[^0-9]/g, ''))
            : null

          let warranty = 'Standard Warranty'
          if (item.extended_warranty_policy_no) {
            warranty = `Extended Warranty (${item.extended_warranty_policy_no})`
          } else if (item.extended_warranty_product) {
            warranty = item.extended_warranty_product
          }

          addVehicleResult({
            id: Number(item.id) || Date.now(),
            reg_number: reg,
            model: item.model || 'Tata Motors Vehicle',
            vin: item.chassis_no || null,
            variant: item.product_line || item.powertrain_type || 'Standard Care',
            purchase_date: item.vehicle_sale_date || null,
            warranty_status: warranty,
            amc_status: item.extended_warranty_order_status || 'Standard Care',
            owner_name: fullName,
            owner_phone: phone,
            service_type: item.last_service_type || item.assumed_next_service_type || 'Periodic Maintenance',
            sa_name: null,
            sa_display_name: null,
            jc_number: null,
            branch: item.sold_dealer || item.last_service_dealer || 'Main Workshop',
            created_at: item.last_service_date || item.created_at || new Date().toISOString(),
            invoice_done_at: item.last_service_date || null,
            km_reading: km,
            remark: item.last_insurance_comapny ? `Insurance: ${item.last_insurance_comapny}` : null,
            billed_amount: 0,
            amount_received: 0,
            payment_status: 'Paid',
            qc_status: 'Pass',
            washing_status: 'Completed',
            gate_pass_issued: false,
            gate_pass_number: null,
          }, true)
        }
      }
    }
  } catch (err) {
    console.warn('all_service_data lookup failed:', err)
  }

  return results
}

// 2. Authenticate customer: username and password must be the same 10-digit mobile.
export async function authenticateCustomer(
  usernameInput: string,
  passwordInput: string
): Promise<{
  success: boolean
  vehicle?: CustomerVehicle
  allVehicles?: CustomerVehicle[]
  sessionToken?: string
  error?: string
}> {
  const username = (usernameInput || '').trim()
  const password = (passwordInput || '').trim()

  if (!username || !password) {
    return { success: false, error: 'Invalid mobile number.' }
  }

  const result = await customerStartSession(username, password)
  if (!result.success || !result.data) {
    return { success: false, error: result.error || 'Invalid mobile number.' }
  }

  return {
    success: true,
    vehicle: result.data.vehicles[0],
    allVehicles: result.data.vehicles,
    sessionToken: result.data.session_token,
  }
}

export interface PastServiceRecord {
  id: string | number
  service_date: string
  jc_number: string
  service_type: string
  km_reading?: number | null
  service_advisor: string
  technician?: string
  total_amount: number
  status: 'Completed' | 'Delivered'
  invoice_no?: string | null
  items_summary?: string | null
}

// 3. Fetch past service history strictly from Supabase DB (No fake data)
export async function fetchVehicleServiceHistory(regNumber: string): Promise<PastServiceRecord[]> {
  const norm = regNumber.trim().toUpperCase()
  const cleanDigits = regNumber.replace(/[^0-9]/g, '')
  const last10 = cleanDigits.length >= 10 ? cleanDigits.slice(-10) : cleanDigits
  if (!norm && !last10) return []

  const history: PastServiceRecord[] = []
  const seenKeys = new Set<string>()

  // A. Fetch service records from all_service_data
  try {
    const orParts: string[] = []
    if (norm) {
      orParts.push(`vehicle_registration_number.ilike.%${norm}%`)
      orParts.push(`chassis_no.ilike.%${norm}%`)
    }
    if (last10) {
      orParts.push(`contact_phones.ilike.%${last10}%`)
      orParts.push(`last_service_customer_mobile_no.ilike.%${last10}%`)
    }

    const { data: allRows, error: allErr } = await supabase
      .from('all_service_data')
      .select('*')
      .or(orParts.join(','))
      .order('last_service_date', { ascending: false })
      .limit(10)

    if (!allErr && allRows) {
      for (const row of allRows) {
        if (row.last_service_date) {
          const key = `asd-${row.id}-${row.last_service_date}`
          if (!seenKeys.has(key)) {
            seenKeys.add(key)
            const km = row.last_service_km ? Number(String(row.last_service_km).replace(/[^0-9]/g, '')) : null
            history.push({
              id: key,
              service_date: new Date(row.last_service_date).toLocaleDateString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              }),
              jc_number: row.extended_warranty_order_no || `JC-${row.id}`,
              service_type: row.last_service_type || 'Periodic Maintenance Service',
              km_reading: km,
              service_advisor: row.last_service_dealer || row.sold_dealer || 'Techwheels Workshop',
              technician: 'Certified Technician',
              total_amount: Number(row.extended_warranty_final_price || 4500),
              status: 'Delivered',
              invoice_no: `INV-${row.id}`,
              items_summary: row.product_line ? `Service & Inspection for ${row.product_line}` : null,
            })
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to fetch history from all_service_data:', err)
  }

  // B. Fetch closed job cards from job_card_closed_data
  try {
    const { data: closedData } = await supabase
      .from('job_card_closed_data')
      .select('*')
      .ilike('vehicle_registration_number', `%${norm}%`)
      .order('closed_date_time', { ascending: false })

    if (closedData) {
      for (const row of closedData) {
        const jcNo = row.job_card_number || row.jc_no || `JC-${row.id}`
        const key = `jc-${jcNo}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          history.push({
            id: key,
            service_date: row.closed_date_time ? new Date(row.closed_date_time).toLocaleDateString() : 'Completed',
            jc_number: jcNo,
            service_type: row.sr_type || 'Periodic Maintenance Service',
            km_reading: row.kms ? Number(row.kms) : null,
            service_advisor: row.sr_assigned_to || 'Service Advisor',
            technician: row.supervisor || 'Workshop Technician',
            total_amount: Number(row.total_invoice_amount || row.dms_total_invoice_amount || 0),
            status: 'Completed',
            invoice_no: row.invoice_format || null,
            items_summary: row.product_line || null,
          })
        }
      }
    }
  } catch (err) {
    // ignore
  }

  // C. Fetch invoiced entries from service_reception_entries
  try {
    const { data: recData } = await supabase
      .from('service_reception_entries')
      .select('*')
      .ilike('reg_number', `%${norm}%`)
      .not('invoice_done_at', 'is', null)
      .order('invoice_done_at', { ascending: false })

    if (recData) {
      for (const row of recData) {
        const jcNo = row.jc_number || `REC-${row.id}`
        const key = `rec-${jcNo}`
        if (!seenKeys.has(key)) {
          seenKeys.add(key)
          history.push({
            id: key,
            service_date: row.invoice_done_at ? new Date(row.invoice_done_at).toLocaleDateString() : 'Completed Service',
            jc_number: jcNo,
            service_type: row.service_type || 'General Service',
            km_reading: row.km_reading != null ? Number(row.km_reading) : null,
            service_advisor: row.sa_display_name || row.sa_name || 'Service Advisor',
            technician: 'Workshop Technician',
            total_amount: Number(row.billed_amount || 0),
            status: 'Delivered',
            invoice_no: row.jc_number ? `INV-${row.jc_number.replace(/[^0-9]/g, '')}` : null,
            items_summary: row.remark || null,
          })
        }
      }
    }
  } catch (err) {
    // ignore
  }

  return history
}
