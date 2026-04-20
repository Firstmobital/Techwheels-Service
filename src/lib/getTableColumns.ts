import { supabase } from './supabase'

const FALLBACK_COLUMNS: Record<string, string[]> = {
  job_card_closed_data: ['jc_number', 'service_record', 'branch'],
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
