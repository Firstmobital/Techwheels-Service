import { supabase } from './supabase'

export interface CustomerVehicle {
  id: number
  reg_number: string
  model: string | null
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
}

export interface BodyshopRepairCard {
  id: number
  job_card_no: string
  reg_number: string
  customer_name: string | null
  customer_phone: string | null
  status: string
  current_stage: string
  insurance_company: string | null
  claim_number: string | null
  estimate_amount: number | null
  approved_amount: number | null
  surveyor_name: string | null
  branch: string | null
  created_at: string
  updated_at: string
  photos?: string[]
}

export interface ServiceBookingPayload {
  reg_number: string
  customer_name: string
  mobile_number: string
  service_type: string
  preferred_date: string
  pickup_required: boolean
  address?: string
  remarks?: string
  damage_photos?: File[]
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

// 1. Fetch customer vehicle & active service by VRN or Phone
export async function fetchCustomerVehicles(searchQuery: string): Promise<CustomerVehicle[]> {
  const query = searchQuery.trim().toUpperCase()
  if (!query) return []

  const { data, error } = await supabase
    .from('service_reception_entries')
    .select('*')
    .or(`reg_number.ilike.%${query}%,owner_phone.ilike.%${query}%,jc_number.ilike.%${query}%`)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) {
    console.error('Error fetching customer vehicles:', error)
    throw new Error(error.message)
  }

  return (data || []) as CustomerVehicle[]
}

// 2. Fetch Bodyshop Repair Card for vehicle
export async function fetchBodyshopRepair(regNumber: string): Promise<BodyshopRepairCard | null> {
  const reg = regNumber.trim().toUpperCase()
  if (!reg) return null

  const { data, error } = await supabase
    .from('bodyshop_repair_cards')
    .select('*')
    .ilike('reg_number', `%${reg}%`)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching bodyshop card:', error)
  }

  return data as BodyshopRepairCard | null
}

// 3. Submit Customer Feedback directly to post_feedback_bot_data table
export async function submitCustomerFeedback(payload: FeedbackPayload): Promise<void> {
  const botRow = {
    vehicle_registration_number: payload.reg_number.trim().toUpperCase(),
    customer_name: payload.customer_name || null,
    mobile_number: payload.mobile_number || null,
    rating: payload.rating,
    feedback_text: payload.feedback_text.trim(),
    service_type: payload.service_type || 'Bodyshop / Customer Service',
    service_advisor_name: payload.service_advisor_name || null,
    branch: payload.branch || null,
    mode: 'customer_mobile_pwa',
    primary_complaint_area: payload.primary_complaint_area || null,
    complaint_date_time: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('post_feedback_bot_data')
    .insert([botRow])

  if (error) {
    console.error('Error inserting into post_feedback_bot_data:', error)
    throw new Error(error.message)
  }
}

// 4. Create Service Booking / Repair Estimate Request
export async function createServiceBooking(booking: ServiceBookingPayload): Promise<{ success: boolean; message: string }> {
  const bookingRow = {
    vehicle_registration_number: booking.reg_number.trim().toUpperCase(),
    customer_name: booking.customer_name.trim(),
    mobile_number: booking.mobile_number.trim(),
    service_type: booking.service_type,
    feedback_text: `[Service Booking Request] Date: ${booking.preferred_date} | Pickup: ${booking.pickup_required ? 'Yes (' + (booking.address || '') + ')' : 'No'} | Note: ${booking.remarks || 'None'}`,
    mode: 'customer_booking_pwa',
    complaint_date_time: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('post_feedback_bot_data')
    .insert([bookingRow])

  if (error) {
    console.error('Error booking service:', error)
    throw new Error(error.message)
  }

  return { success: true, message: 'Booking request received! Our service team will contact you shortly.' }
}
