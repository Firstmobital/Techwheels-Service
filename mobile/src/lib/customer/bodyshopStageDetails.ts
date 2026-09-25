import { formatInr } from '../../components/customer/customerUi'

export type BodyshopStageDetailRow = {
  label: string
  value: string
}

const DOC_LABELS: Record<string, string> = {
  doc_claim_form: 'Claim Form',
  doc_rc: 'RC',
  doc_insurance: 'Insurance Copy',
  doc_dl: 'Driving Licence',
  doc_aadhaar: 'Aadhaar Card',
  doc_pan: 'PAN Card',
  doc_kyc: 'KYC',
  doc_gst: 'GST',
  doc_company_pan: 'Company PAN',
  doc_bank_detail: 'Bank Detail',
  doc_tp_affidavit: 'T/P Affidavit',
  doc_estimate: 'Estimate Upload',
  doc_survey_approval: 'Survey Approval',
}

function asText(v: unknown): string {
  if (v == null) return ''
  const s = String(v).trim()
  return s
}

function fmtDate(v: unknown): string {
  const s = asText(v)
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })
}

function fmtBool(v: unknown, yes = 'Done', no = 'Pending'): string {
  if (v === true || v === 'true' || v === 1 || v === '1') return yes
  if (v === false || v === 'false' || v === 0 || v === '0') return no
  return ''
}

