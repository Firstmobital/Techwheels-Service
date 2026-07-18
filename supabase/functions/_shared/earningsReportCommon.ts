import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import {
  buildBankPayoutWorksheetRows,
  chunk,
  encodeStoragePath,
  normalizeCode,
  type BankPayoutInputRow,
  type EmployeeBankRow,
} from './bankPayoutExcel.ts'

export const AUTODOC_BUCKET = 'autodoc'
export const IST_ZONE = 'Asia/Kolkata'

export function buildHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

export function json(headers: HeadersInit, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

export function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function buildReportLabel(fromDate: string, toDate: string): string {
  return fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`
}

export function buildReportFileSuffix(fromDate: string, toDate: string): string {
  return fromDate === toDate ? fromDate : `${fromDate}_to_${toDate}`
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

export type ParsedDateRange = {
  fromDate: string
  toDate: string
  label: string
  fileSuffix: string
}

export function parseReportDateRange(body: {
  runDateIst?: string
  runFromIst?: string
  runToIst?: string
}): ParsedDateRange | { error: string } {
  const requestedDate = String(body.runDateIst ?? '').trim()
  const requestedFrom = String(body.runFromIst ?? '').trim()
  const requestedTo = String(body.runToIst ?? '').trim()

  let fromDate = ''
  let toDate = ''

  if (requestedFrom || requestedTo) {
    if (!requestedFrom || !requestedTo) {
      return { error: 'runFromIst and runToIst must both be provided' }
    }
    if (!isValidDateKey(requestedFrom) || !isValidDateKey(requestedTo)) {
      return { error: 'runFromIst and runToIst must be YYYY-MM-DD' }
    }
    if (requestedFrom > requestedTo) {
      return { error: 'runFromIst cannot be after runToIst' }
    }
    fromDate = requestedFrom
    toDate = requestedTo
  } else if (requestedDate) {
    if (!isValidDateKey(requestedDate)) {
      return { error: 'runDateIst must be YYYY-MM-DD' }
    }
    fromDate = requestedDate
    toDate = requestedDate
  } else {
    return { error: 'runFromIst/runToIst or runDateIst is required' }
  }

  return {
    fromDate,
    toDate,
    label: buildReportLabel(fromDate, toDate),
    fileSuffix: buildReportFileSuffix(fromDate, toDate),
  }
}

function normalizeEmployeeName(value: string | null | undefined): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

async function loadEmployeeMasterBankIndex(
  supabase: SupabaseClient,
): Promise<{ byCode: Map<string, EmployeeBankRow>; byName: Map<string, EmployeeBankRow> }> {
  const byCode = new Map<string, EmployeeBankRow>()
  const byName = new Map<string, EmployeeBankRow>()
  let from = 0

  while (true) {
    const bankRes = await supabase
      .from('employee_master')
      .select('employee_code, employee_name, bank_name, account_number, ifsc')
      .not('employee_name', 'is', null)
      .order('employee_code', { ascending: true })
      .range(from, from + 999)

    if (bankRes.error) {
      throw new Error(bankRes.error.message)
    }

    const batch = (bankRes.data ?? []) as EmployeeBankRow[]
    batch.forEach((row) => {
      const code = normalizeCode(row.employee_code)
      if (code) byCode.set(code, row)
      const nameKey = normalizeEmployeeName(row.employee_name)
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, row)
    })

    if (batch.length < 1000) break
    from += 1000
  }

  return { byCode, byName }
}

/** Resolve bank rows keyed by payout row employeeCode (code first, then employee_name). */
export async function fetchBankForPayoutRows(
  supabase: SupabaseClient,
  rows: BankPayoutInputRow[],
): Promise<Map<string, EmployeeBankRow>> {
  const bankByRowCode = new Map<string, EmployeeBankRow>()
  if (rows.length === 0) return bankByRowCode

  const uniqueCodes = Array.from(new Set(rows.map((row) => normalizeCode(row.employeeCode)).filter(Boolean)))
  const bankByMasterCode = new Map<string, EmployeeBankRow>()

  for (const codeBatch of chunk(uniqueCodes, 500)) {
    if (codeBatch.length === 0) continue
    const bankRes = await supabase
      .from('employee_master')
      .select('employee_code, employee_name, bank_name, account_number, ifsc')
      .in('employee_code', codeBatch)

    if (bankRes.error) {
      throw new Error(bankRes.error.message)
    }

    ;(bankRes.data ?? []).forEach((row) => {
      const typed = row as EmployeeBankRow
      const code = normalizeCode(typed.employee_code)
      if (!code) return
      bankByMasterCode.set(code, typed)
    })
  }

  const unresolved: BankPayoutInputRow[] = []
  rows.forEach((row) => {
    const key = normalizeCode(row.employeeCode)
    if (!key) return
    const byCode = bankByMasterCode.get(key)
    if (byCode) {
      bankByRowCode.set(key, byCode)
      return
    }
    unresolved.push(row)
  })

  if (unresolved.length > 0) {
    const { byName } = await loadEmployeeMasterBankIndex(supabase)
    unresolved.forEach((row) => {
      const key = normalizeCode(row.employeeCode)
      if (!key || bankByRowCode.has(key)) return
      const byNameMatch = byName.get(normalizeEmployeeName(row.employeeName))
      if (byNameMatch) bankByRowCode.set(key, byNameMatch)
    })
  }

  return bankByRowCode
}

export async function fetchBankByCodeMap(
  supabase: SupabaseClient,
  employeeCodes: string[],
): Promise<Map<string, EmployeeBankRow>> {
  return fetchBankForPayoutRows(
    supabase,
    employeeCodes.map((employeeCode) => ({
      employeeCode,
      employeeName: employeeCode,
      earnings: 0,
    })),
  )
}

export type WorkbookSheet = {
  name: string
  rows: Array<Array<string | number>>
}

export async function buildWorkbookBytes(sheets: WorkbookSheet[]): Promise<Uint8Array> {
  const workbook = XLSX.utils.book_new()
  sheets.forEach((sheet) => {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows)
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  })
  const workbookBytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  return new Uint8Array(workbookBytes)
}

export type EmailTemplatePayload = {
  subject: string
  html: string
  text: string
}

export async function uploadWorkbookAndSendEmail(input: {
  supabaseUrl: string
  serviceRoleKey: string
  fileBytes: Uint8Array
  fileName: string
  storagePath: string
  recipients: string[]
  template: EmailTemplatePayload
  purpose?: string
}): Promise<void> {
  const internalDispatchSecret = Deno.env.get('INTERNAL_EMAIL_DISPATCH_SECRET') ?? ''
  if (!internalDispatchSecret) {
    throw new Error('Missing INTERNAL_EMAIL_DISPATCH_SECRET env var')
  }

  const uploadRes = await fetch(
    `${input.supabaseUrl.replace(/\/$/, '')}/storage/v1/object/${AUTODOC_BUCKET}/${encodeStoragePath(input.storagePath)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.serviceRoleKey}`,
        apikey: input.serviceRoleKey,
        'x-upsert': 'true',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      body: input.fileBytes,
    },
  )

  if (!uploadRes.ok) {
    const details = await uploadRes.text()
    throw new Error(`Failed to upload report attachment: ${details}`)
  }

  const emailRes = await fetch(`${input.supabaseUrl.replace(/\/$/, '')}/functions/v1/send-transactional-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-email-secret': internalDispatchSecret,
    },
    body: JSON.stringify({
      to: input.recipients,
      subject: input.template.subject,
      html: input.template.html,
      text: input.template.text,
      purpose: input.purpose ?? 'report',
      attachments: [
        {
          filename: input.fileName,
          storagePath: input.storagePath,
          bucket: AUTODOC_BUCKET,
        },
      ],
    }),
  })

  if (!emailRes.ok) {
    const details = await emailRes.text()
    throw new Error(`Failed to send email: ${details}`)
  }
}

