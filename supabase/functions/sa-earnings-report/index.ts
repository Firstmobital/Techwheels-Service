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
  fetchBankByCodeMap,
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
    earnings?: number
  }>
}

function buildSaEarningsTemplate(input: {
  reportDateLabel: string
  reportScopeLabel: string
  totalEmployees: number
  totalEarnings: number
  generatedAtLabel: string
  pvPercent?: number
  evPercent?: number
  rows?: Array<{ employeeName: string; earnings: number }>
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
            <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0;color:#334155;">Service Advisor</th>
            <th style="text-align:right;padding:8px;border-bottom:1px solid #e2e8f0;color:#334155;">Earnings</th>
          </tr>
        </thead>
        <tbody>
          ${detailRows.map((row) => `
            <tr>
              <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#0f172a;">${row.employeeName}</td>
              <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#0f172a;text-align:right;font-weight:600;">${formatCurrency(row.earnings)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `
    : '<p style="margin-top:16px;color:#64748b;">No SA earnings rows found for this date range.</p>'

  const rowsText = detailRows.length > 0
    ? detailRows.map((row) => `- ${row.employeeName}: ${formatCurrency(row.earnings)}`).join('\n')
    : 'No SA earnings rows found for this date range.'

  const subject = `SA Earnings Report - ${safeDate}`
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f2937;">
  <div style="max-width:640px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="background:#0f766e;color:#fff;padding:22px 24px;">
      <h1 style="margin:0;font-size:20px;">SA Earnings Report</h1>
      <p style="margin:6px 0 0;color:#ccfbf1;font-size:13px;">Techwheels Service</p>
    </div>
    <div style="padding:24px;">
      <p>Please find attached the SA-wise bank payout Excel for <strong>${safeDate}</strong>.</p>
      <p><strong>Employees:</strong> ${input.totalEmployees.toLocaleString('en-IN')}<br>
      <strong>Total Earnings:</strong> ${earningsLabel}<br>
      <strong>Scope:</strong> ${safeScope} (IST)<br>
      <strong>Rates:</strong> PV ${input.pvPercent ?? 3}% | EV ${input.evPercent ?? 3}%<br>
      <strong>Generated at:</strong> ${safeGeneratedAt}</p>
      ${rowsHtml}
    </div>
  </div>
</body>
</html>`.trim()

  const text = [
    'SA Earnings Report',
    `Report Date: ${safeDate}`,
    `Employees: ${input.totalEmployees.toLocaleString('en-IN')}`,
    `Total Earnings: ${earningsLabel}`,
    `Scope: ${safeScope} (IST)`,
    `Rates: PV ${input.pvPercent ?? 3}% | EV ${input.evPercent ?? 3}%`,
    `Generated at: ${safeGeneratedAt}`,
    '',
    'SA-wise earnings:',
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
      return json(headers, { error: 'rows[] is required for SA earnings email' }, 400)
    }

    const dateRange = parseReportDateRange(body)
    if ('error' in dateRange) return json(headers, { error: dateRange.error }, 400)

    const { supabase, supabaseUrl, serviceRoleKey } = createServiceClient()

    let pvSharePercent = 3
    let evSharePercent = 3
    const settingsRes = await supabase.from('sa_earnings_settings').select('key, value')
    if (!settingsRes.error && settingsRes.data) {
      for (const row of settingsRes.data as { key: string; value: string }[]) {
        const parsed = parseFloat(row.value)
        if (!Number.isFinite(parsed) || parsed <= 0) continue
        if (row.key === 'sa_share_percent') pvSharePercent = parsed
        if (row.key === 'ev_share_percent') evSharePercent = parsed
      }
    }

    const aggregatedRows = providedRows
      .map((row) => {
        const employeeCode = normalizeCode(row?.employeeCode)
        const employeeName = String(row?.employeeName ?? '').trim() || employeeCode || 'Unknown SA'
        const earnings = Number(row?.earnings ?? 0)
        return {
          employeeCode,
          employeeName,
          earnings: Number.isFinite(earnings) && earnings >= 0 ? earnings : 0,
        }
      })
      .filter((row) => row.earnings > 0)
      .sort((a, b) => b.earnings - a.earnings)

    if (aggregatedRows.length === 0) {
      return json(headers, { error: 'No positive earnings rows to send' }, 400)
    }

    const bankByCode = await fetchBankByCodeMap(supabase, aggregatedRows.map((row) => row.employeeCode))
    const bankSheet = buildBankPayoutSheet(aggregatedRows, bankByCode)
    const fileBytes = await buildWorkbookBytes([{ ...bankSheet, name: 'SA Earnings' }])

    const fileName = `sa_earnings_${dateRange.fileSuffix}.xlsx`
    const storagePath = `reports/sa-earnings/${dateRange.fileSuffix}/${fileName}`
    const recipients = parseRecipients(
      Deno.env.get('SA_EARNINGS_TEST_RECIPIENTS') ?? Deno.env.get('TECH_EARNINGS_TEST_RECIPIENTS'),
      DEFAULT_TEST_RECIPIENTS,
    )
    const totalEarnings = aggregatedRows.reduce((sum, row) => sum + row.earnings, 0)
    const scopeLabel = String(body.reportScopeLabel ?? '').trim() || dateRange.label

    const template = buildSaEarningsTemplate({
      reportDateLabel: dateRange.label,
      reportScopeLabel: scopeLabel,
      totalEmployees: aggregatedRows.length,
      totalEarnings,
      generatedAtLabel: new Date().toLocaleString('en-IN', { timeZone: IST_ZONE }),
      pvPercent: pvSharePercent,
      evPercent: evSharePercent,
      rows: aggregatedRows.map((row) => ({ employeeName: row.employeeName, earnings: row.earnings })),
    })

    await uploadWorkbookAndSendEmail({
      supabaseUrl,
      serviceRoleKey,
      fileBytes,
      fileName,
      storagePath,
      recipients,
      template,
      purpose: 'sa-earnings-report',
    })

    return json(headers, {
      success: true,
      runMode: 'test',
      reportFromIst: dateRange.fromDate,
      reportToIst: dateRange.toDate,
      reportLabel: dateRange.label,
      recipients,
      rowCount: aggregatedRows.length,
      totalEarnings: Number(totalEarnings.toFixed(2)),
      attachment: { bucket: 'autodoc', storagePath, filename: fileName },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return json(headers, { error: message }, 500)
  }
})
