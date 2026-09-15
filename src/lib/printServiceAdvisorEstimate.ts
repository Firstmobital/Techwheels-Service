import { cleanAdvisorPersonName } from './api/customer'
import type { ReceptionEntryRow } from './api/reception'
import type { ServiceAdvisorEstimateLine } from './api/serviceAdvisorEstimates'

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(value: number): string {
  return `₹${(Number(value) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function openServiceAdvisorEstimatePrint(input: {
  row: ReceptionEntryRow
  model: string
  fuel: string
  make: string
  serviceType: string
  items: ServiceAdvisorEstimateLine[]
  partsTotal: number
  labourTotal: number
  grandTotal: number
}): void {
  const printed = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  })
  const jc = String(input.row.jc_number ?? '').trim() || '—'
  const sa =
    cleanAdvisorPersonName(input.row.sa_display_name) ||
    cleanAdvisorPersonName(input.row.sa_name) ||
    '—'
  const branch = String(input.row.branch_label || input.row.branch || input.row.location || '').trim() || '—'
  const km = input.row.km_reading == null ? '—' : `${input.row.km_reading.toLocaleString('en-IN')} KM`
  const estimateNo = `EST-${String(input.row.reg_number || input.row.id).replace(/[^A-Z0-9]/gi, '')}`

  const rows = input.items
    .map((line, index) => {
      const qty = line.quantity || 1
      const amount = (Number(line.price) || 0) * qty + (Number(line.labour) || 0) * qty
      return `<tr>
        <td class="num">${index + 1}</td>
        <td>${escapeHtml(line.service_name)}</td>
        <td class="num">${qty}</td>
        <td class="num">${escapeHtml(money((Number(line.price) || 0) * qty))}</td>
        <td class="num">${escapeHtml(money((Number(line.labour) || 0) * qty))}</td>
        <td class="num"><strong>${escapeHtml(money(amount))}</strong></td>
      </tr>`
    })
    .join('')

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Service Estimate · ${escapeHtml(input.row.reg_number)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Arial, sans-serif; color: #111; margin: 16px; }
    .actions { display: flex; gap: 8px; margin-bottom: 16px; }
    button { background: #1e3a5f; color: #fff; border: 0; padding: 8px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; }
    button.secondary { background: #64748b; }
    .sheet { max-width: 210mm; margin: 0 auto; border: 1px solid #111; padding: 18px 20px; }
    .brand { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 12px; }
    h1 { margin: 0; font-size: 20px; letter-spacing: 0.08em; text-transform: uppercase; }
    .sub { margin: 2px 0 0; font-size: 12px; color: #333; }
    .badge { font-size: 13px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; border: 1px solid #111; padding: 4px 8px; }
    .meta { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    .meta th, .meta td { border: 1px solid #111; padding: 6px 8px; font-size: 12px; text-align: left; vertical-align: top; }
    .meta th { width: 22%; background: #f3f4f6; font-weight: 700; }
    table.lines { width: 100%; border-collapse: collapse; }
    table.lines th, table.lines td { border: 1px solid #111; padding: 6px 8px; font-size: 12px; }
    table.lines th { background: #1e3a5f; color: #fff; text-align: left; }
    .num { text-align: right; white-space: nowrap; }
    .totals { width: 280px; margin-left: auto; margin-top: 8px; border-collapse: collapse; }
    .totals td { border: 1px solid #111; padding: 6px 8px; font-size: 12px; }
    .note { margin-top: 14px; font-size: 11px; color: #333; }
    .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 48px; }
    .signs div { border-top: 1px solid #111; padding-top: 6px; font-size: 12px; }
    @media print {
      .actions { display: none !important; }
      body { margin: 8mm; }
      .sheet { border: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button onclick="window.print()">Print</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>
  <div class="sheet">
    <div class="brand">
      <div>
        <h1>Techwheels Service</h1>
        <p class="sub">Tata Motors Dealership Workshop · Mechanical Service Estimate</p>
        <p class="sub">${escapeHtml(branch)} · Printed ${escapeHtml(printed)}</p>
      </div>
      <div class="badge">Estimate</div>
    </div>
    <table class="meta">
      <tr><th>Estimate no.</th><td>${escapeHtml(estimateNo)}</td><th>Date</th><td>${escapeHtml(printed)}</td></tr>
      <tr><th>Registration</th><td><strong>${escapeHtml(input.row.reg_number)}</strong></td><th>Job card</th><td>${escapeHtml(jc)}</td></tr>
      <tr><th>Customer</th><td>${escapeHtml(input.row.owner_name || '—')}</td><th>Phone</th><td>${escapeHtml(input.row.owner_phone || '—')}</td></tr>
      <tr><th>Model / Fuel / Make</th><td>${escapeHtml(input.model)} · ${escapeHtml(input.fuel)} · ${escapeHtml(input.make)}</td><th>Service type</th><td>${escapeHtml(input.serviceType)}</td></tr>
      <tr><th>KM reading</th><td>${escapeHtml(km)}</td><th>Service advisor</th><td>${escapeHtml(sa)}</td></tr>
    </table>
    <table class="lines">
      <thead>
        <tr>
          <th style="width:36px">Sr</th>
          <th>Particulars</th>
          <th class="num" style="width:48px">Qty</th>
          <th class="num" style="width:90px">Parts</th>
          <th class="num" style="width:90px">Labour</th>
          <th class="num" style="width:100px">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="6">No items</td></tr>`}
      </tbody>
    </table>
    <table class="totals">
      <tr><td>Parts</td><td class="num">${escapeHtml(money(input.partsTotal))}</td></tr>
      <tr><td>Labour</td><td class="num">${escapeHtml(money(input.labourTotal))}</td></tr>
      <tr><td><strong>Estimated total</strong></td><td class="num"><strong>${escapeHtml(money(input.grandTotal))}</strong></td></tr>
    </table>
    <p class="note">
      This is a workshop service estimate, not a tax invoice. GST extra as applicable on final invoice.
      Parts availability, actual consumption and labour may vary after inspection. Estimate is valid for 7 days.
    </p>
    <div class="signs">
      <div>Customer acknowledgement</div>
      <div>Service advisor</div>
    </div>
  </div>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    URL.revokeObjectURL(url)
    throw new Error('Allow pop-ups to print the estimate')
  }
  win.focus()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
