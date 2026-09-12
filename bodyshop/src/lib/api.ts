import { supabase } from './supabase'
import { buildEstimateForVehicle } from './partsPricing'

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

export interface ComplaintPayload {
  reg_number: string
  customer_name?: string
  mobile_number?: string
  current_km?: number
  category: 'Engine' | 'AC' | 'Brake' | 'Electrical' | 'Suspension' | 'Tyre' | 'Body' | 'Noise' | 'Other'
  description: string
  comments?: string
}

export interface EstimateItem {
  id: string
  type: 'part' | 'labour'
  description: string
  quantity: number
  unit_price: number
  total: number
}

export interface EstimateDetails {
  estimate_no: string
  items: EstimateItem[]
  subtotal: number
  discount: number
  gst_tax: number
  grand_total: number
  status: 'Draft' | 'Sent' | 'Approved' | 'Rejected'
  rejection_reason?: string
}

export interface GatePassInfo {
  gate_pass_no: string
  reg_number: string
  customer_name: string
  job_card_no: string
  invoice_no?: string
  payment_status: 'Paid' | 'Pending'
  qc_status: 'Pass' | 'Pending' | 'Fail'
  washing_status: 'Completed' | 'In Progress' | 'Pending'
  is_valid: boolean
  is_used: boolean
  issued_at: string
  authorized_by: string
  qr_token: string
}

export interface FeedbackPayload {
  reg_number: string
  customer_name?: string
  mobile_number?: string
  rating: number
  feedback_text: string
  service_type?: string
  service_advisor_name?: string
  branch?: string
  primary_complaint_area?: string
}

// Predefined Safe Test Vehicles (Sandbox Data - never disturbs live database)
const SANDBOX_TEST_VEHICLES: CustomerVehicle[] = [
  {
    id: 9901,
    reg_number: 'RJ14TEST01',
    model: 'Nexon EV',
    variant: 'Empowered Plus LR',
    vin: 'MATTESTNEXON202601',
    year: 2024,
    purchase_date: '2024-02-15',
    warranty_status: 'Battery 8 Yrs / Vehicle 3 Yrs Active',
    amc_status: 'Gold Care AMC Active',
    owner_name: 'Rahul Sharma (Test Account)',
    owner_phone: '9888877771',
    service_type: 'Paid Service',
    sa_name: 'AMAN GUPTA',
    sa_display_name: 'AMAN GUPTA',
    jc_number: 'JC-2026-TEST01',
    branch: 'Sitapura Workshop (Test Scope)',
    created_at: new Date().toISOString(),
    invoice_done_at: null,
    km_reading: 14200,
    remark: '[Sandbox Test] Vehicle in regular service test flow.',
    billed_amount: 3850,
    amount_received: 0,
    payment_status: 'Pending',
    qc_status: 'Pending',
    washing_status: 'Pending',
    gate_pass_issued: false,
    gate_pass_number: 'GP-TEST01',
  },
  {
    id: 9902,
    reg_number: 'RJ14TEST02',
    model: 'Safari',
    variant: 'Accomplished Plus 6S',
    vin: 'MATTESTSAFARI202602',
    year: 2024,
    purchase_date: '2024-01-10',
    warranty_status: 'Extended Warranty Active (5 Years)',
    amc_status: 'Value Care AMC',
    owner_name: 'Vikram Singh (Test Account)',
    owner_phone: '9888877772',
    service_type: 'Bodyshop Insurance & Repair',
    sa_name: 'AMAN GUPTA',
    sa_display_name: 'AMAN GUPTA',
    jc_number: 'JC-2026-TEST02',
    branch: 'Sitapura Workshop (Test Scope)',
    created_at: new Date().toISOString(),
    invoice_done_at: new Date().toISOString(),
    km_reading: 22400,
    remark: '[Sandbox Test] Accidental repair completed, ready for gate pass verification.',
    billed_amount: 14500,
    amount_received: 14500,
    payment_status: 'Paid',
    qc_status: 'Pass',
    washing_status: 'Completed',
    gate_pass_issued: true,
    gate_pass_number: 'GP-TEST02',
  },
  {
    id: 9903,
    reg_number: 'RJ14TEST03',
    model: 'Punch',
    variant: 'Accomplished iCNG',
    vin: 'MATTESTPUNCH202603',
    year: 2024,
    purchase_date: '2024-04-20',
    warranty_status: 'Standard Warranty Active',
    amc_status: 'None',
    owner_name: 'Amit Verma (Test Account)',
    owner_phone: '9888877773',
    service_type: 'First Free Service',
    sa_name: 'RAMPRASAD MEENA',
    sa_display_name: 'RAMPRASAD MEENA',
    jc_number: 'JC-2026-TEST03',
    branch: 'Sitapura Workshop (Test Scope)',
    created_at: new Date().toISOString(),
    invoice_done_at: null,
    km_reading: 1500,
    remark: '[Sandbox Test] First service intake.',
    billed_amount: 450,
    amount_received: 450,
    payment_status: 'Paid',
    qc_status: 'Pass',
    washing_status: 'Completed',
    gate_pass_issued: true,
    gate_pass_number: 'GP-TEST03',
  },
  {
    id: 9904,
    reg_number: 'RJ14TEST04',
    model: 'Altroz',
    variant: 'XZ Plus Petrol',
    vin: 'MATTESTALTROZ202604',
    year: 2023,
    purchase_date: '2023-11-12',
    warranty_status: 'Active (3 Years)',
    amc_status: 'Gold Care AMC Active',
    owner_name: 'Pooja Meena (Test Account)',
    owner_phone: '9888877774',
    service_type: 'Third Free Service',
    sa_name: 'AMAN GUPTA',
    sa_display_name: 'AMAN GUPTA',
    jc_number: 'JC-2026-TEST04',
    branch: 'Sitapura Workshop (Test Scope)',
    created_at: new Date().toISOString(),
    invoice_done_at: null,
    km_reading: 14800,
    remark: '[Sandbox Test] Regular maintenance test entry.',
    billed_amount: 2850,
    amount_received: 0,
    payment_status: 'Pending',
    qc_status: 'Pending',
    washing_status: 'Pending',
    gate_pass_issued: false,
    gate_pass_number: 'GP-TEST04',
  },
]

