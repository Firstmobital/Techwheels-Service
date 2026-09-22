import { supabase } from '../supabase'

export interface CustomerVehicle {
  id: string | number
  source?: string
  reg_number: string
  reg_key?: string
  model: string | null
  vin?: string | null
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
  gate_pass_issued?: boolean
  gate_pass_number?: string | null
  variant?: string | null
}

export interface CustomerSessionResult {
  session_token: string
  expires_at?: string
  phone: string
  vehicles: CustomerVehicle[]
}

function mapVehicle(raw: Record<string, unknown>, index: number): CustomerVehicle {
  const km = raw.km_reading
  return {
    id: (raw.id as string | number) ?? index + 1,
    source: raw.source as string | undefined,
    reg_number: String(raw.reg_number || ''),
    reg_key: raw.reg_key as string | undefined,
    model: (raw.model as string | null) ?? null,
    vin: (raw.vin as string | null) ?? null,
    owner_name: (raw.owner_name as string | null) ?? null,
    owner_phone: (raw.owner_phone as string | null) ?? null,
    service_type: (raw.service_type as string | null) ?? null,
    sa_name: (raw.sa_name as string | null) ?? null,
    sa_display_name: (raw.sa_display_name as string | null) ?? null,
    jc_number: (raw.jc_number as string | null) ?? null,
    branch: (raw.branch as string | null) ?? null,
    created_at: String(raw.created_at || new Date().toISOString()),
    invoice_done_at: (raw.invoice_done_at as string | null) ?? null,
    km_reading: km == null || km === '' ? null : Number(km),
    remark: (raw.remark as string | null) ?? null,
    estimate_storage_path: (raw.estimate_storage_path as string | null) ?? null,
    estimate_drive_url: (raw.estimate_drive_url as string | null) ?? null,
    invoice_storage_path: (raw.invoice_storage_path as string | null) ?? null,
    invoice_drive_url: (raw.invoice_drive_url as string | null) ?? null,
    billed_amount: raw.billed_amount != null && raw.billed_amount !== ''
      ? Number(raw.billed_amount)
      : (raw.expected_invoice_amount != null && raw.expected_invoice_amount !== '' ? Number(raw.expected_invoice_amount) : null),
    amount_received: raw.amount_received == null || raw.amount_received === '' ? null : Number(raw.amount_received),
    payment_status: (raw.payment_status as string | null) ?? null,
    gate_pass_issued: Boolean(raw.gate_pass_issued),
    gate_pass_number: (raw.gate_pass_number as string | null) ?? null,
    variant: (raw.variant as string | null) ?? null,
  }
}

function rpcErrorMessage(error: { message?: string } | null, fallback: string): string {
  const raw = error?.message || ''
  if (raw.includes('Invalid mobile number')) return 'Invalid mobile number.'
  if (raw.includes('No vehicle found')) return 'No vehicle found for this mobile number.'
  if (raw.includes('Session expired')) return 'Session expired.'
  if (raw.includes('Vehicle not found')) return 'Vehicle not found for this session.'
  if (raw.includes('forbidden')) return 'Not allowed.'
  return fallback
}

export function filterToLatestVehicleOnly(list: CustomerVehicle[]): CustomerVehicle[] {
  if (!list || list.length <= 1) return list || []
  const sorted = [...list].sort((a, b) => {
    // 1. Active in-service vehicle comes first (invoice_done_at is null)
    const activeA = !a.invoice_done_at ? 1 : 0
    const activeB = !b.invoice_done_at ? 1 : 0
    if (activeA !== activeB) return activeB - activeA

    // 2. Latest check-in or invoice date
    const dateA = new Date(a.invoice_done_at || a.created_at || 0).getTime()
    const dateB = new Date(b.invoice_done_at || b.created_at || 0).getTime()
    return dateB - dateA
  })
  return sorted.slice(0, 1)
}

export async function customerStartSession(
  username: string,
  password: string
): Promise<{ success: boolean; data?: CustomerSessionResult; error?: string }> {
  const { data, error } = await supabase.rpc('customer_start_session', {
    p_username: username,
    p_password: password,
  })

  if (error || !data) {
    return { success: false, error: rpcErrorMessage(error, 'Invalid mobile number.') }
  }

  const payload = data as CustomerSessionResult
  const rawVehicles = Array.isArray(payload.vehicles)
    ? payload.vehicles.map((v, i) => mapVehicle(v as unknown as Record<string, unknown>, i))
    : []
  const vehicles = filterToLatestVehicleOnly(rawVehicles)

  if (!payload.session_token || vehicles.length === 0) {
    return { success: false, error: 'No vehicle found for this mobile number.' }
  }

  return {
    success: true,
    data: {
      session_token: payload.session_token,
      expires_at: payload.expires_at,
      phone: payload.phone,
      vehicles,
    },
  }
}

export async function customerEndSession(sessionToken: string | null | undefined): Promise<void> {
  if (!sessionToken) return
  await supabase.rpc('customer_end_session', { p_session_token: sessionToken })
}

export async function customerListMyVehicles(sessionToken: string): Promise<CustomerVehicle[]> {
  const { data, error } = await supabase.rpc('customer_list_my_vehicles', {
    p_session_token: sessionToken,
  })
  if (error || !data) return []
  const mapped = (data as Record<string, unknown>[]).map((v, i) => mapVehicle(v, i))
  return filterToLatestVehicleOnly(mapped)
}
