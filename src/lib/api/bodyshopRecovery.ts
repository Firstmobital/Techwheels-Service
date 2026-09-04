import { supabase } from '../supabase'
import { settlementRpcError } from './bodyshopSettlement'

export interface DoRecoveryRow {
  repair_card_id: number
  job_card_no: string
  reg_number: string | null
  customer_name: string | null
  branch: string | null
  sa_name: string | null
  insurance_company: string | null
  overall_status: string | null
  current_stage: number | null
  invoice_number: string | null
  invoice_date: string | null
  invoice_amount: number | null
  invoice_account: string | null
  do_amount: number | null
  do_released_amount: number | null
  insurance_due_amount: number
  do_payment_status: string | null
  needs_accounts_review: boolean
}

export async function listBodyshopDoRecovery(): Promise<DoRecoveryRow[]> {
  const { data, error } = await supabase.rpc('list_bodyshop_do_recovery')
  if (error) throw new Error(settlementRpcError(error))
  return Array.isArray(data) ? (data as DoRecoveryRow[]) : []
}
