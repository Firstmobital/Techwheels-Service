import { supabase } from '../supabase'
import { fail, ok, type ApiResult, type EstimateInsert, type EstimateRow } from './types'

export type AddEstimateRowInput = {
  jobCardId: string
  srNo: number
  panelName?: string
  partNumber?: string
  partDescription?: string
  defect?: string
  action?: string
  qty: number
  ndpValue: number
  cutWeldCharges: number
  paintCharges: number
  totalSpecialCharges: number
  jobCode?: string
  jobCodeDesc?: string
  noOff: number
  labourCharges: number
}

const ESTIMATE_SELECT = 'id, sr_no, panel_name, part_number, part_description, defect, action, qty, ndp_value, cut_weld_charges, paint_charges, total_special_charges, job_code, job_code_desc, no_off, labour_charges, row_total'

export async function listEstimateRows(jobCardId: string): Promise<ApiResult<EstimateRow[]>> {
  const { data, error } = await supabase
    .from('estimate_rows')
    .select(ESTIMATE_SELECT)
    .eq('job_card_id', jobCardId)
    .order('sr_no')

  if (error) return fail(error)
  return ok((data ?? []) as EstimateRow[])
}

export async function addEstimateRow(input: AddEstimateRowInput): Promise<ApiResult<EstimateRow>> {
  const payload: EstimateInsert = {
    job_card_id: input.jobCardId,
    sr_no: input.srNo,
    panel_name: input.panelName?.trim() || null,
    part_number: input.partNumber?.trim() || null,
    part_description: input.partDescription?.trim() || null,
    defect: input.defect?.trim() || null,
    action: input.action?.trim() || null,
    qty: input.qty,
    ndp_value: input.ndpValue,
    cut_weld_charges: input.cutWeldCharges,
    paint_charges: input.paintCharges,
    total_special_charges: input.totalSpecialCharges,
    job_code: input.jobCode?.trim() || null,
    job_code_desc: input.jobCodeDesc?.trim() || null,
    no_off: input.noOff,
    labour_charges: input.labourCharges,
  }

  const { data, error } = await supabase
    .from('estimate_rows')
    .insert(payload)
    .select(ESTIMATE_SELECT)
    .single<EstimateRow>()

  if (error) return fail(error)
  return ok(data)
}

export async function deleteEstimateRow(rowId: string): Promise<ApiResult<true>> {
  const { error } = await supabase.from('estimate_rows').delete().eq('id', rowId)
  if (error) return fail(error)
  return ok(true)
}