function fmtStatus(v: unknown): string {
  const s = asText(v)
  if (!s) return ''
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtMoney(v: unknown): string {
  if (v == null || v === '') return ''
  const n = Number(v)
  if (Number.isNaN(n)) return ''
  return formatInr(n) || ''
}

const INTAKE_DOC_KEYS = [
  'doc_claim_form',
  'doc_rc',
  'doc_insurance',
  'doc_dl',
  'doc_aadhaar',
  'doc_pan',
  'doc_kyc',
  'doc_gst',
  'doc_company_pan',
  'doc_bank_detail',
  'doc_tp_affidavit',
] as const

function docChecklist(card: Record<string, unknown> | null): string {
  if (!card) return ''
  const uploaded = Array.isArray(card.uploaded_documents)
    ? (card.uploaded_documents as { doc_key?: string; file_name?: string }[])
    : []
  const uploadedKeys = new Set(uploaded.map((d) => asText(d.doc_key)).filter(Boolean))

  const lines: string[] = []
  for (const key of INTAKE_DOC_KEYS) {
    const label = DOC_LABELS[key] || key
    const done = uploadedKeys.has(key) || card[key] === true
    lines.push(`${done ? '✓' : '○'} ${label}`)
  }

  for (const row of uploaded) {
    const k = asText(row.doc_key)
    if (!k || (DOC_LABELS[k] && INTAKE_DOC_KEYS.includes(k as (typeof INTAKE_DOC_KEYS)[number]))) continue
    if (k === 'doc_estimate' || k === 'doc_survey_approval') continue
    lines.push(`✓ ${DOC_LABELS[k] || k}${row.file_name ? `: ${row.file_name}` : ''}`)
  }

  return lines.join('\n')
}

function settlementField(card: Record<string, unknown> | null, key: string): unknown {
  const s = card?.settlement
  if (!s || typeof s !== 'object') return null
  return (s as Record<string, unknown>)[key]
}

export function getBodyshopStageDetailRows(
  stage: number,
  card: Record<string, unknown> | null,
  ctx: {
    jc?: string
    advisor?: string
    techBay?: string | null
    techName?: string | null
  }
): BodyshopStageDetailRow[] {
  const rows: BodyshopStageDetailRow[] = []
  const push = (label: string, value: unknown) => {
    const v = asText(value)
    if (v) rows.push({ label, value: v })
  }
  const pushFmt = (label: string, value: unknown, fmt: (v: unknown) => string) => {
    const v = fmt(value)
    if (v) rows.push({ label, value: v })
  }

  push('Service Advisor', ctx.advisor || card?.sa_name)
  push('Job Card No', ctx.jc || card?.job_card_no)

  switch (stage) {
    case 1:
      push('Registration No', card?.reg_number)
      push('Customer Name', card?.customer_name)
      push('Branch', card?.branch)
      pushFmt('Vehicle Received', card?.received_at, fmtDate)
      push('Workshop Status', fmtStatus(card?.overall_status))
      break
    case 2: {
      const count = Number(card?.intake_photo_count ?? 0)
      push('Receiving Photos', count > 0 ? `${count} photo(s) captured by workshop` : '')
      pushFmt('Last Updated', card?.updated_at, fmtDate)
      break
    }
    case 3:
      push('Job Card Number', card?.job_card_no || ctx.jc)
      push('Customer Type', fmtStatus(card?.customer_type))
      pushFmt('Job Card Opened', card?.created_at, fmtDate)
      break
    case 4:
      pushFmt('WhatsApp Group Created', card?.customer_group_wa_sent_at, fmtDate)
      push('Sent By (Workshop)', card?.customer_group_wa_sent_by)
      break
    case 5:
      push('Insurance Company', card?.insurance_company)
      push('Policy Number', card?.insurance_policy_no)
      push('Insurance Type', card?.insurance_type)
      push('Insurance Valid Upto', card?.insurance_valid_date)
      {
        const docs = docChecklist(card)
        if (docs) rows.push({ label: 'Documentation Checklist', value: docs })
      }
      break
    case 6:
      pushFmt('Estimate Amount', card?.estimated_amount, fmtMoney)
      push('Prepared By', card?.estimation_by)
      pushFmt('Estimate Prepared', card?.estimation_at, fmtDate)
      break
    case 7:
      pushFmt('Customer Approved', card?.customer_approved, fmtBool)
      push('Approved By (Workshop)', card?.estimation_approved_by)
      pushFmt('Approval Recorded', card?.updated_at, fmtDate)
      break
    case 8:
      push('Claim Intimation No', card?.claim_intimation_no)
      break
    case 9:
      push('Surveyor Name', card?.surveyor_name)
      push('Surveyor Contact', card?.surveyor_contact)
      push('Survey Status', fmtStatus(card?.survey_status))
      push('Survey Date', card?.survey_date)
      push('Survey Hold Reason', card?.survey_hold_reason)
      break
    case 10:
      push('Parts Entry Status', fmtStatus(card?.parts_entry_status))
      push('Approved Parts Summary', card?.approved_parts)
      break
    case 11:
      push('Bodyshop Floor', card?.bodyshop_floor)
      push('Denter', card?.denter_name)
      push('Painter', card?.painter_name)
      push('Technician', card?.technician_name || ctx.techName)
      push('Floor Status', fmtStatus(card?.floor_status))
      push('Floor Hold Reason', card?.floor_hold_reason)
      push('Workshop Bay', ctx.techBay)
      break
    case 12: {
      push('Additional Approval', card?.additional_approval)
      const uploaded = Array.isArray(card?.uploaded_documents)
        ? (card!.uploaded_documents as { doc_key?: string }[])
        : []
      const hasSurveyDoc =
        uploaded.some((d) => asText(d.doc_key) === 'doc_survey_approval') || card?.doc_survey_approval === true
      push('Survey Approval Document', hasSurveyDoc ? 'Uploaded by workshop' : '')
      break
    }
    case 13:
      push('QC Status', fmtStatus(card?.qc_status))
      push('QC Checked By', card?.qc_checked_by)
      pushFmt('QC Checked At', card?.qc_checked_at, fmtDate)
      push('QC Passed By', card?.qc_passed_by)
      pushFmt('QC Passed At', card?.qc_passed_at, fmtDate)
      push('QC Fail Reason', card?.qc_fail_reason)
      break
    case 14:
      push('Re-Inspection Status', fmtStatus(card?.reinspection_status))
      push('Re-Inspection Type', card?.reinspection_type)
      push('Re-Inspection By', card?.reinspection_by)
      pushFmt('Re-Inspection At', card?.reinspection_at, fmtDate)
      break
    case 15:
      pushFmt('Invoice / Billed Amount', card?.billed_amount ?? settlementField(card, 'invoice_amount'), fmtMoney)
      push('Invoice Number', settlementField(card, 'invoice_number'))
      push('Invoice Date', settlementField(card, 'invoice_date'))
      push('Parts Billing Status', fmtStatus(card?.parts_entry_status))
      break
    case 16:
      push('DO Status', fmtStatus(card?.do_status ?? settlementField(card, 'do_payment_status')))
      pushFmt('DO Amount', card?.do_amount ?? settlementField(card, 'do_amount'), fmtMoney)
      pushFmt('Insurance DO Remaining', settlementField(card, 'insurance_due_amount'), fmtMoney)
      break
    case 17:
      push('Delivery Status', fmtStatus(card?.delivery_status))
      push('Marked By', card?.delivery_marked_by)
      pushFmt('Ready / Delivered', card?.delivery_marked_at || card?.delivered_at, fmtDate)
      break
    case 18:
      push('Customer Payment Status', fmtStatus(card?.customer_payment_status))
      push('DO Payment Status', fmtStatus(card?.do_payment_status))
      pushFmt('Customer Difference Amount', card?.customer_diff_amount ?? settlementField(card, 'customer_diff_amount'), fmtMoney)
      pushFmt('Customer Remaining', settlementField(card, 'customer_remaining_amount'), fmtMoney)
      push('Overall Payment Status', fmtStatus(card?.payment_status))
      break
    default:
      break
  }

  if (rows.length === 0) {
    rows.push({
      label: 'Workshop update',
      value: 'Your Service Advisor has not posted details for this step yet.',
    })
  }

  return rows
}

function firstFormattedDate(card: Record<string, unknown> | null, keys: string[]): string {
  if (!card) return ''
  for (const key of keys) {
    const formatted = fmtDate(card[key])
    if (formatted) return formatted
  }
  return ''
}

/** Primary date/time shown on the journey timeline (matches modal detail fields). */
export function getBodyshopStageTimelineDate(
  stage: number,
  card: Record<string, unknown> | null
): string {
  if (!card) return ''

  switch (stage) {
    case 1:
      return firstFormattedDate(card, ['received_at'])
    case 2:
      return Number(card.intake_photo_count ?? 0) > 0 ? firstFormattedDate(card, ['updated_at']) : ''
    case 3:
      return firstFormattedDate(card, ['created_at'])
    case 4:
      return firstFormattedDate(card, ['customer_group_wa_sent_at'])
    case 5: {
      const hasDoc = INTAKE_DOC_KEYS.some((k) => card[k] === true)
      return hasDoc ? firstFormattedDate(card, ['updated_at']) : ''
    }
    case 6:
      return firstFormattedDate(card, ['estimation_at'])
    case 7:
      return card.customer_approved ? firstFormattedDate(card, ['updated_at']) : ''
    case 8:
      return asText(card.claim_intimation_no) ? firstFormattedDate(card, ['updated_at']) : ''
    case 9:
      return firstFormattedDate(card, ['survey_date', 'updated_at'])
    case 10:
      return asText(card.parts_entry_status) ? firstFormattedDate(card, ['updated_at']) : ''
    case 11:
      return asText(card.bodyshop_floor || card.denter_name || card.painter_name)
        ? firstFormattedDate(card, ['updated_at'])
        : ''
    case 12:
      return asText(card.additional_approval) ? firstFormattedDate(card, ['updated_at']) : ''
    case 13:
      return firstFormattedDate(card, ['qc_passed_at', 'qc_checked_at'])
    case 14:
      return firstFormattedDate(card, ['reinspection_at'])
    case 15:
      return firstFormattedDate(card, ['invoice_date']) || fmtDate(settlementField(card, 'invoice_date'))
    case 16:
      return asText(card.do_status) ? firstFormattedDate(card, ['updated_at']) : ''
    case 17:
      return firstFormattedDate(card, ['delivery_marked_at', 'delivered_at'])
    case 18:
      return asText(card.payment_status || card.customer_payment_status)
        ? firstFormattedDate(card, ['updated_at'])
        : ''
    default:
      return ''
  }
}
