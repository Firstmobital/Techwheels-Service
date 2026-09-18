import * as XLSX from 'xlsx'
import { postCustomerAmount, postDoRelease } from './api/bodyshopSettlement'
import { supabase } from './supabase'

export const PAYMENT_TEMPLATE_VISIBLE_HEADERS = [
  'Job Card No.',
  'Vehicle No.',
  'Invoice No.',
  'Main Received',
  'GST Received',
  'TDS Received',
  'CP Received',
  'Main Amount',
  'GST Amount',
  'TDS Amount',
  'Customer Payment (CP)',
  'Reference / Remark',
] as const

export const HIDDEN_REPAIR_CARD_ID_HEADER = '_repair_card_id'
export const HIDDEN_IMPORT_ROW_TOKEN_HEADER = '_import_row_token'

export type PaymentImportStatus = 'valid' | 'rejected' | 'already_imported'

export type PaymentImportAmounts = {
  main: number | null
  gst: number | null
  tds: number | null
  cp: number | null
}

export type PaymentImportLiveCase = {
  repairCardId: number
  jobCardNo: string
  regNumber: string | null
  invoiceNumber: string | null
  doAmount: number | null
  customerSettlementKind: string | null
  customerRemainingAmount: number | null
}

export type PaymentImportPreviewRow = {
  rowNumber: number
  repairCardId: number | null
  importRowToken: string | null
  jobCardNo: string
  vehicleNo: string
  invoiceNo: string
  amounts: PaymentImportAmounts
  remaining: PaymentImportAmounts
  reference: string | null
  status: PaymentImportStatus
  message: string
}

export type PaymentImportPreview = {
  totalRows: number
  valid: number
  rejected: number
  alreadyImported: number
  totalMain: number
  totalGst: number
  totalTds: number
  totalCp: number
  rows: PaymentImportPreviewRow[]
}

export type PaymentImportCommitStatus = 'posted' | 'already_imported' | 'failed'

export type PaymentImportCommitRow = {
  rowNumber: number
  jobCardNo: string
  status: PaymentImportCommitStatus
  message: string
}

export type PaymentImportCommitResult = {
  posted: number
  alreadyImported: number
  failed: number
  rows: PaymentImportCommitRow[]
}

export function newImportRowToken(): string {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `brp-${id}`
}

export function normalizeMatchText(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

export function identitiesMatch(
  exported: { jobCardNo: string; vehicleNo: string; invoiceNo: string },
  live: Pick<PaymentImportLiveCase, 'jobCardNo' | 'regNumber' | 'invoiceNumber'>,
): boolean {
  return (
    normalizeMatchText(exported.jobCardNo) === normalizeMatchText(live.jobCardNo)
    && normalizeMatchText(exported.vehicleNo) === normalizeMatchText(live.regNumber)
    && normalizeMatchText(exported.invoiceNo) === normalizeMatchText(live.invoiceNumber)
  )
}

export function parsePaymentAmount(raw: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null }
  const text = String(raw).trim()
  if (!text) return { ok: true, value: null }
  const n = Number(text.replace(/,/g, ''))
  if (!Number.isFinite(n)) return { ok: false, error: 'Amount must be numeric' }
  if (n < 0) return { ok: false, error: 'Amount cannot be negative' }
  const rounded = Math.round(n * 100) / 100
  if (rounded === 0) return { ok: true, value: null }
  return { ok: true, value: rounded }
}

export function remainingAmounts(
  requested: PaymentImportAmounts,
  postedComponents: Set<string>,
): PaymentImportAmounts {
  return {
    main: postedComponents.has('MAIN') ? null : requested.main,
    gst: postedComponents.has('GST') ? null : requested.gst,
    tds: postedComponents.has('TDS') ? null : requested.tds,
    cp: postedComponents.has('CUSTOMER') || postedComponents.has('CUSTOMER_REFUND') ? null : requested.cp,
  }
}

export function hasPositiveAmount(amounts: PaymentImportAmounts): boolean {
  return (amounts.main ?? 0) + (amounts.gst ?? 0) + (amounts.tds ?? 0) + (amounts.cp ?? 0) > 0
}

/** Cumulative posted amounts for template reference columns. Null (nothing posted) exports as 0. */
export function receivedReferenceCell(value: number | null | undefined): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100) / 100
}

function parseNewPaymentAmounts(row: Record<string, string>): {
  main: ReturnType<typeof parsePaymentAmount>
  gst: ReturnType<typeof parsePaymentAmount>
  tds: ReturnType<typeof parsePaymentAmount>
  cp: ReturnType<typeof parsePaymentAmount>
} {
  // Official new-payment headers only. Received columns (main_received / gst_received /
  // tds_received / cp_received) are reference data and must never be posted.
  return {
    main: parsePaymentAmount(row.main_amount),
    gst: parsePaymentAmount(row.gst_amount),
    tds: parsePaymentAmount(row.tds_amount),
    cp: parsePaymentAmount(row.customer_payment_cp),
  }
}

