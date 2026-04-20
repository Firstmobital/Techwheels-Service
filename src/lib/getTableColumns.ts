import { supabase } from './supabase'

const FALLBACK_COLUMNS: Record<string, string[]> = {
  job_card_closed_data: [
    'job_card_number',
    'sr_type',
    'chassis_no',
    'final_labour_amount',
    'final_spares_amount',
    'total_invoice_amount',
    'parent_product_line',
    'product_line',
    'created_date_time',
    'closed_date_time',
    'first_name',
    'last_name',
    'sr_assigned_to',
    'vehicle_registration_number',
    'vehicle_sale_date',
    'account_phone_number',
    'branch',
  ],
  service_invoice_data: ['jc_number', 'service_record', 'branch'],
  service_vas_jc_data: ['jc_number', 'service_record', 'branch'],
  service_jc_parts_data: ['jc_number', 'service_record', 'branch'],
}

const DEFAULT_FALLBACK = ['jc_number', 'service_record', 'branch']

export async function getTableColumns(tableName: string): Promise<string[]> {
  const { data, error } = await supabase.from(tableName).select('*').limit(1)

  if (!error && data && data.length > 0) {
    return Object.keys(data[0])
  }

  return FALLBACK_COLUMNS[tableName] ?? DEFAULT_FALLBACK
}