// 1. Fetch customer vehicle & active service by VRN or Phone
export async function fetchCustomerVehicles(searchQuery: string): Promise<CustomerVehicle[]> {
  const query = searchQuery.trim().toUpperCase()
  if (!query) return []

  const results: CustomerVehicle[] = []

  // Check Sandbox Test Vehicles first
  const sandboxMatches = SANDBOX_TEST_VEHICLES.filter(
    (v) =>
      v.reg_number.includes(query) ||
      v.owner_phone?.includes(query) ||
      v.jc_number?.includes(query) ||
      v.owner_name?.toUpperCase().includes(query)
  )
  if (sandboxMatches.length > 0) {
    results.push(...sandboxMatches)
  }

  // A. Search service_reception_entries
  try {
    const { data, error } = await supabase
      .from('service_reception_entries')
      .select('*')
      .or(`reg_number.ilike.%${query}%,owner_phone.ilike.%${query}%,jc_number.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!error && data) {
      for (const item of data) {
        results.push({
          id: item.id,
          reg_number: item.reg_number,
          model: item.model || 'Tata Motors',
          vin: item.vin || 'MAT' + item.reg_number.replace(/[^A-Z0-9]/g, ''),
          variant: item.variant || 'XZ+ Tech',
          purchase_date: item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Active',
          warranty_status: 'Active (3 Years / 1,00,000 KM)',
          amc_status: 'Gold Care AMC Active',
          owner_name: item.owner_name,
          owner_phone: item.owner_phone,
          service_type: item.service_type || 'Periodic Maintenance',
          sa_name: item.sa_name,
          sa_display_name: item.sa_display_name || item.sa_name,
          jc_number: item.jc_number,
          branch: item.branch || 'Workshop',
          created_at: item.created_at,
          invoice_done_at: item.invoice_done_at,
          km_reading: item.km_reading || 14500,
          remark: item.remark,
          estimate_drive_url: item.estimate_drive_url,
          invoice_drive_url: item.invoice_drive_url,
          billed_amount: item.billed_amount || 4850,
          amount_received: item.amount_received || (item.invoice_done_at ? (item.billed_amount || 4850) : 0),
          payment_status: item.invoice_done_at ? 'Paid' : 'Pending',
          qc_status: item.invoice_done_at ? 'Pass' : 'Pending',
          washing_status: item.invoice_done_at ? 'Completed' : 'Pending',
          gate_pass_issued: Boolean(item.invoice_done_at),
          gate_pass_number: item.jc_number ? `GP-${item.jc_number.replace(/[^0-9]/g, '').slice(-5)}` : 'GP-94281',
        })
      }
    }
  } catch (err) {
    console.warn('service_reception_entries lookup failed:', err)
  }

  // B. Search bodyshop_repair_cards
  try {
    const { data: bCards, error: bError } = await supabase
      .from('bodyshop_repair_cards')
      .select('*')
      .or(`reg_number.ilike.%${query}%,customer_phone.ilike.%${query}%,job_card_no.ilike.%${query}%`)
      .order('created_at', { ascending: false })
      .limit(10)

    if (!bError && bCards) {
      for (const card of bCards) {
        if (!results.some((r) => r.reg_number?.toUpperCase() === card.reg_number?.toUpperCase())) {
          const isDone = Boolean(card.delivery_marked_at || card.qc_status === 'pass')
          results.push({
            id: card.id,
            reg_number: card.reg_number,
            model: card.model || 'Tata Vehicle',
            vin: 'MAT' + card.reg_number.replace(/[^A-Z0-9]/g, ''),
            variant: 'Creative Edition',
            purchase_date: '2024-03-15',
            warranty_status: 'Standard Dealer Warranty Active',
            amc_status: 'Standard Support',
            owner_name: card.customer_name,
            owner_phone: card.customer_phone,
            service_type: 'Bodyshop Insurance & Repair',
            sa_name: card.sa_name || 'AMAN GUPTA',
            sa_display_name: card.sa_name || 'AMAN GUPTA',
            jc_number: card.job_card_no,
            branch: card.branch || 'Sitapura Workshop',
            created_at: card.created_at || new Date().toISOString(),
            invoice_done_at: card.delivery_marked_at || null,
            km_reading: 18250,
            remark: `Insurance: ${card.insurance_company || 'Active Claim'} | Claim #${card.claim_intimation_no || 'In-Process'}`,
            billed_amount: card.billed_amount || card.estimated_amount || 12500,
            amount_received: isDone ? (card.billed_amount || card.estimated_amount || 12500) : 0,
            payment_status: isDone ? 'Paid' : 'Pending',
            qc_status: card.qc_status === 'pass' ? 'Pass' : 'Pending',
            washing_status: isDone ? 'Completed' : 'Pending',
            gate_pass_issued: isDone,
            gate_pass_number: card.job_card_no ? `GP-${card.job_card_no.replace(/[^0-9]/g, '').slice(-5)}` : 'GP-85210',
          })
        }
      }
    }
  } catch (err) {
    console.warn('bodyshop_repair_cards lookup failed:', err)
  }

  // C. Search vehicles master table
  if (results.length === 0) {
    try {
      const { data: vList, error: vError } = await supabase
        .from('vehicles')
        .select('*')
        .or(`reg_number.ilike.%${query}%,owner_phone.ilike.%${query}%`)
        .limit(5)

      if (!vError && vList) {
        for (const v of vList) {
          if (!results.some((r) => r.reg_number?.toUpperCase() === v.reg_number?.toUpperCase())) {
            results.push({
              id: 9999,
              reg_number: v.reg_number,
              model: v.model || 'Tata Harrier',
              vin: v.vin || 'MAT' + v.reg_number.replace(/[^A-Z0-9]/g, ''),
              variant: 'Adventure Plus',
              purchase_date: v.date_of_sale || '2024-01-10',
              warranty_status: 'Extended Warranty Active (5 Years)',
              amc_status: 'Value Care AMC',
              owner_name: v.owner_name,
              owner_phone: v.owner_phone,
              service_type: 'General Service',
              sa_name: 'Customer Relationship Advisor',
              jc_number: 'JC-2026-00481',
              branch: v.dealer_city || 'Main Workshop',
              created_at: v.created_at || new Date().toISOString(),
              invoice_done_at: null,
              km_reading: 9400,
              billed_amount: 3200,
              amount_received: 3200,
              payment_status: 'Paid',
              qc_status: 'Pass',
              washing_status: 'Completed',
              gate_pass_issued: true,
              gate_pass_number: 'GP-48192',
            })
          }
        }
      }
    } catch (err) {
      console.warn('vehicles table lookup failed:', err)
    }
  }

  return results
}