export function newPaymentPreviewMessage(remaining: PaymentImportAmounts, retry: boolean): string {
  const parts: string[] = []
  if (remaining.main != null) parts.push(`Main ${remaining.main}`)
  if (remaining.gst != null) parts.push(`GST ${remaining.gst}`)
  if (remaining.tds != null) parts.push(`TDS ${remaining.tds}`)
  if (remaining.cp != null) parts.push(`CP ${remaining.cp}`)
  const prefix = retry ? 'Remaining new payment' : 'New payment'
  return `${prefix}: ${parts.join(' · ') || 'none'}`
}

function headerKey(value: string): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    if (row[key] != null && String(row[key]).trim() !== '') return String(row[key]).trim()
  }
  return ''
}

export function readPaymentWorkbookRows(file: File): Promise<Array<Record<string, string>>> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = new Uint8Array(reader.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: false, raw: false })
        const sheet = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
        resolve(
          json.map((row) => {
            const out: Record<string, string> = {}
            for (const [key, val] of Object.entries(row)) {
              out[headerKey(key)] = String(val ?? '').trim()
            }
            return out
          }),
        )
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

export function buildPaymentTemplateWorkbook(rows: Array<{
  jobCardNo: string
  vehicleNo: string | null
  invoiceNo: string | null
  repairCardId: number
  mainReceived?: number | null
  gstReceived?: number | null
  tdsReceived?: number | null
  cpReceived?: number | null
}>) {
  const bookRows = rows.map((r) => ({
    'Job Card No.': r.jobCardNo,
    'Vehicle No.': r.vehicleNo ?? '',
    'Invoice No.': r.invoiceNo ?? '',
    'Main Received': receivedReferenceCell(r.mainReceived),
    'GST Received': receivedReferenceCell(r.gstReceived),
    'TDS Received': receivedReferenceCell(r.tdsReceived),
    'CP Received': receivedReferenceCell(r.cpReceived),
    'Main Amount': '',
    'GST Amount': '',
    'TDS Amount': '',
    'Customer Payment (CP)': '',
    'Reference / Remark': '',
    [HIDDEN_REPAIR_CARD_ID_HEADER]: r.repairCardId,
    [HIDDEN_IMPORT_ROW_TOKEN_HEADER]: newImportRowToken(),
  }))
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(bookRows, {
    header: [...PAYMENT_TEMPLATE_VISIBLE_HEADERS, HIDDEN_REPAIR_CARD_ID_HEADER, HIDDEN_IMPORT_ROW_TOKEN_HEADER],
  })
  ws['!cols'] = [
    { wch: 24 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 22 },
    { wch: 22 },
    { hidden: true, wch: 14 },
    { hidden: true, wch: 40 },
  ]
  XLSX.utils.book_append_sheet(wb, ws, 'Payments')
  return wb
}

