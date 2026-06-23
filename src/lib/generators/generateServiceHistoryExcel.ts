/**
 * generateServiceHistoryExcel
 * Queries all_service_data for records matching the given chassis_no or reg_number,
 * then builds a simple Excel (.xlsx) with the full service history.
 * Returns a Blob suitable for upload or download.
 */

import * as XLSX from 'xlsx'
import { supabase } from '../supabase'

export interface ServiceHistoryRow {
  chassis_no:                   string | null
  registration_no:              string | null
  cust_first_name:              string | null
  cust_last_name:               string | null
  cust_mobile_no:               string | null
  ppl:                          string | null
  pl:                           string | null
  vehicle_sale_date:            string | null
  last_service_date:            string | null
  scheduled_next_service_date:  string | null
  first_free_service_done_flag: string | null
  second_free_service_done_flag: string | null
  third_free_service_done_flag: string | null
  extended_warranty_policy_no:  string | null
  extended_warranty_product:    string | null
  extended_warranty_order_status: string | null
  vehicle_age_in_years:         number | null
}

export async function generateServiceHistoryExcel(
  chassisNo: string | null,
  regNo: string | null,
): Promise<{ blob: Blob; rowCount: number } | { error: string }> {
  if (!chassisNo && !regNo) {
    return { error: 'No chassis or registration number available' }
  }

  // Build OR query
  let query = supabase
    .from('all_service_data')
    .select(`
      chassis_no,
      registration_no,
      cust_first_name,
      cust_last_name,
      cust_mobile_no,
      ppl,
      pl,
      vehicle_sale_date,
      last_service_date,
      scheduled_next_service_date,
      first_free_service_done_flag,
      second_free_service_done_flag,
      third_free_service_done_flag,
      extended_warranty_policy_no,
      extended_warranty_product,
      extended_warranty_order_status,
      vehicle_age_in_years
    `)
    .order('vehicle_sale_date', { ascending: false })
    .limit(100)

  if (chassisNo && regNo) {
    query = query.or(`chassis_no.eq.${chassisNo},registration_no.eq.${regNo}`)
  } else if (chassisNo) {
    query = query.eq('chassis_no', chassisNo)
  } else {
    query = query.eq('registration_no', regNo!)
  }

  const { data, error } = await query

  if (error) return { error: error.message }

  const rows = (data ?? []) as ServiceHistoryRow[]

  // ── Build Excel worksheet ────────────────────────────────────────────────
  const headers = [
    'Chassis No.',
    'Registration No.',
    'Customer Name',
    'Mobile No.',
    'PPL',
    'PL (Model)',
    'Date of Sale',
    'Last Service Date',
    'Next Service Due',
    '1st Free Service',
    '2nd Free Service',
    '3rd Free Service',
    'EW Policy No.',
    'EW Product',
    'EW Status',
    'Vehicle Age (Yrs)',
  ]

  const sheetRows: (string | number | null)[][] = [headers]

  for (const r of rows) {
    const name = [r.cust_first_name, r.cust_last_name].filter(Boolean).join(' ') || '—'
    sheetRows.push([
      r.chassis_no ?? '—',
      r.registration_no ?? '—',
      name,
      r.cust_mobile_no ?? '—',
      r.ppl ?? '—',
      r.pl ?? '—',
      r.vehicle_sale_date ?? '—',
      r.last_service_date ?? '—',
      r.scheduled_next_service_date ?? '—',
      r.first_free_service_done_flag ?? '—',
      r.second_free_service_done_flag ?? '—',
      r.third_free_service_done_flag ?? '—',
      r.extended_warranty_policy_no ?? '—',
      r.extended_warranty_product ?? '—',
      r.extended_warranty_order_status ?? '—',
      r.vehicle_age_in_years ?? null,
    ])
  }

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(sheetRows)

  // Style header row (bold via column widths + auto width)
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }))

  XLSX.utils.book_append_sheet(wb, ws, 'Service History')

  const wbOut = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([wbOut], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  return { blob, rowCount: rows.length }
}
