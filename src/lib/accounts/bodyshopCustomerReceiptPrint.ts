import { ACCOUNTS_RECEIPT_COMPANY } from './receiptCompanyProfile'
import {
  amountInWordsInr,
  bodyshopCustomerReceiptNumber,
  bodyshopReceiptPaymentModeLabel,
  bodyshopReceiptReferenceLine,
  bodyshopReceiptDateForLine,
  type BodyshopCustomerReceiptPayload,
} from './bodyshopCustomerReceipt'

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

function receiptBlockHtml(input: BodyshopCustomerReceiptPayload, copyLabel: string): string {
  const { caseRow, line, insurerGstin, customerGstin } = input
  const company = ACCOUNTS_RECEIPT_COMPANY
  const receiptNo = bodyshopCustomerReceiptNumber(line)
  const receiptDate = bodyshopReceiptDateForLine(line)
  const amount = Number(line.amount)
  const mode = bodyshopReceiptPaymentModeLabel(line.payment_mode)
  const refLine = bodyshopReceiptReferenceLine(line.payment_mode, line.reference)
  const partyGstin = customerGstin?.trim() || '—'
  const companyGstin = company.gstin?.trim() || '—'

  return `
  <section class="receipt-block">
    <div class="copy-label">${escapeHtml(copyLabel)}</div>
    <header class="company">
      <div class="company-name">${escapeHtml(company.legalName)}</div>
      ${company.gstin ? `<div class="company-meta">GSTIN: ${escapeHtml(companyGstin)}</div>` : ''}
      ${company.addressLines.map((lineText) => `<div class="company-meta">${escapeHtml(lineText)}</div>`).join('')}
    </header>
    <h2 class="title">RECEIPT</h2>
    <table class="meta">
      <tr><th>Receipt No.</th><td>${escapeHtml(receiptNo)}</td><th>Dated</th><td>${escapeHtml(receiptDate)}</td></tr>
      <tr><th>Party</th><td colspan="3">${escapeHtml(caseRow.customer_name || '—')}</td></tr>
      <tr><th>Party GSTIN / UIN</th><td colspan="3">${escapeHtml(partyGstin)}</td></tr>
      <tr><th>Place of Supply</th><td colspan="3">${escapeHtml(company.placeOfSupply)}</td></tr>
    </table>
    <div class="amount-banner">
      <span>Amount (Rs.)</span>
      <strong>${escapeHtml(inr(amount))}</strong>
    </div>
    <table class="detail">
      <tr><th>Vehicle registration</th><td>${escapeHtml(caseRow.reg_number || '—')}</td></tr>
      <tr><th>Invoice / Job card</th><td>${escapeHtml(caseRow.invoice_number || '—')} · ${escapeHtml(caseRow.job_card_no)}</td></tr>
      <tr><th>Insurance company</th><td>${escapeHtml(caseRow.insurance_company || '—')}${insurerGstin ? ` · GSTIN ${escapeHtml(insurerGstin)}` : ''}</td></tr>
      <tr><th>Mode of Payment</th><td>${escapeHtml(mode)}</td></tr>
      ${refLine ? `<tr><th>Payment reference</th><td>${escapeHtml(refLine)}</td></tr>` : ''}
    </table>
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

export function generateBodyshopCustomerReceiptHtml(input: BodyshopCustomerReceiptPayload): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt · ${escapeHtml(bodyshopCustomerReceiptNumber(input.line))}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: A4 portrait; margin: 8mm; }
    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 8mm;
      font-size: 10px;
      line-height: 1.35;
      background: #fff;
    }
    .actions { display: flex; gap: 8px; margin-bottom: 8px; }
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
    .page {
      display: flex;
      flex-direction: column;
      gap: 0;
      min-height: calc(297mm - 16mm);
      max-height: calc(297mm - 16mm);
    }
    .receipt-block {
      flex: 1 1 0;
      min-height: 0;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 7mm 8mm 6mm;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .copy-label {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #475569;
      margin-bottom: 4px;
    }
    .company-name { font-size: 12px; font-weight: 800; text-transform: uppercase; }
    .company-meta { font-size: 9px; color: #475569; }
    .title {
      text-align: center;
      font-size: 13px;
      letter-spacing: 0.2em;
      margin: 6px 0 8px;
      font-weight: 800;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
    th, td {
      border: 1px solid #e2e8f0;
      padding: 3px 6px;
      vertical-align: top;
      word-break: break-word;
    }
    th { width: 28%; background: #f8fafc; font-weight: 600; text-align: left; }
    .meta th { width: 18%; }
    .amount-banner {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border: 1px solid #0f172a;
      padding: 6px 10px;
      margin: 4px 0 6px;
      font-size: 11px;
    }
    .amount-banner strong { font-size: 14px; }
    .amount-repeat {
      border-top: 1px dashed #94a3b8;
      padding-top: 6px;
      margin-top: auto;
      font-size: 10px;
    }
    .amount-repeat strong { font-size: 12px; margin-left: 8px; }
    .words { margin-top: 4px; font-weight: 600; font-size: 9.5px; }
    .sign { margin-top: 10px; text-align: right; font-size: 9px; }
    .sign-line { margin-top: 28px; border-top: 1px solid #0f172a; display: inline-block; min-width: 160px; padding-top: 4px; }
    .cut-line {
      flex: 0 0 auto;
      border-top: 2px dashed #64748b;
      margin: 4mm 0;
      position: relative;
      text-align: center;
      font-size: 8px;
      color: #64748b;
      letter-spacing: 0.08em;
    }
    .cut-line span {
      background: #fff;
      padding: 0 8px;
      position: relative;
      top: -7px;
    }
    @media print {
      .actions { display: none !important; }
      body { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="page">
    ${receiptBlockHtml(input, 'Customer copy')}
    <div class="cut-line"><span>Cut here — insurance company copy below</span></div>
    ${receiptBlockHtml(input, 'Insurance company copy')}
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

export function openBodyshopCustomerReceiptPrint(input: BodyshopCustomerReceiptPayload): void {
  openHtmlPrintDocument(generateBodyshopCustomerReceiptHtml(input))
}