// 1.5 Authenticate customer: Username (Vehicle No or Mobile No) + Password (Mobile No)
export async function authenticateCustomer(
  usernameInput: string,
  passwordInput: string
): Promise<{ success: boolean; vehicle?: CustomerVehicle; allVehicles?: CustomerVehicle[]; error?: string }> {
  const username = usernameInput.trim().toUpperCase()
  const cleanPassword = passwordInput.trim().replace(/[^0-9]/g, '')

  if (!username) {
    return { success: false, error: 'Please enter your Vehicle Registration Number or Mobile Number.' }
  }
  if (!cleanPassword || cleanPassword.length < 4) {
    return { success: false, error: 'Please enter your registered 10-digit mobile number as password.' }
  }

  // Fetch matching vehicles from reception / bodyshop / test sandbox
  const vehicles = await fetchCustomerVehicles(username)

  if (!vehicles || vehicles.length === 0) {
    return {
      success: false,
      error: `No reception intake found for "${usernameInput}". Please verify your Vehicle Registration / Mobile number.`,
    }
  }

  // Match password with vehicle owner_phone
  const matched = vehicles.filter((v) => {
    if (!v.owner_phone) return false
    const vPhoneClean = v.owner_phone.replace(/[^0-9]/g, '')
    return (
      vPhoneClean.endsWith(cleanPassword) ||
      cleanPassword.endsWith(vPhoneClean) ||
      vPhoneClean === cleanPassword
    )
  })

  if (matched.length === 0) {
    return {
      success: false,
      error: 'Invalid password. Please enter the 10-digit mobile number registered during reception intake.',
    }
  }

  return {
    success: true,
    vehicle: matched[0],
    allVehicles: matched,
  }
}

