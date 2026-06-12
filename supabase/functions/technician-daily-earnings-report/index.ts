import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import { validateRequest } from '../_shared/auth.ts'
import { buildTechnicianDailyEarningsTemplate } from '../../../src/lib/emailTemplates/technicianDailyEarningsTemplate.ts'

type TechnicianAssignmentRow = {
  job_card_number: string | null
  technician_code: string | null
  technician_name: string | null
  bay_no: string | null
  work_status: string | null
  out_ts: string | null
  assigned_at: string | null
}

type RevenueRow = {
  job_card_number: string | null
  closed_date_time: string | null
  invoice_date: string | null
  final_labour_amount: number | string | null
}

type EmployeeBankRow = {
  employee_code: string | null
  bank_name: string | null
  account_number: string | null
  ifsc: string | null
}

type RequestBody = {
  runMode?: 'test' | 'scheduled'
  runDateIst?: string
}

const IST_ZONE = 'Asia/Kolkata'
const QUERY_PAGE_SIZE = 1000
const DEFAULT_PV_SHARE_PERCENT = 20 // fallback if DB setting missing
const DEFAULT_EV_SHARE_PERCENT = 25 // fallback if DB setting missing
const AUTODOC_BUCKET = 'autodoc'
const TEST_RECIPIENTS = [
  'shruti@indiraswitch.com',
  'ritesh@indiraswitch.com',
  'vinodexodus@gmail.com',
]

function parseRecipients(value: string | null | undefined, fallback: string[]): string[] {
  const parsed = String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  return parsed.length > 0 ? parsed : fallback
}

function hasValidBearerAuth(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? ''
  return auth.startsWith('Bearer ')
}

function buildHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

