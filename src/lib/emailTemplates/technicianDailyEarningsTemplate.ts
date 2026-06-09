export interface TechnicianDailyEarningsTemplateInput {
  reportDateLabel: string
  totalTechnicians: number
  totalEarnings: number
  generatedAtLabel: string
  dealershipName?: string | null
}

export interface EmailTemplatePayload {
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

export function buildTechnicianDailyEarningsTemplate(
  input: TechnicianDailyEarningsTemplateInput,
): EmailTemplatePayload {
  const dealer = String(input.dealershipName ?? '').trim() || 'Techwheels Service'
  const safeDate = String(input.reportDateLabel ?? '').trim() || 'Yesterday'
  const safeGeneratedAt = String(input.generatedAtLabel ?? '').trim() || new Date().toLocaleString('en-IN')
  const safeTechnicianCount = Number.isFinite(input.totalTechnicians) ? Math.max(0, input.totalTechnicians) : 0
  const earningsLabel = formatCurrency(input.totalEarnings)

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
        Scope: Yesterday only (IST)
      </div>
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
    'Scope: Yesterday only (IST)',
    '',
    'Please find attached the technician-wise earnings Excel report.',
  ].join('\n')

  return { subject, html, text }
}