export function buildBankPayoutSheet(
  rows: BankPayoutInputRow[],
  bankByCode: Map<string, EmployeeBankRow>,
): WorkbookSheet {
  return {
    name: 'Bank Payout',
    rows: buildBankPayoutWorksheetRows(rows, bankByCode),
  }
}

export function aggregateBankPayoutRows(
  rows: Array<{ employeeCode: string; employeeName: string; earnings: number }>,
): BankPayoutInputRow[] {
  const map = new Map<string, BankPayoutInputRow>()
  rows.forEach((row) => {
    const code = normalizeCode(row.employeeCode) || String(row.employeeName ?? '').trim().toUpperCase()
    if (!code) return
    const name = String(row.employeeName ?? '').trim() || code
    const earnings = Number(row.earnings ?? 0)
    const safeEarnings = Number.isFinite(earnings) && earnings >= 0 ? earnings : 0
    const existing = map.get(code) ?? { employeeCode: code, employeeName: name, earnings: 0 }
    existing.earnings += safeEarnings
    if (!existing.employeeName && name) existing.employeeName = name
    map.set(code, existing)
  })
  return Array.from(map.values()).sort((a, b) => b.earnings - a.earnings)
}

export function createServiceClient(): { supabase: SupabaseClient; supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables')
  }
  return {
    supabase: createClient(supabaseUrl, serviceRoleKey),
    supabaseUrl,
    serviceRoleKey,
  }
}
