import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'
import { validateRequest } from '../_shared/auth.ts'
import {
  buildBankPayoutWorksheetRows,
  chunk,
  DEFAULT_TEST_RECIPIENTS,
  encodeStoragePath,
  normalizeCode,
  parseRecipients,
  type EmployeeBankRow,
} from '../_shared/bankPayoutExcel.ts'
// ── Inlined email template (was: emailTemplates/technicianDailyEarningsTemplate.ts) ──
interface TechnicianDailyEarningsTemplateInput {
  reportDateLabel: string
  reportScopeLabel: string
  totalTechnicians: number
  totalEarnings: number
  generatedAtLabel: string
  dealershipName?: string | null
  pvPercent?: number
  evPercent?: number
  rows?: Array<{ technicianName: string; earnings: number }>
}

interface EmailTemplatePayload {
  subject: string
  html: string
  text: string
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0)
}

function buildTechnicianDailyEarningsTemplate(
  input: TechnicianDailyEarningsTemplateInput,
): EmailTemplatePayload {
  const dealer = String(input.dealershipName ?? '').trim() || 'Techwheels Service'
  const safeDate = String(input.reportDateLabel ?? '').trim() || 'Selected Range'
  const safeScope = String(input.reportScopeLabel ?? '').trim() || safeDate
  const safeGeneratedAt = String(input.generatedAtLabel ?? '').trim() || new Date().toLocaleString('en-IN')
  const safeTechnicianCount = Number.isFinite(input.totalTechnicians) ? Math.max(0, input.totalTechnicians) : 0
  const earningsLabel = formatCurrency(input.totalEarnings)
  const detailRows = Array.isArray(input.rows) ? input.rows : []

  const rowsHtml = detailRows.length > 0
    ? `
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;color:#334155;">Technician</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;color:#334155;">Earnings</th>
          </tr>
        </thead>
        <tbody>
          ${detailRows.map((row) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#0f172a;">${row.technicianName}</td>
              <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#0f172a;text-align:right;font-weight:600;">${formatCurrency(row.earnings)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '<p style="margin-top:16px;color:#64748b;">No technician earnings rows found for this date range.</p>'

  const rowsText = detailRows.length > 0
    ? detailRows.map((row) => `- ${row.technicianName}: ${formatCurrency(row.earnings)}`).join('\n')
    : 'No technician earnings rows found for this date range.'

  const subject = `Technician Earnings Report - ${safeDate}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 0; background: #f3f4f6; }
    .container { max-width: 640px; margin: 24px auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
    .header { background: #0f172a; color: #ffffff; padding: 22px 24px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; color: #cbd5e1; font-size: 13px; }
    .content { padding: 24px; }
    .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; }
    .kpi-label { color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .kpi-value { color: #0f172a; font-size: 24px; font-weight: 700; margin-top: 4px; }
    .meta { margin-top: 18px; font-size: 13px; color: #475569; }
    .footer { background: #f8fafc; border-top: 1px solid #e5e7eb; padding: 14px 24px; color: #64748b; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Technician Earnings Report</h1>
      <p>${dealer}</p>
    </div>
    <div class="content">
      <p>Please find attached the technician-wise earnings Excel report for <strong>${safeDate}</strong>.</p>

      <div class="kpi">
        <div class="kpi-label">Technicians in Report</div>
        <div class="kpi-value">${safeTechnicianCount.toLocaleString('en-IN')}</div>
      </div>

      <div class="kpi">
        <div class="kpi-label">Total Earnings</div>
        <div class="kpi-value">${earningsLabel}</div>
      </div>

      <div class="meta">
        Generated at: ${safeGeneratedAt}<br>
        Scope: ${safeScope} (IST)<br>Rates applied: PV ${input.pvPercent ?? 20}% | EV ${input.evPercent ?? 25}%
      </div>

      ${rowsHtml}
    </div>
    <div class="footer">
      This is an automated operational report email from Techwheels Service.
    </div>
  </div>
</body>
</html>
  `.trim()

  const text = [
    'Technician Earnings Report',
    dealer,
    '',
    `Report Date: ${safeDate}`,
    `Technicians in Report: ${safeTechnicianCount.toLocaleString('en-IN')}`,
    `Total Earnings: ${earningsLabel}`,
    `Generated at: ${safeGeneratedAt}`,
    `Scope: ${safeScope} (IST)`,
    `Rates applied: PV ${input.pvPercent ?? 20}% | EV ${input.evPercent ?? 25}%`,
    '',
    'Please find attached the technician-wise earnings Excel report.',
    '',
    'Technician-wise earnings:',
    rowsText,
  ].join('\n')

  return { subject, html, text }
}

// ─────────────────────────────────────────────────────────────────────────────

type TechnicianAssignmentRow = {
  id?: number | null
  job_card_number: string | null
  technician_code: string | null
  technician_name: string | null
  bay_no: string | null
  work_status: string | null
  out_ts: string | null
  assigned_at: string | null
}

type SupportAssignmentRow = {
  job_card_number: string | null
  support_role: string | null
  employee_code: string | null
  employee_name: string | null
  assigned_at: string | null
  is_active: boolean | null
}

type RevenueRow = {
  job_card_number: string | null
  closed_date_time: string | null
  invoice_date: string | null
  dms_final_labour_amount: number | string | null
}

type RequestBody = {
  runMode?: 'test' | 'scheduled'
  runDateIst?: string
  runFromIst?: string
  runToIst?: string
  reportScopeLabel?: string
  rows?: Array<{
    technicianCode?: string
    technicianName?: string
    earnings?: number
  }>
}

const IST_ZONE = 'Asia/Kolkata'
const QUERY_PAGE_SIZE = 1000
const DEFAULT_PV_SHARE_PERCENT = 20 // fallback if DB setting missing
const DEFAULT_EV_SHARE_PERCENT = 25 // fallback if DB setting missing
const AUTODOC_BUCKET = 'autodoc'

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

function normalizeSupportRole(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

function isTechnicianSupportRole(value: string | null | undefined): boolean {
  return normalizeSupportRole(value) === 'TECHNICIAN'
}

function buildSupportTechnicianMap(rows: SupportAssignmentRow[]): Map<string, SupportAssignmentRow[]> {
  const supportByJc = new Map<string, SupportAssignmentRow[]>()

  rows.forEach((row) => {
    if (row.is_active === false) return
    if (!isTechnicianSupportRole(row.support_role)) return

    const jc = normalizeCode(row.job_card_number)
    if (!jc) return

    const code = normalizeCode(row.employee_code)
    if (!code) return

    const existing = supportByJc.get(jc) ?? []
    const duplicate = existing.some((item) => normalizeCode(item.employee_code) === code)
    if (!duplicate) {
      existing.push(row)
      supportByJc.set(jc, existing)
    }
  })

  return supportByJc
}

function buildSplitCountByJobCard(
  primaryAssignments: TechnicianAssignmentRow[],
  supportByJc: Map<string, SupportAssignmentRow[]>,
): Map<string, number> {
  const splitByJc = new Map<string, number>()

  primaryAssignments.forEach((row) => {
    const jc = normalizeCode(row.job_card_number)
    if (!jc) return

    const participants = new Set<string>()
    const primaryCode = normalizeCode(row.technician_code)
    if (primaryCode) participants.add(primaryCode)

    const supportRows = supportByJc.get(jc) ?? []
    supportRows.forEach((supportRow) => {
      const supportCode = normalizeCode(supportRow.employee_code)
      if (supportCode) participants.add(supportCode)
    })

    splitByJc.set(jc, Math.max(1, participants.size))
  })

  return splitByJc
}

function expandAssignmentsWithSupportTechnicians(
  primaryAssignments: TechnicianAssignmentRow[],
  supportByJc: Map<string, SupportAssignmentRow[]>,
): TechnicianAssignmentRow[] {
  const expanded: TechnicianAssignmentRow[] = []
  let syntheticId = -1

  primaryAssignments.forEach((row) => {
    expanded.push(row)

    const jc = normalizeCode(row.job_card_number)
    if (!jc) return

    const supportRows = supportByJc.get(jc) ?? []
    if (supportRows.length === 0) return

    const seenCodes = new Set<string>()
    const primaryCode = normalizeCode(row.technician_code)
    if (primaryCode) seenCodes.add(primaryCode)

    supportRows.forEach((supportRow) => {
      const supportCode = normalizeCode(supportRow.employee_code)
      if (!supportCode || seenCodes.has(supportCode)) return
      seenCodes.add(supportCode)

      expanded.push({
        ...row,
        id: syntheticId,
        technician_code: supportCode,
        technician_name: String(supportRow.employee_name ?? '').trim() || supportCode,
        assigned_at: supportRow.assigned_at ?? row.assigned_at,
      })
      syntheticId -= 1
    })
  })

  return expanded
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

function buildReportLabel(fromDate: string, toDate: string): string {
  return fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`
}

function getIncomeDateKey(assignment: TechnicianAssignmentRow, revenue: RevenueRow): string | null {
  const source =
    revenue.closed_date_time ??
    revenue.invoice_date ??
    assignment.out_ts ??
    assignment.assigned_at

  return getIstDateKey(source)
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

    // Skip auth for test mode (allows curl testing with service role key)
    if (!isCronAuthorized && runMode !== 'test') {
      await validateRequest(req)
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(headers, { error: 'Missing Supabase environment variables' }, 500)
    }

    const requestedDate = String(body.runDateIst ?? '').trim()
    const requestedFrom = String(body.runFromIst ?? '').trim()
    const requestedTo = String(body.runToIst ?? '').trim()

    let targetFromDateKey = getYesterdayIstDateKey()
    let targetToDateKey = targetFromDateKey

    if (requestedFrom || requestedTo) {
      if (!requestedFrom || !requestedTo) {
        return json(headers, { error: 'runFromIst and runToIst must both be provided' }, 400)
      }
      if (!isValidDateKey(requestedFrom) || !isValidDateKey(requestedTo)) {
        return json(headers, { error: 'runFromIst and runToIst must be YYYY-MM-DD' }, 400)
      }
      if (requestedFrom > requestedTo) {
        return json(headers, { error: 'runFromIst cannot be after runToIst' }, 400)
      }
      targetFromDateKey = requestedFrom
      targetToDateKey = requestedTo
    } else if (requestedDate) {
      if (!isValidDateKey(requestedDate)) {
        return json(headers, { error: 'runDateIst must be YYYY-MM-DD' }, 400)
      }
      targetFromDateKey = requestedDate
      targetToDateKey = requestedDate
    }

    const reportLabel = buildReportLabel(targetFromDateKey, targetToDateKey)
    const reportFileSuffix = targetFromDateKey === targetToDateKey
      ? targetFromDateKey
      : `${targetFromDateKey}_to_${targetToDateKey}`

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

    const assignmentJcNumbers = Array.from(
      new Set(
        assignmentRows
          .map((row) => normalizeCode(row.job_card_number))
          .filter(Boolean),
      ),
    )

    const supportRows: SupportAssignmentRow[] = []
    for (const jcBatch of chunk(assignmentJcNumbers, 500)) {
      if (jcBatch.length === 0) continue
      const supportRes = await supabase
        .from('job_card_support_assignments')
        .select('job_card_number, support_role, employee_code, employee_name, assigned_at, is_active')
        .in('job_card_number', jcBatch)
        .eq('is_active', true)

      if (supportRes.error) {
        return json(headers, { error: supportRes.error.message }, 500)
      }

      supportRows.push(...((supportRes.data ?? []) as SupportAssignmentRow[]))
    }

    const supportByJc = buildSupportTechnicianMap(supportRows)
    const splitCountByJc = buildSplitCountByJobCard(assignmentRows, supportByJc)
    const expandedAssignmentRows = expandAssignmentsWithSupportTechnicians(assignmentRows, supportByJc)

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
        .select('job_card_number, closed_date_time, invoice_date, dms_final_labour_amount')
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

      const gross = parseRevenueAmount(revenue.dms_final_labour_amount)
      if (!Number.isFinite(gross) || gross <= 0) return
      grossByJc.set(jc, gross)
    })

    type Aggregated = {
      technicianCode: string
      technicianName: string
      earnings: number
    }

    let aggregatedRows: Aggregated[] = []
    const providedRows = Array.isArray(body.rows) ? body.rows : []

    if (runMode === 'test' && providedRows.length > 0) {
      aggregatedRows = providedRows
        .map((row) => {
          const technicianCode = normalizeCode(row?.technicianCode)
          const technicianName = String(row?.technicianName ?? '').trim() || technicianCode || 'Unknown Technician'
          const earnings = Number(row?.earnings ?? 0)
          return {
            technicianCode,
            technicianName,
            earnings: Number.isFinite(earnings) && earnings >= 0 ? earnings : 0,
          }
        })
        .sort((a, b) => b.earnings - a.earnings)
    } else {
      const aggregatedMap = new Map<string, Aggregated>()

      expandedAssignmentRows.forEach((assignment) => {
        const assignmentDateKey = getIstDateKey(assignment.out_ts ?? assignment.assigned_at)
        if (!assignmentDateKey) return
        if (assignmentDateKey < targetFromDateKey || assignmentDateKey > targetToDateKey) return

        const code = normalizeCode(assignment.technician_code)
        if (!code) return
        const name = String(assignment.technician_name ?? '').trim() || code

        const jc = normalizeCode(assignment.job_card_number)
        const gross = jc ? grossByJc.get(jc) ?? 0 : 0
        const splitCount = jc ? splitCountByJc.get(jc) ?? 1 : 1
        const technicianIncome = calculateTechnicianIncome(gross, assignment.bay_no, pvSharePercent, evSharePercent) / splitCount

        const existing = aggregatedMap.get(code) ?? {
          technicianCode: code,
          technicianName: name,
          earnings: 0,
        }

        existing.earnings += Number.isFinite(technicianIncome) ? technicianIncome : 0
        aggregatedMap.set(code, existing)
      })

      aggregatedRows = Array.from(aggregatedMap.values()).sort((a, b) => b.earnings - a.earnings)
    }

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

    const worksheetRows = buildBankPayoutWorksheetRows(
      aggregatedRows.map((row) => ({
        employeeCode: row.technicianCode,
        employeeName: row.technicianName,
        earnings: row.earnings,
      })),
      bankByCode,
    )

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Technician Earnings')
    const workbookBytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const fileBytes = new Uint8Array(workbookBytes)

    const fileName = `technician_earnings_${reportFileSuffix}.xlsx`
    const storagePath = `reports/technician-earnings/${reportFileSuffix}/${fileName}`

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
      ? parseRecipients(Deno.env.get('TECH_EARNINGS_SCHEDULED_RECIPIENTS'), DEFAULT_TEST_RECIPIENTS)
      : parseRecipients(Deno.env.get('TECH_EARNINGS_TEST_RECIPIENTS'), DEFAULT_TEST_RECIPIENTS)

    const internalDispatchSecret = Deno.env.get('INTERNAL_EMAIL_DISPATCH_SECRET') ?? ''
    const totalEarnings = aggregatedRows.reduce((sum, row) => sum + row.earnings, 0)
    const requestedScope = String(body.reportScopeLabel ?? '').trim()
    const scopeLabel = requestedScope || reportLabel

    const template = buildTechnicianDailyEarningsTemplate({
      reportDateLabel: reportLabel,
      reportScopeLabel: scopeLabel,
      totalTechnicians: aggregatedRows.length,
      totalEarnings,
      generatedAtLabel: new Date().toLocaleString('en-IN', { timeZone: IST_ZONE }),
      dealershipName: 'Techwheels Service',
      pvPercent: pvSharePercent,
      evPercent: evSharePercent,
      rows: aggregatedRows.map((row) => ({
        technicianName: row.technicianName,
        earnings: row.earnings,
      })),
    })

    // Always use internal dispatch secret to call send-transactional-email
    // This avoids any user JWT forwarding issues
    if (!internalDispatchSecret) {
      return json(headers, { error: 'Missing INTERNAL_EMAIL_DISPATCH_SECRET env var' }, 500)
    }

    const emailHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-internal-email-secret': internalDispatchSecret,
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
      reportDateIst: targetFromDateKey,
      reportFromIst: targetFromDateKey,
      reportToIst: targetToDateKey,
      reportLabel,
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