export function previewPaymentImport(
  rows: Array<Record<string, string>>,
  liveById: Map<number, PaymentImportLiveCase>,
  postedByToken: Map<string, Set<string>>,
): PaymentImportPreview {
  const previewRows: PaymentImportPreviewRow[] = []
  let valid = 0
  let rejected = 0
  let alreadyImported = 0
  let totalMain = 0
  let totalGst = 0
  let totalTds = 0
  let totalCp = 0

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2
    const jobCardNo = pick(row, 'job_card_no', 'jc')
    const vehicleNo = pick(row, 'vehicle_no', 'vrn', 'reg_number')
    const invoiceNo = pick(row, 'invoice_no', 'invoice_number')
    const token = pick(row, 'import_row_token')
    const idRaw = pick(row, 'repair_card_id')
    const referenceRaw = pick(row, 'reference_remark', 'reference', 'remark')
    const reference = referenceRaw || null
    const { main: mainParsed, gst: gstParsed, tds: tdsParsed, cp: cpParsed } = parseNewPaymentAmounts(row)

    const base = {
      rowNumber,
      jobCardNo,
      vehicleNo,
      invoiceNo,
      importRowToken: token || null,
      amounts: { main: null, gst: null, tds: null, cp: null } as PaymentImportAmounts,
      remaining: { main: null, gst: null, tds: null, cp: null } as PaymentImportAmounts,
      reference,
    }

    const reject = (message: string, repairCardId: number | null = null) => {
      rejected += 1
      previewRows.push({ ...base, repairCardId, status: 'rejected', message })
    }

    if (!mainParsed.ok) return reject(mainParsed.error)
    if (!gstParsed.ok) return reject(gstParsed.error)
    if (!tdsParsed.ok) return reject(tdsParsed.error)
    if (!cpParsed.ok) return reject(cpParsed.error)

    const amounts: PaymentImportAmounts = {
      main: mainParsed.value,
      gst: gstParsed.value,
      tds: tdsParsed.value,
      cp: cpParsed.value,
    }
    base.amounts = amounts

    if (!hasPositiveAmount(amounts)) {
      return reject('Enter Main, GST, TDS, or Customer Payment (CP)')
    }
    if (!idRaw) return reject('Missing technical repair card id; export a new payment template')
    const repairCardId = Number(idRaw)
    if (!Number.isInteger(repairCardId) || repairCardId <= 0) {
      return reject('Invalid technical repair card id')
    }
    if (!token) return reject('Missing import row token; export a new payment template')

    const live = liveById.get(repairCardId)
    if (!live) return reject('Recovery case was not found for this repair card', repairCardId)
    if (!identitiesMatch({ jobCardNo, vehicleNo, invoiceNo }, live)) {
      return reject('Job Card / Vehicle / Invoice do not match this repair card', repairCardId)
    }

    const posted = postedByToken.get(token) ?? new Set<string>()
    const remaining = remainingAmounts(amounts, posted)
    base.remaining = remaining

    if (!hasPositiveAmount(remaining)) {
      alreadyImported += 1
      previewRows.push({
        ...base,
        repairCardId,
        remaining,
        status: 'already_imported',
        message: 'Already imported',
      })
      return
    }

    if ((remaining.main ?? 0) + (remaining.gst ?? 0) + (remaining.tds ?? 0) > 0 && live.doAmount == null) {
      return reject('DO amount must be captured before posting DO payment', repairCardId)
    }
    if (remaining.cp != null) {
      const kind = String(live.customerSettlementKind ?? '')
      if (kind !== 'due' && kind !== 'refund') {
        return reject('no customer due or refund to post against', repairCardId)
      }
      const remainingCp = Number(live.customerRemainingAmount ?? 0)
      if (remaining.cp > Math.round(remainingCp * 100) / 100) {
        return reject(
          kind === 'refund'
            ? 'customer refund cannot exceed remaining refund'
            : 'customer receipt cannot exceed remaining recoverable',
          repairCardId,
        )
      }
    }

    valid += 1
    totalMain += remaining.main ?? 0
    totalGst += remaining.gst ?? 0
    totalTds += remaining.tds ?? 0
    totalCp += remaining.cp ?? 0
    previewRows.push({
      ...base,
      repairCardId,
      remaining,
      status: 'valid',
      message: newPaymentPreviewMessage(remaining, posted.size > 0),
    })
  })

  return {
    totalRows: rows.length,
    valid,
    rejected,
    alreadyImported,
    totalMain: Math.round(totalMain * 100) / 100,
    totalGst: Math.round(totalGst * 100) / 100,
    totalTds: Math.round(totalTds * 100) / 100,
    totalCp: Math.round(totalCp * 100) / 100,
    rows: previewRows,
  }
}

export async function loadPaymentImportContext(repairCardIds: number[], tokens: string[]): Promise<{
  liveById: Map<number, PaymentImportLiveCase>
  postedByToken: Map<string, Set<string>>
}> {
  const liveById = new Map<number, PaymentImportLiveCase>()
  const postedByToken = new Map<string, Set<string>>()
  const ids = [...new Set(repairCardIds.filter((id) => Number.isInteger(id) && id > 0))]
  const tokenList = [...new Set(tokens.filter(Boolean))]
  if (ids.length === 0) return { liveById, postedByToken }

  const [settleRes, cardRes, lineRes] = await Promise.all([
    supabase
      .from('bodyshop_settlements')
      .select('repair_card_id, job_card_no, invoice_number, do_amount, customer_settlement_kind, customer_remaining_amount')
      .in('repair_card_id', ids),
    supabase
      .from('bodyshop_repair_cards')
      .select('id, job_card_no, reg_number')
      .in('id', ids),
    tokenList.length === 0
      ? Promise.resolve({ data: [] as { import_row_token: string | null; component: string; is_reversed: boolean; line_type: string }[], error: null })
      : supabase
          .from('bodyshop_settlement_lines')
          .select('import_row_token, component, is_reversed, line_type')
          .in('import_row_token', tokenList)
          .eq('is_reversed', false),
  ])
  if (settleRes.error) throw new Error(settleRes.error.message)
  if (cardRes.error) throw new Error(cardRes.error.message)
  if (lineRes.error) throw new Error(lineRes.error.message)

  const cardById = new Map<number, { job_card_no: string; reg_number: string | null }>()
  for (const c of (cardRes.data ?? []) as { id: number; job_card_no: string; reg_number: string | null }[]) {
    cardById.set(c.id, c)
  }
  for (const s of (settleRes.data ?? []) as {
    repair_card_id: number
    job_card_no: string
    invoice_number: string | null
    do_amount: number | null
    customer_settlement_kind: string | null
    customer_remaining_amount: number | null
  }[]) {
    const card = cardById.get(s.repair_card_id)
    liveById.set(s.repair_card_id, {
      repairCardId: s.repair_card_id,
      jobCardNo: card?.job_card_no ?? s.job_card_no,
      regNumber: card?.reg_number ?? null,
      invoiceNumber: s.invoice_number,
      doAmount: s.do_amount,
      customerSettlementKind: s.customer_settlement_kind,
      customerRemainingAmount: s.customer_remaining_amount,
    })
  }

  for (const line of (lineRes.data ?? []) as {
    import_row_token: string | null
    component: string
    is_reversed: boolean
    line_type: string
  }[]) {
    if (!line.import_row_token || line.is_reversed || line.line_type === 'reversal') continue
    const set = postedByToken.get(line.import_row_token) ?? new Set<string>()
    set.add(line.component)
    postedByToken.set(line.import_row_token, set)
  }

  return { liveById, postedByToken }
}