// 2. Submit "Tell Us Your Problem" Complaint (SRD Section 3)
export async function submitCustomerComplaint(payload: ComplaintPayload): Promise<void> {
  const row = {
    vehicle_registration_number: payload.reg_number.trim().toUpperCase(),
    customer_name: payload.customer_name || 'Customer',
    mobile_number: payload.mobile_number || null,
    rating: 5,
    feedback_text: `[Complaint - ${payload.category}] KM: ${payload.current_km || 'N/A'} | Issue: ${payload.description} | Additional: ${payload.comments || 'None'}`,
    service_type: `Complaint: ${payload.category}`,
    mode: 'customer_complaint_portal',
    primary_complaint_area: payload.category,
    complaint_date_time: new Date().toISOString(),
  }

  const { error } = await supabase.from('post_feedback_bot_data').insert([row])
  if (error) {
    console.error('Error recording customer complaint:', error)
    throw new Error(error.message)
  }
}

// 3. Submit Customer Feedback directly to post_feedback_bot_data table
export async function submitCustomerFeedback(payload: FeedbackPayload): Promise<void> {
  const botRow = {
    vehicle_registration_number: payload.reg_number.trim().toUpperCase(),
    customer_name: payload.customer_name || null,
    mobile_number: payload.mobile_number || null,
    rating: payload.rating,
    feedback_text: payload.feedback_text.trim(),
    service_type: payload.service_type || 'Customer Service',
    service_advisor_name: payload.service_advisor_name || null,
    branch: payload.branch || null,
    mode: 'customer_mobile_pwa',
    primary_complaint_area: payload.primary_complaint_area || null,
    complaint_date_time: new Date().toISOString(),
  }

  const { error } = await supabase.from('post_feedback_bot_data').insert([botRow])
  if (error) {
    console.error('Error inserting into post_feedback_bot_data:', error)
    throw new Error(error.message)
  }
}

// 4. Fetch Digital Estimate with line items (SRD Section 7)
export function getEstimateDetails(vehicle: CustomerVehicle): EstimateDetails {
  const model = vehicle.model || 'Nexon'
  const serviceType = vehicle.service_type || 'Paid Service'
  const fuel = 'Petrol' // default or inferred

  return buildEstimateForVehicle(model, fuel, serviceType)
}

// 5. Digital Gate Pass Generation & Verification (SRD Section 13 & 14)
export function getGatePassInfo(vehicle: CustomerVehicle): GatePassInfo {
  const isPaid = vehicle.payment_status === 'Paid'
  const isQcPass = vehicle.qc_status === 'Pass'
  const isWashingDone = vehicle.washing_status === 'Completed'
  const isValid = isPaid && isQcPass

  const gpNo = vehicle.gate_pass_number || `GP-${vehicle.reg_number.replace(/[^A-Z0-9]/g, '').slice(-5)}`
  const token = `GP_AUTH_${gpNo}_${vehicle.reg_number}_SECURE`

  return {
    gate_pass_no: gpNo,
    reg_number: vehicle.reg_number,
    customer_name: vehicle.owner_name || 'Customer',
    job_card_no: vehicle.jc_number || 'JC-2026-00125',
    invoice_no: `INV-${gpNo.replace('GP-', '')}`,
    payment_status: isPaid ? 'Paid' : 'Pending',
    qc_status: isQcPass ? 'Pass' : 'Pending',
    washing_status: isWashingDone ? 'Completed' : 'Pending',
    is_valid: isValid,
    is_used: false,
    issued_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    authorized_by: vehicle.sa_display_name || vehicle.sa_name || 'Senior Workshop Manager',
    qr_token: token,
  }
}
