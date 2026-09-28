import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { Alert } from 'react-native'

export interface PaymentReceiptPdfParams {
  jobCardNo: string
  regNumber: string
  customerName?: string
  serviceType?: string
  branch?: string
  saName?: string
  invoiceNo?: string
  invoiceDate?: string
  billedAmount: number
  receivedAmount: number
  remainingAmount: number
  isBodyshop?: boolean
  insuranceCompany?: string
  doAmount?: number
  doRemaining?: number
  customerDiff?: number
  customerReceived?: number
  customerRemaining?: number
  payments?: Array<{
    amount: number
    payment_mode?: string
    posted_at?: string
    payment_received_date?: string
    voucher_no?: string
    reference?: string
  }>
}

export function generatePaymentReceiptHtml(params: PaymentReceiptPdfParams): string {
  const printedDate = new Date().toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  })

  const {
    jobCardNo,
    regNumber,
    customerName,
    serviceType = 'Vehicle Service',
    branch = 'Sitapura Workshop',
    saName,
    invoiceNo,
    invoiceDate,
    billedAmount,
    receivedAmount,
    remainingAmount,
    isBodyshop,
    insuranceCompany,
    doAmount,
    customerDiff,
    customerReceived,
    customerRemaining,
    payments = [],
  } = params

  const cleared = remainingAmount <= 0.009 && billedAmount > 0

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Payment Receipt · ${jobCardNo}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111; margin: 24px; line-height: 1.4; background: #fff; }
    .header-top { display: flex; justify-content: space-between; font-size: 11px; color: #555; margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
    h1 { font-size: 20px; font-weight: 800; margin: 0 0 4px; letter-spacing: 0.04em; color: #000; text-transform: uppercase; }
    .sub { color: #555; margin: 0 0 16px; font-size: 12.5px; }
    .status-tag { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-bottom: 16px; }
    .status-paid { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .status-due { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { text-align: left; padding: 7px 10px; border: 1px solid #d4d4d8; font-size: 12.5px; vertical-align: middle; }
    th { width: 35%; background: #f8fafc; font-weight: 600; color: #1e293b; }
    td { color: #0f172a; }
    .table-payments th { background: #0f172a; color: #fff; font-size: 11.5px; }
    .table-payments td { font-size: 12px; }
    .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; padding-top: 8px; }
    .signs div { border-top: 1px solid #111; padding-top: 6px; font-size: 11.5px; color: #333; font-weight: 500; text-align: center; }
    .actions { display: flex; gap: 8px; margin-bottom: 16px; }
    .btn { background: #0284c7; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px; }
    @media print {
      .actions { display: none !important; }
      body { margin: 10mm; }
    }
  </style>
</head>
<body>
  <div class="actions">
    <button class="btn" onclick="window.print()">Print Receipt</button>
  </div>
  <div class="header-top">
    <div><strong>TECHWHEELS SERVICE CENTRE</strong> · ${branch}</div>
    <div>Date: ${printedDate}</div>
  </div>
  <h1>OFFICIAL PAYMENT RECEIPT & SETTLEMENT</h1>
  <p class="sub">${serviceType} · Registration: <strong>${regNumber}</strong> · Job Card: <strong>${jobCardNo}</strong></p>
  
  <div class="status-tag ${cleared ? 'status-paid' : 'status-due'}">
    ${cleared ? '✓ FULLY PAID & SETTLED' : `PAYMENT STATUS: ₹${remainingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })} OUTSTANDING`}
  </div>

  <h3>Billing & Settlement Summary</h3>
  <table>
    <tr><th>Job Card</th><td><strong>${jobCardNo}</strong></td></tr>
    <tr><th>Registration</th><td><strong>${regNumber}</strong></td></tr>
    ${customerName ? `<tr><th>Customer Name</th><td>${customerName}</td></tr>` : ''}
    ${saName ? `<tr><th>Service Advisor</th><td>${saName}</td></tr>` : ''}
    ${invoiceNo ? `<tr><th>Invoice Number</th><td><strong>${invoiceNo}</strong></td></tr>` : ''}
    ${invoiceDate ? `<tr><th>Invoice Date</th><td>${invoiceDate}</td></tr>` : ''}
    ${isBodyshop && insuranceCompany ? `<tr><th>Insurance Company</th><td>${insuranceCompany}</td></tr>` : ''}
    ${isBodyshop && doAmount != null ? `<tr><th>Insurance DO Share</th><td>₹${doAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
    ${isBodyshop && customerDiff != null ? `<tr><th>Customer Share</th><td>₹${customerDiff.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
    ${isBodyshop && customerReceived != null ? `<tr><th>Customer Paid</th><td>₹${customerReceived.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
    ${isBodyshop && customerRemaining != null ? `<tr><th>Customer Remaining</th><td>₹${customerRemaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>` : ''}
    <tr><th>Total Billed Amount</th><td><strong>₹${billedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
    <tr><th>Total Received Amount</th><td><strong style="color: #15803d;">₹${receivedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
    <tr><th>Balance Due</th><td><strong style="color: ${remainingAmount > 0 ? '#b91c1c' : '#15803d'};">₹${remainingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td></tr>
  </table>

  ${payments.length > 0 ? `
  <h3>Payment Receipt History</h3>
  <table class="table-payments">
    <thead>
      <tr>
        <th>S.No</th>
        <th>Mode</th>
        <th>Date</th>
        <th>Reference / Voucher</th>
        <th style="text-align: right;">Amount (₹)</th>
      </tr>
    </thead>
    <tbody>
      ${payments.map((p, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${String(p.payment_mode || 'Payment').toUpperCase()}</strong></td>
          <td>${p.payment_received_date || p.posted_at || '—'}</td>
          <td>${p.voucher_no || p.reference || 'Accounts Credit'}</td>
          <td style="text-align: right; font-weight: bold;">₹${Number(p.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <div class="signs">
    <div>Accounts Desk Officer</div>
    <div>Customer Signature</div>
  </div>
</body>
</html>`
}

export async function printOrDownloadPaymentReceiptPdf(params: PaymentReceiptPdfParams): Promise<void> {
  const html = generatePaymentReceiptHtml(params)

  // On Web platform:
  if (typeof window !== 'undefined' && (window as any).print && !(window as any).ReactNativeWebView) {
    try {
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(html)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => {
          printWindow.print()
        }, 250)
        return
      }
    } catch {
      // fallback
    }
  }

  // Native Mobile (Android & iOS):
  try {
    const printed = await Print.printToFileAsync({ html })
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(printed.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `Payment Receipt - ${params.regNumber}`,
        UTI: 'com.adobe.pdf',
      })
    } else {
      await Print.printAsync({ html })
    }
  } catch (err) {
    console.error('Print payment receipt error:', err)
    Alert.alert('Print Error', err instanceof Error ? err.message : 'Unable to print payment receipt.')
  }
}
