import {
  DEFAULT_TEST_RECIPIENTS,
  normalizeCode,
  parseRecipients,
} from '../_shared/bankPayoutExcel.ts'
import {
  aggregateBankPayoutRows,
  buildBankPayoutSheet,
  buildHeaders,
  buildWorkbookBytes,
  createServiceClient,
  fetchBankForPayoutRows,
  formatCurrency,
  IST_ZONE,
  json,
  parseReportDateRange,
  uploadWorkbookAndSendEmail,
  type EmailTemplatePayload,
} from '../_shared/earningsReportCommon.ts'

type RequestBody = {
  runMode?: 'test'
  runDateIst?: string
  runFromIst?: string
  runToIst?: string
  reportScopeLabel?: string
  rows?: Array<{
    employeeCode?: string
    employeeName?: string
    role?: string
    earnings?: number
    jcCount?: number
  }>
}

function buildBodyshopEarningsTemplate(input: {
  reportDateLabel: string
  reportScopeLabel: string
  totalEmployees: number
  totalEarnings: number
  generatedAtLabel: string
  rows?: Array<{ role: string; employeeName: string; earnings: number }>
}): EmailTemplatePayload {
  const safeDate = String(input.reportDateLabel ?? '').trim() || 'Selected Range'
  const safeScope = String(input.reportScopeLabel ?? '').trim() || safeDate
  const safeGeneratedAt = String(input.generatedAtLabel ?? '').trim() || new Date().toLocaleString('en-IN')
  const earningsLabel = formatCurrency(input.totalEarnings)
  const detailRows = Array.isArray(input.rows) ? input.rows : []

  const rowsHtml = detailRows.length > 0
    ? `
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:13px;">
        <thead>
          <tr>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;">Role</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;">Employee</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;">Earnings</th>
          </tr>
        </thead>
        <tbody>
          ${detailRows.map((row) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #f1f5f9;">${row.role}</td>
              <td style="padding:8px;border-bottom:1px solid #f1f5f9;">${row.employeeName}</td>
              <td style="padding:8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;">${formatCurrency(row.earnings)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '<p style="margin-top:16px;color:#64748b;">No bodyshop earnings rows found for this date range.</p>'

  const rowsText = detailRows.length > 0
    ? detailRows.map((row) => `- ${row.role} / ${row.employeeName}: ${formatCurrency(row.earnings)}`).join('\n')
    : 'No bodyshop earnings rows found for this date range.'

  const subject = `Bodyshop Earnings Report - ${safeDate}`
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="background:#1d4ed8;color:#fff;padding:22px 24px;">
      <h1 style="margin:0;font-size:20px;">Bodyshop Earnings Report</h1>
      <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">Techwheels Service — All Roles</p>
    </div>
    <div style="padding:24px;">
      <p>Please find attached the bodyshop bank payout Excel for <strong>${safeDate}</strong>.</p>
      <p>The workbook contains a <strong>Bank Payout</strong> sheet (bank import format) and a <strong>Detail by Role</strong> audit sheet.</p>
      <p><strong>Employees (bank rows):</strong> ${input.totalEmployees.toLocaleString('en-IN')}<br>
      <strong>Total Earnings:</strong> ${earningsLabel}<br>
      <strong>Scope:</strong> ${safeScope} (IST)<br>
      <strong>Generated at:</strong> ${safeGeneratedAt}</p>
      ${rowsHtml}
    </div>
  </div>
</body>
</html>`.trim()

  const text = [
    'Bodyshop Earnings Report',
    `Report Date: ${safeDate}`,
    `Employees (bank rows): ${input.totalEmployees.toLocaleString('en-IN')}`,
    `Total Earnings: ${earningsLabel}`,
    `Scope: ${safeScope} (IST)`,
    `Generated at: ${safeGeneratedAt}`,
    '',
    'Role-wise earnings:',
    rowsText,
  ].join('\n')

  return { subject, html, text }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const headers = buildHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers })
  if (req.method !== 'POST') return json(headers, { error: 'Method not allowed' }, 405)

  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody
    const providedRows = Array.isArray(body.rows) ? body.rows : []
    if (providedRows.length === 0) {
      return json(headers, { error: 'rows[] is required for bodyshop earnings email' }, 400)
    }

    const dateRange = parseReportDateRange(body)
    if ('error' in dateRange) return json(headers, { error: dateRange.error }, 400)

    const { supabase, supabaseUrl, serviceRoleKey } = createServiceClient()

    const detailRows = providedRows
      .map((row) => {
        const employeeCode = normalizeCode(row?.employeeCode)
        const employeeName = String(row?.employeeName ?? '').trim() || employeeCode || 'Unknown'
        const role = String(row?.role ?? '').trim() || 'Unknown Role'
        const earnings = Number(row?.earnings ?? 0)
        const jcCount = Number(row?.jcCount ?? 0)
        return {
          employeeCode,
          employeeName,
          role,
          earnings: Number.isFinite(earnings) && earnings >= 0 ? earnings : 0,
          jcCount: Number.isFinite(jcCount) && jcCount >= 0 ? jcCount : 0,
        }
      })
      .filter((row) => row.earnings > 0)
      .sort((a, b) => b.earnings - a.earnings || a.role.localeCompare(b.role))

    if (detailRows.length === 0) {
      return json(headers, { error: 'No positive earnings rows to send' }, 400)
    }

    const bankRows = aggregateBankPayoutRows(detailRows)
    const bankByCode = await fetchBankForPayoutRows(supabase, bankRows)

    const detailSheetRows: Array<Array<string | number>> = [
      ['Role', 'Employee Code', 'Employee Name', 'JC Count', 'Earnings (₹)'],
      ...detailRows.map((row) => [
        row.role,
        row.employeeCode,
        row.employeeName,
        row.jcCount,
        Number(row.earnings.toFixed(2)),
      ]),
    ]

    const fileBytes = await buildWorkbookBytes([
      buildBankPayoutSheet(bankRows, bankByCode),
      { name: 'Detail by Role', rows: detailSheetRows },
    ])

    const fileName = `bodyshop_earnings_${dateRange.fileSuffix}.xlsx`
    const storagePath = `reports/bodyshop-earnings/${dateRange.fileSuffix}/${fileName}`
    const recipients = parseRecipients(
      Deno.env.get('BODYSHOP_EARNINGS_TEST_RECIPIENTS') ?? Deno.env.get('TECH_EARNINGS_TEST_RECIPIENTS'),
      DEFAULT_TEST_RECIPIENTS,
    )
    const totalEarnings = bankRows.reduce((sum, row) => sum + row.earnings, 0)
    const scopeLabel = String(body.reportScopeLabel ?? '').trim() || dateRange.label

    const template = buildBodyshopEarningsTemplate({
      reportDateLabel: dateRange.label,
      reportScopeLabel: scopeLabel,
      totalEmployees: bankRows.length,
      totalEarnings,
      generatedAtLabel: new Date().toLocaleString('en-IN', { timeZone: IST_ZONE }),
      rows: detailRows.map((row) => ({
        role: row.role,
        employeeName: row.employeeName,
        earnings: row.earnings,
      })),
    })

    await uploadWorkbookAndSendEmail({
      supabaseUrl,
      serviceRoleKey,
      fileBytes,
      fileName,
      storagePath,
      recipients,
      template,
      purpose: 'bodyshop-earnings-report',
    })

    return json(headers, {
      success: true,
      runMode: 'test',
      reportFromIst: dateRange.fromDate,
      reportToIst: dateRange.toDate,
      reportLabel: dateRange.label,
      recipients,
      rowCount: bankRows.length,
      detailRowCount: detailRows.length,
      totalEarnings: Number(totalEarnings.toFixed(2)),
      attachment: { bucket: 'autodoc', storagePath, filename: fileName },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json(headers, { error: message }, 500)
  }
})