export async function commitPaymentImportRow(
  row: PaymentImportPreviewRow,
): Promise<PaymentImportCommitRow> {
  const jobCardNo = row.jobCardNo
  if (row.status === 'already_imported') {
    return { rowNumber: row.rowNumber, jobCardNo, status: 'already_imported', message: 'Already imported' }
  }
  if (row.status !== 'valid' || row.repairCardId == null || !row.importRowToken) {
    return { rowNumber: row.rowNumber, jobCardNo, status: 'failed', message: row.message || 'Row is not valid' }
  }

  const remaining = row.remaining
  const note = row.reference
  const hasDo = (remaining.main ?? 0) + (remaining.gst ?? 0) + (remaining.tds ?? 0) > 0
  const hasCp = (remaining.cp ?? 0) > 0
  const posted: string[] = []
  const already: string[] = []

  const isDuplicateImport = (e: unknown) =>
    /duplicate key|uq_bodyshop_settlement_lines_import_row_token/i.test(
      e instanceof Error ? e.message : String(e ?? ''),
    )

  try {
    if (hasDo) {
      try {
        await postDoRelease({
          repairCardId: row.repairCardId,
          mainAmount: remaining.main,
          gstAmount: remaining.gst,
          tdsAmount: remaining.tds,
          reference: note,
          remarks: note,
          importRowToken: row.importRowToken,
        })
        posted.push('DO')
      } catch (e: unknown) {
        if (!isDuplicateImport(e)) throw e
        already.push('DO')
      }
    }
    if (hasCp && remaining.cp != null) {
      try {
        await postCustomerAmount({
          repairCardId: row.repairCardId,
          amount: remaining.cp,
          reference: note,
          remarks: note,
          importRowToken: row.importRowToken,
        })
        posted.push('CP')
      } catch (e: unknown) {
        if (!isDuplicateImport(e)) {
          if (posted.length > 0 || already.length > 0) {
            return {
              rowNumber: row.rowNumber,
              jobCardNo,
              status: 'failed',
              message: `${[...already.map((p) => `${p} already imported`), ...posted.map((p) => `${p} posted`)].join('; ')}; CP failed: ${e instanceof Error ? e.message : 'Post failed'}`,
            }
          }
          throw e
        }
        already.push('CP')
      }
    }
    if (posted.length > 0) {
      return {
        rowNumber: row.rowNumber,
        jobCardNo,
        status: 'posted',
        message: [
          ...already.map((p) => `${p} already imported`),
          ...posted.map((p) => `${p} posted`),
        ].join('; '),
      }
    }
    if (already.length > 0) {
      return { rowNumber: row.rowNumber, jobCardNo, status: 'already_imported', message: 'Already imported' }
    }
    return { rowNumber: row.rowNumber, jobCardNo, status: 'posted', message: 'Posted' }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Post failed'
    if (isDuplicateImport(e) && posted.length === 0) {
      return { rowNumber: row.rowNumber, jobCardNo, status: 'already_imported', message: 'Already imported' }
    }
    if (posted.length > 0 || already.length > 0) {
      return {
        rowNumber: row.rowNumber,
        jobCardNo,
        status: 'failed',
        message: `${[...already.map((p) => `${p} already imported`), ...posted.map((p) => `${p} posted`)].join('; ')}; remaining failed: ${msg}`,
      }
    }
    return { rowNumber: row.rowNumber, jobCardNo, status: 'failed', message: msg }
  }
}
