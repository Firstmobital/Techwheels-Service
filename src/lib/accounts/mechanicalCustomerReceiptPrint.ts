import { ACCOUNTS_RECEIPT_COMPANY } from './receiptCompanyProfile'
import { amountInWordsInr, formatBodyshopReceiptDateYmd } from './bodyshopCustomerReceipt'
import type { MechanicalCustomerReceiptPayload } from './mechanicalCustomerReceipt'

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function inr(amount: number): string {
  return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function paymentDetailsHtml(input: MechanicalCustomerReceiptPayload): string {
  const rows = input.breakup.map((row) => {
    const ref = row.voucherRef && row.referenceCell !== '—'
      ? `${escapeHtml(row.referenceCell)} <span class="voucher">(${escapeHtml(row.voucherRef)})</span>`
      : row.voucherRef
        ? `<span class="voucher">${escapeHtml(row.voucherRef)}</span>`
        : escapeHtml(row.referenceCell)
    return `<tr>
      <td>${escapeHtml(row.dateLabel)}</td>
      <td>${escapeHtml(row.modeLabel)}</td>
      <td>${ref}</td>
      <td class="amt">${escapeHtml(inr(row.amount))}</td>
    </tr>`
  }).join('')

  return `
    <div class="pay-section">
      <div class="pay-heading">Payment Details</div>
      <table class="pay-table">
        <thead>
          <tr><th>Date</th><th>Mode</th><th>Reference</th><th>Amount</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="pay-total"><span>Total Received:</span><strong>${escapeHtml(inr(input.totalReceived))}</strong></div>
    </div>`
}

function receiptBlockHtml(input: MechanicalCustomerReceiptPayload): string {
  const { caseRow } = input
  const company = ACCOUNTS_RECEIPT_COMPANY
  const receiptNo = input.receiptNumber
  const receiptDate = formatBodyshopReceiptDateYmd(input.receiptDateYmd)
  const amount = input.totalReceived
  const partyGstin = input.partyGstin?.trim() || '—'
  const companyGstin = company.gstin?.trim() || '—'
  const modelSuffix = caseRow.model?.trim() ? ` · ${caseRow.model.trim()}` : ''

  return `
  <section class="receipt-block">
    <div class="copy-label">Customer copy</div>
    <header class="company">
      <div class="company-name">${escapeHtml(company.legalName)}</div>
      ${company.gstin ? `<div class="company-meta">GSTIN: ${escapeHtml(companyGstin)}</div>` : ''}
      ${company.addressLines.map((lineText) => `<div class="company-meta">${escapeHtml(lineText)}</div>`).join('')}
    </header>
    <h2 class="title">RECEIPT</h2>
    <table class="meta">
      <tr><th>Receipt No.</th><td>${escapeHtml(receiptNo)}</td><th>Dated</th><td>${escapeHtml(receiptDate)}</td></tr>
      <tr><th>Party</th><td colspan="3">${escapeHtml(input.partyName || '—')}</td></tr>
      <tr><th>Party GSTIN / UIN</th><td colspan="3">${escapeHtml(partyGstin)}</td></tr>
      <tr><th>Place of Supply</th><td colspan="3">${escapeHtml(company.placeOfSupply)}</td></tr>
    </table>
    <div class="amount-banner">
      <span>Amount (Rs.)</span>
      <strong>${escapeHtml(inr(amount))}</strong>
    </div>
    <table class="detail">
      <tr><th>Vehicle registration</th><td>${escapeHtml(caseRow.reg_number || '—')}${escapeHtml(modelSuffix)}</td></tr>
      <tr><th>Invoice / Job card</th><td>${escapeHtml(caseRow.invoice_number || '—')} · ${escapeHtml(caseRow.jc_number)}</td></tr>
    </table>
    ${paymentDetailsHtml(input)}
    <div class="amount-repeat">
      <div><span>Amount</span><strong>${escapeHtml(inr(amount))}</strong></div>
      <div class="words">${escapeHtml(amountInWordsInr(amount))}</div>
    </div>
    <div class="sign">
      <div>For ${escapeHtml(company.legalName)}</div>
      <div class="sign-line">Authorised Signatory</div>
    </div>
  </section>`
}

export function generateMechanicalCustomerReceiptHtml(input: MechanicalCustomerReceiptPayload): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt · ${escapeHtml(input.receiptNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4 portrait; margin: 7mm; }
    /* One A4 sheet: upper half = one Mechanical receipt; lower half intentionally blank for a second customer. */
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 7mm;
      font-size: 9.5px;
      line-height: 1.28;
      background: #fff;
    }
    .actions { display: flex; gap: 8px; margin-bottom: 6px; }
    .actions button {
      background: #0f172a;
      color: #fff;
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
      font-size: 12px;
    }
    .sheet {
      display: flex;
      flex-direction: column;
      height: 297mm;
      max-height: 297mm;
      overflow: hidden;
    }
    .page {
      flex: 0 0 141.5mm;
      height: 141.5mm;
      max-height: 141.5mm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .page-lower {
      flex: 0 0 141.5mm;
      height: 141.5mm;
      max-height: 141.5mm;
    }
    .receipt-block {
      flex: 1 1 0;
      min-height: 0;
      max-height: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 3mm 6mm 2.5mm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .copy-label {
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 3px;
    }
    .company-name { font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .company-meta { font-size: 8.5px; color: #475569; }
    .title {
      text-align: center;
      font-size: 11.5px;
      letter-spacing: 0.18em;
      margin: 2px 0 4px;
      font-weight: 800;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 2px; }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 1px 5px;
      vertical-align: top;
      word-break: break-word;
    }
    th { background: #f8fafc; font-weight: 600; text-align: left; }
    .meta th { width: 18%; font-size: 9px; }
    .meta td { font-size: 9px; }
    .detail th { width: 26%; font-size: 9px; }
    .detail td { font-size: 9px; }
    .amount-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #0f172a;
      padding: 3px 8px;
      margin: 2px 0 3px;
      font-size: 10px;
    }
    .amount-banner strong { font-size: 12px; }
    .pay-section { margin: 1px 0 2px; }
    .pay-heading { font-weight: 700; font-size: 9px; margin-bottom: 2px; }
    .pay-table th { font-size: 8.5px; }
    .pay-table td { font-size: 8.5px; }
    .pay-table .amt { text-align: right; white-space: nowrap; font-weight: 600; }
    .pay-table th:last-child, .pay-table td.amt { width: 22%; }
    .pay-total {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      font-size: 9.5px;
      font-weight: 700;
      margin-top: 2px;
    }
    .voucher { color: #64748b; font-size: 8px; }
    .amount-repeat {
      border-top: 1px dashed #94a3b8;
      padding-top: 3px;
      margin-top: auto;
      font-size: 9px;
    }
    .amount-repeat strong { font-size: 11px; margin-left: 6px; }
    .words { margin-top: 1px; font-weight: 600; font-size: 8.5px; }
    .sign { margin-top: 3px; text-align: right; font-size: 8.5px; }
    .sign-line { margin-top: 10px; border-top: 1px solid #0f172a; display: inline-block; min-width: 140px; padding-top: 2px; }
    @media print {
      .actions { display: none !important; }
      body { padding: 0; }
      .sheet {
        height: 283mm;
        max-height: 283mm;
      }
      .page, .page-lower {
        flex: 0 0 141.5mm;
        height: 141.5mm;
        max-height: 141.5mm;
      }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="sheet">
    <div class="page">
      ${receiptBlockHtml(input)}
    </div>
    <div class="page-lower" aria-hidden="true"></div>
  </div>
</body>
</html>`
}

function openHtmlPrintDocument(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    URL.revokeObjectURL(url)
    throw new Error('Allow pop-ups to open the receipt PDF')
  }
  win.focus()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function openMechanicalCustomerReceiptPrint(input: MechanicalCustomerReceiptPayload): void {
  openHtmlPrintDocument(generateMechanicalCustomerReceiptHtml(input))
}