function json(headers: HeadersInit, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

function normalizeStatus(status: string | null | undefined): string {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (!normalized) return 'work_inprocess'
  if (normalized === 'work inprocess') return 'work_inprocess'
  return normalized
}

function extractFuelFromBay(bayNo: string | null | undefined): 'PV' | 'EV' | null {
  const normalized = String(bayNo ?? '').trim().toUpperCase()
  if (normalized.startsWith('PV-')) return 'PV'
  if (normalized.startsWith('EV-')) return 'EV'
  return null
}

function parseRevenueAmount(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (value == null) return 0

  const raw = String(value).trim()
  if (!raw) return 0

  const isParenthesizedNegative = raw.startsWith('(') && raw.endsWith(')')
  const cleaned = raw
    .replace(/[₹,]/g, '')
    .replace(/\bRS\.?\b/gi, '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return 0
  return isParenthesizedNegative ? -parsed : parsed
}

function calculateTechnicianIncome(grossLabourAmount: number, bayNo: string | null | undefined, pvPct: number, evPct: number): number {
  if (!Number.isFinite(grossLabourAmount) || grossLabourAmount <= 0) return 0
  const fuel = extractFuelFromBay(bayNo)
  const sharePercent = fuel === 'EV' ? evPct : pvPct
  const netBeforeShare = grossLabourAmount / 1.18
  return netBeforeShare * (sharePercent / 100)
}

function getIstDateKey(value: string | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getYesterdayIstDateKey(now = new Date()): string {
  const todayIst = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  const todayIstDate = new Date(`${todayIst}T00:00:00+05:30`)
  todayIstDate.setDate(todayIstDate.getDate() - 1)

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(todayIstDate)
}

function isValidDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function getIncomeDateKey(assignment: TechnicianAssignmentRow, revenue: RevenueRow): string | null {
  const source =
    revenue.closed_date_time ??
    revenue.invoice_date ??
    assignment.out_ts ??
    assignment.assigned_at

  return getIstDateKey(source)
}

function normalizeCode(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

function isSbiBank(bank: EmployeeBankRow | undefined): boolean {
  const bankName = String(bank?.bank_name ?? '').trim().toUpperCase()
  const ifsc = String(bank?.ifsc ?? '').trim().toUpperCase()
  return bankName.includes('STATE BANK OF INDIA') || bankName === 'SBI' || ifsc.startsWith('SBIN')
}

function chunk<T>(input: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < input.length; i += size) {
    out.push(input.slice(i, i + size))
  }
  return out
}

function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const headers = buildHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  if (req.method !== 'POST') {
    return json(headers, { error: 'Method not allowed' }, 405)
  }

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody
    const runMode = body.runMode === 'scheduled' ? 'scheduled' : 'test'

    const expectedCronSecret = Deno.env.get('TECH_EARNINGS_CRON_SECRET') ?? ''
    const providedCronSecret = req.headers.get('x-tech-earnings-cron-secret') ?? ''
    const isCronAuthorized = runMode === 'scheduled' && Boolean(expectedCronSecret) && providedCronSecret === expectedCronSecret

    if (!isCronAuthorized) {
      await validateRequest(req)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(headers, { error: 'Missing Supabase environment variables' }, 500)
    }

    const requestedDate = String(body.runDateIst ?? '').trim()
    const targetDateKey = requestedDate || getYesterdayIstDateKey()

    if (!isValidDateKey(targetDateKey)) {
      return json(headers, { error: 'runDateIst must be YYYY-MM-DD' }, 400)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── Load earnings percentages from DB ─────────────────────────────────────
    let pvSharePercent = DEFAULT_PV_SHARE_PERCENT
    let evSharePercent = DEFAULT_EV_SHARE_PERCENT
    const settingsRes = await supabase
      .from('technician_earnings_settings')
      .select('key, value')
    if (!settingsRes.error && settingsRes.data) {
      for (const row of settingsRes.data as { key: string; value: string }[]) {
        const parsed = parseFloat(row.value)
        if (!Number.isFinite(parsed) || parsed <= 0) continue
        if (row.key === 'pv_share_percent') pvSharePercent = parsed
        if (row.key === 'ev_share_percent') evSharePercent = parsed
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const assignmentRows: TechnicianAssignmentRow[] = []
    let from = 0

    while (true) {
      const assignRes = await supabase
        .from('technician_assignments')
        .select('job_card_number, technician_code, technician_name, bay_no, work_status, out_ts, assigned_at')
        .order('assigned_at', { ascending: false })
        .range(from, from + QUERY_PAGE_SIZE - 1)

      if (assignRes.error) {
        return json(headers, { error: assignRes.error.message }, 500)
      }

      const batch = (assignRes.data ?? []) as TechnicianAssignmentRow[]
      assignmentRows.push(...batch)
      if (batch.length < QUERY_PAGE_SIZE) break
      from += QUERY_PAGE_SIZE
    }

    const completedMap = new Map<string, TechnicianAssignmentRow>()
    assignmentRows
      .filter((row) => normalizeStatus(row.work_status) === 'completed')
      .forEach((row) => {
        const jc = normalizeCode(row.job_card_number)
        if (!jc) return

        const existing = completedMap.get(jc)
        if (!existing) {
          completedMap.set(jc, row)
          return
        }

        const existingTs = new Date(existing.out_ts ?? existing.assigned_at ?? 0).getTime()
        const candidateTs = new Date(row.out_ts ?? row.assigned_at ?? 0).getTime()
        if (candidateTs > existingTs) {
          completedMap.set(jc, row)
        }
      })

    const completedAssignments = Array.from(completedMap.values())
    const completedJcNumbers = Array.from(
      new Set(
        completedAssignments
          .map((row) => normalizeCode(row.job_card_number))
          .filter(Boolean),
      ),
    )

    const revenueMap = new Map<string, RevenueRow>()
    for (const jcBatch of chunk(completedJcNumbers, 500)) {
      if (jcBatch.length === 0) continue
      const revenueRes = await supabase
        .from('job_card_closed_data')
        .select('job_card_number, closed_date_time, invoice_date, final_labour_amount')
        .in('job_card_number', jcBatch)

      if (revenueRes.error) {
        return json(headers, { error: revenueRes.error.message }, 500)
      }

      ;(revenueRes.data ?? []).forEach((row) => {
        const typed = row as RevenueRow
        const jc = normalizeCode(typed.job_card_number)
        if (!jc) return

        const existing = revenueMap.get(jc)
        if (!existing) {
          revenueMap.set(jc, typed)
          return
        }

        const existingTs = new Date(existing.closed_date_time ?? existing.invoice_date ?? 0).getTime()
        const candidateTs = new Date(typed.closed_date_time ?? typed.invoice_date ?? 0).getTime()
        if (candidateTs > existingTs) {
          revenueMap.set(jc, typed)
        }
      })
    }

    const grossByJc = new Map<string, number>()
    completedAssignments.forEach((assignment) => {
      const jc = normalizeCode(assignment.job_card_number)
      if (!jc) return

      const revenue = revenueMap.get(jc)
      if (!revenue) return

      const gross = parseRevenueAmount(revenue.final_labour_amount)
      if (!Number.isFinite(gross) || gross <= 0) return
      grossByJc.set(jc, gross)
    })

    type Aggregated = {
      technicianCode: string
      technicianName: string
      earnings: number
    }

    const aggregatedMap = new Map<string, Aggregated>()

    assignmentRows.forEach((assignment) => {
      const assignmentDateKey = getIstDateKey(assignment.out_ts ?? assignment.assigned_at)
      if (assignmentDateKey !== targetDateKey) return

      const code = normalizeCode(assignment.technician_code)
      if (!code) return
      const name = String(assignment.technician_name ?? '').trim() || code

      const jc = normalizeCode(assignment.job_card_number)
      const gross = jc ? grossByJc.get(jc) ?? 0 : 0
      const technicianIncome = calculateTechnicianIncome(gross, assignment.bay_no, pvSharePercent, evSharePercent)

      const existing = aggregatedMap.get(code) ?? {
        technicianCode: code,
        technicianName: name,
        earnings: 0,
      }

      existing.earnings += Number.isFinite(technicianIncome) ? technicianIncome : 0
      aggregatedMap.set(code, existing)
    })

    const aggregatedRows = Array.from(aggregatedMap.values()).sort((a, b) => b.earnings - a.earnings)
    const technicianCodes = aggregatedRows.map((row) => row.technicianCode)

    const bankByCode = new Map<string, EmployeeBankRow>()
    for (const codeBatch of chunk(technicianCodes, 500)) {
      if (codeBatch.length === 0) continue
      const bankRes = await supabase
        .from('employee_master')
        .select('employee_code, bank_name, account_number, ifsc')
        .in('employee_code', codeBatch)

      if (bankRes.error) {
        return json(headers, { error: bankRes.error.message }, 500)
      }

      ;(bankRes.data ?? []).forEach((row) => {
        const typed = row as EmployeeBankRow
        const code = normalizeCode(typed.employee_code)
        if (!code) return
        bankByCode.set(code, typed)
      })
    }

    // Build worksheet rows matching sample format (13 columns A-M)
    // No header row in generated file.
    // A: static 300971 for all rows
    // B, C, D: static values as per sample
    // E: Technician Name, F: Account Number, G: IFSC, H: Earnings
    // I: Sequential counter (234+), J, K, L, M: static values as per sample
    const worksheetRows: Array<Array<string | number>> = []
    let sequenceCounter = 1

    aggregatedRows.forEach((row) => {
      const bank = bankByCode.get(row.technicianCode)
      const paymentMode = isSbiBank(bank) ? 'DCR' : 'NEFT'
      worksheetRows.push([
        '300971', // A: static
        'FIRST MOBITAL PRIVATE LIMITED', // B: static
        '39171760445', // C: static
        paymentMode, // D: DCR for SBI, NEFT for others
        row.technicianName, // E: Technician Name
        String(bank?.account_number ?? '').trim(), // F: Account Number
        String(bank?.ifsc ?? '').trim().toUpperCase(), // G: IFSC
        Number(row.earnings.toFixed(2)), // H: Earnings Amount
        `SALARY${sequenceCounter++}`, // I: Sequential counter (SALARY1, SALARY2, ...)
        'INR', // J: static
        'JAIPUR', // K: static
        'SHRUTI@INDIRASWITCH.COM', // L: static
        'E', // M: static
      ])
    })

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Technician Earnings')
    const workbookBytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const fileBytes = new Uint8Array(workbookBytes)

    const fileName = `technician_earnings_${targetDateKey}.xlsx`
    const storagePath = `reports/technician-earnings/${targetDateKey}/${fileName}`

    const uploadRes = await fetch(
      `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/${AUTODOC_BUCKET}/${encodeStoragePath(storagePath)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          'x-upsert': 'true',
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: fileBytes,
      },
    )

    if (!uploadRes.ok) {
      const details = await uploadRes.text()
      return json(headers, { error: `Failed to upload report attachment: ${details}` }, 500)
    }

    const recipients = runMode === 'scheduled'
      ? parseRecipients(Deno.env.get('TECH_EARNINGS_SCHEDULED_RECIPIENTS'), TEST_RECIPIENTS)
      : parseRecipients(Deno.env.get('TECH_EARNINGS_TEST_RECIPIENTS'), TEST_RECIPIENTS)

    const internalDispatchSecret = Deno.env.get('INTERNAL_EMAIL_DISPATCH_SECRET') ?? ''
    const totalEarnings = aggregatedRows.reduce((sum, row) => sum + row.earnings, 0)
    const template = buildTechnicianDailyEarningsTemplate({
      reportDateLabel: targetDateKey,
      totalTechnicians: aggregatedRows.length,
      totalEarnings,
      generatedAtLabel: new Date().toLocaleString('en-IN', { timeZone: IST_ZONE }),
      dealershipName: 'Techwheels Service',
    })

    const emailHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (runMode === 'scheduled') {
      if (!internalDispatchSecret) {
        return json(headers, { error: 'Missing INTERNAL_EMAIL_DISPATCH_SECRET for scheduled mode' }, 500)
      }
      emailHeaders['x-internal-email-secret'] = internalDispatchSecret
    } else {
      if (!hasValidBearerAuth(req)) {
        return json(headers, { error: 'Missing Authorization header' }, 401)
      }
      emailHeaders.Authorization = req.headers.get('Authorization') ?? ''
    }

    const emailRes = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/send-transactional-email`, {
      method: 'POST',
      headers: emailHeaders,
      body: JSON.stringify({
        to: recipients,
        subject: template.subject,
        html: template.html,
        text: template.text,
        purpose: 'report',
        attachments: [
          {
            filename: fileName,
            storagePath,
            bucket: AUTODOC_BUCKET,
          },
        ],
      }),
    })

    if (!emailRes.ok) {
      const details = await emailRes.text()
      return json(headers, { error: `Failed to send email: ${details}` }, 502)
    }

    return json(headers, {
      success: true,
      runMode,
      reportDateIst: targetDateKey,
      recipients,
      rowCount: aggregatedRows.length,
      totalEarnings: Number(totalEarnings.toFixed(2)),
      attachment: {
        bucket: AUTODOC_BUCKET,
        storagePath,
        filename: fileName,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json(headers, { error: message }, 401)
  }
})
