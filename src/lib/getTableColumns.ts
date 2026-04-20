import { supabase } from './supabase'

const FALLBACK_COLUMNS: Record<string, string[]> = {
  job_card_closed_data: [
    // System columns
    'id',
    'branch',
    'created_at',
    'updated_at',
    // Text columns
    'job_card_number',
    'sr_type',
    'chassis_number',
    'parent_product_line',
    'product_line',
    'first_name',
    'last_name',
    'sr_assigned_to',
    'vehicle_registration_number',
    'account_phone_number',
    'employee_code',
    // Numeric columns
    'final_labour_amount',
    'final_spares_amount',
    'total_invoice_amount',
    // Datetime/date columns
    'created_date_time',
    'closed_date_time',
    'vehicle_sale_date',
  ],
  service_invoice_data: [
    'invoice_number',
    'invoice_date',
    'bill_to_first_name',
    'bill_to_last_name',
    'final_labour_invoice_amount',
    'final_spares_invoice_amount',
    'final_consolidated_invoice_amount',
    'order_number',
    'sr_number',
    'chassis_number',
    'vrn',
    'branch',
  ],
  service_vas_jc_data: [
    // System columns
    'id',
    'branch',
    'created_at',
    'updated_at',
    // Text columns
    'job_card_number',
    'vrn',
    'complaint_code',
    'job_code',
    'job_description',
    'job_status',
    'chassis_number',
    'model',
    'product_line',
    'billing_type',
    'sr_assigned_to',
    'rate_type',
    'sr_type',
    'performed_by',
    'sr_number',
    // Numeric columns
    'net_price',
    'job_value',
    'discount',
    'billing_hours',
    // Timestamp column
    'jc_closed_date_time',
  ],
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
