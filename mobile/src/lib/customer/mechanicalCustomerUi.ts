export type MechanicalCasePayload = {
  reception_entry_id?: number
  reg_number?: string
  model?: string | null
  service_type?: string | null
  jc_number?: string | null
  km_reading?: number | null
  sa_name?: string | null
  sa_display_name?: string | null
  branch?: string | null
  created_at?: string | null
  invoice_done_at?: string | null
  expected_invoice_amount?: number | null
  estimate_storage_path?: string | null
  estimate_drive_url?: string | null
  invoice_storage_path?: string | null
  invoice_drive_url?: string | null
  gate_pass_issued?: boolean
  gate_pass_number?: string | null
  floor?: {
    technician_name?: string | null
    technician_code?: string | null
    bay_no?: string | null
    work_status?: string | null
    assigned_at?: string | null
    out_ts?: string | null
  } | null
  invoice?: {
    invoice_number?: string | null
    invoice_date?: string | null
    billed_amount?: number | null
    amount_received?: number | null
    remaining_amount?: number | null
    payment_status?: string | null
  } | null
  payments?: Array<{
    id?: number
    amount?: number
    payment_mode?: string
    reference?: string | null
    payment_received_date?: string | null
    posted_at?: string | null
  }>
}

export type MechanicalStatusLabel =
  | 'Checked in'
  | 'On the floor'
  | 'On hold'
  | 'Work finished'
  | 'Bill being prepared'
  | 'Payment due'
  | 'Ready for collection'
  | 'In billing'

export function mechanicalStatusLabel(m: MechanicalCasePayload | null): MechanicalStatusLabel {
  if (!m) return 'Checked in'
  const jc = String(m.jc_number || '').trim()
  const ws = String(m.floor?.work_status || '').toLowerCase()
  const inv = m.invoice
  const billed = inv?.billed_amount != null ? Number(inv.billed_amount) : null
  const remaining = inv?.remaining_amount != null ? Number(inv.remaining_amount) : null
  const payStatus = String(inv?.payment_status || '').toLowerCase()

  if (m.gate_pass_issued) return 'Ready for collection'
  if (billed != null && billed > 0 && remaining != null && remaining > 0 && (payStatus === 'pending' || payStatus === 'partial')) {
    return 'Payment due'
  }
  if (m.invoice_done_at && billed == null) return 'Bill being prepared'
  if (ws === 'completed' && !m.invoice_done_at) return 'Work finished'
  if (ws === 'hold') return 'On hold'
  if (ws === 'work_inprocess') return 'On the floor'
  if (m.invoice_done_at && !m.gate_pass_issued) return 'In billing'
  if (!jc) return 'Checked in'
  return 'On the floor'
}

export function mechanicalPhaseComplete(
  phase: 1 | 2 | 3 | 4 | 5,
  m: MechanicalCasePayload | null
): boolean {
  if (!m) return false
  switch (phase) {
    case 1:
      return Boolean(m.created_at)
    case 2:
      return Boolean(String(m.jc_number || '').trim())
    case 3:
      return String(m.floor?.work_status || '').toLowerCase() === 'completed'
    case 4:
      return m.invoice?.billed_amount != null && Number(m.invoice.billed_amount) > 0
    case 5:
      return Boolean(m.gate_pass_issued)
    default:
      return false
  }
}
