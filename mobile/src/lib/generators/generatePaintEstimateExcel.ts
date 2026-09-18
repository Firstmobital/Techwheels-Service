/**
 * generatePaintEstimateExcel (mobile)
 * Generates Paint Estimate in the official Tata Motors format using XLSX (pure JS, Hermes compatible).
 *
 * Sheet 1: Guidelines
 * Sheet 2: Paint Claim Format (A–P columns)
 */

import * as XLSX from 'xlsx'

export interface PaintEstimateJobCard {
  vin?: string | null
  reg_number?: string | null
  dealer_code?: string | null
  dealer_name?: string | null
  dealer_city?: string | null
  date_of_sale?: string | null
  complaint_date?: string | null
  km_reading?: number | null
  colour?: string | null
  paint_type?: string | null
  jc_number?: string | null
  model?: string | null
}

export interface PaintEstimateDataRow {
  sr_no: number
  part_number?: string | null
  panel_name?: string | null
  defect?: string | null
  action?: string | null
  qty?: number | null
  ndp_value?: number | null
  cut_weld_charges?: number | null
  paint_charges?: number | null
  total_special_charges?: number | null
  job_code?: string | null
  job_code_desc?: string | null
  no_off?: number | null
  labour_charges?: number | null
}

function fmtDate(val: string | null | undefined): string {
  if (!val) return ''
  try {
    const d = new Date(val)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  } catch {
    return val ?? ''
  }
}

function calcAgeStr(dateOfSale: string | null | undefined): string {
  if (!dateOfSale) return ''
  try {
    const sale = new Date(dateOfSale)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - sale.getTime()) / 86400000)
    const years = Math.floor(diffDays / 365)
    const months = Math.floor((diffDays % 365) / 30)
    const share = years < 2 ? '100% TML' : years < 3 ? '75% TML' : years < 4 ? '50% TML' : years < 5 ? '25% TML' : '0% (Customer)'
    return `${years}Y ${months}M (${share})`
  } catch {
    return ''
  }
}

function safeNum(val: number | string | null | undefined): number {
  if (val == null || val === '') return 0
  const n = typeof val === 'number' ? val : parseFloat(String(val))
  return isNaN(n) ? 0 : n
}

export async function generatePaintEstimateExcelBlob(
  jc: PaintEstimateJobCard,
  rows: PaintEstimateDataRow[],
): Promise<Uint8Array> {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Guidelines ─────────────────────────────────────────────────
  const guideData: (string | null)[][] = [
    ['', 'Guidelines'],
    ['', 'This format is common for Paint Rust Cases within and Outside Warranty'],
    ['', 'Please fill up all the fields'],
    ['', 'Part Number and QTY not necessary if the replacement is not to be done'],
    ['', 'Submit the estimate with the Defect Photos for repair approval'],
    ['', 'Post Repair and claim submission, Defect and Repaired Photos are essential in this estimate'],
    ['', 'Do not Copy - Paste photo in sheet, use Insert >> Pictures Option of Excel'],
    ['', ''],
    ['', 'Regular Warranty Claims'],
    ['', 'Estimate with the photos before repair and after repair are required'],
    ['', 'Ensure to attach all relevant documents in attachment link'],
    ['', ''],
    ['', 'Post Warranty Claims'],
    ['', 'Submit this estimate, Service History to CCM for recommendation'],
    ['', 'CCM will then submit this case to Warranty Ops Team'],
    ['', 'TML Share is 75% of total within 2-3 years'],
    ['', 'TML Share is 50% of total within 3-4 years'],
    ['', 'TML Share is 25% of total within 4-5 years'],
    ['', 'Warranty Ops team will study and recommend the repairs with the manual claim format'],
  ]

  const wsGuidelines = XLSX.utils.aoa_to_sheet(guideData)
  wsGuidelines['!cols'] = [{ wch: 3 }, { wch: 95 }]
  XLSX.utils.book_append_sheet(wb, wsGuidelines, 'Guidelines')

  // ── Sheet 2: Paint Claim Format ─────────────────────────────────────────
  let ageInDays = 0
  let ageInYears = 0
  if (jc.date_of_sale) {
    try {
      ageInDays = Math.floor((Date.now() - new Date(jc.date_of_sale).getTime()) / 86400000)
      ageInYears = parseFloat((ageInDays / 365).toFixed(2))
    } catch { /**/ }
  }

  const totalNdp = rows.reduce((s, r) => s + safeNum(r.ndp_value), 0)
  const totalPaint = rows.reduce((s, r) => s + safeNum(r.total_special_charges), 0)
  const totalLabour = rows.reduce((s, r) => s + safeNum(r.labour_charges), 0)
  const grandTotal = totalNdp + totalPaint + totalLabour
  const tmlShare = Math.round(grandTotal * 0.5)

  const claimData: any[][] = [
    // Row 1: Title (D1)
    ['', '', '', 'Paint Estimate Format'],
    // Row 2: Blank
    [],
    // Row 3: Info Row 1
    ['', '', 'Chassis number', jc.vin ?? '', '', '', 'Date of sale', '', fmtDate(jc.date_of_sale), 'Colour of Car', '', jc.colour ?? '', calcAgeStr(jc.date_of_sale)],
    // Row 4: Info Row 2
    ['', '', 'Registration Number', jc.reg_number ?? '', '', '', 'Complaint Report Date', '', fmtDate(jc.complaint_date), 'B&P City Category (Refer SU794)', '', ''],
    // Row 5: Info Row 3
    ['', '', 'Dealer Code', jc.dealer_code ?? '3000840', '', '', 'Vehicle Age', '', String(ageInDays), 'Paint Type', '', jc.paint_type ?? ''],
    // Row 6: Info Row 4
    ['', '', 'Dealer', jc.dealer_name ?? 'FIRST MOBITE PVT.LTD.', '', '', 'Years/Months', '', String(ageInYears), 'Total Expenses (1+2+3)', '', String(grandTotal)],
    // Row 7: Info Row 5
    ['', '', 'Dealer City', jc.dealer_city ?? 'JAIPUR', '', '', 'Cumm. KMS', '', String(jc.km_reading ?? ''), '', '', String(tmlShare)],
    // Row 8: Blank
    [],
    // Row 9: Headers
    [
      '',
      'Sr. No.',
      'Part Number',
      'Part Description',
      'Defect',
      'Repair',
      'Part QTY',
      '1-Part NDP Value',
      'Cut & Weld Special Charges (A)',
      'Paint Paid Charges applicable as per Service Update',
      'Paint Charges applicable for Warranty (B)',
      '2-Total Special Charges (A+B)',
      'Job code for remove-refit',
      'Job code Description',
      'No.off',
      '3-Labour chgs',
    ],
    // Row 10: Sub-headers
    [
      '',
      'Part QTY and NDP amount applicable only if part replacement is required',
      '',
      '',
      '',
      '',
      '',
      '',
      'Applicable for Body noise Issue Only',
      'Refer Various Service Updates',
      '70% for 2 Parts\n60% for >2 parts',
      'Job code 980016',
      'Check Info Center for Warranty Job code',
      '',
      '',
      '',
    ],
  ]

  // Data rows (11 max rows)
  const MAX_ROWS = 11
  for (let i = 0; i < MAX_ROWS; i++) {
    const r = rows[i]
    if (r) {
      claimData.push([
        '',
        r.sr_no,
        r.part_number ?? 'N/A',
        r.panel_name ?? '',
        r.defect ?? 'Rusting',
        r.action ?? 'REPAINT',
        safeNum(r.qty),
        safeNum(r.ndp_value),
        safeNum(r.cut_weld_charges),
        safeNum(r.paint_charges),
        safeNum(r.total_special_charges),
        safeNum(r.total_special_charges),
        r.job_code ?? '',
        r.job_code_desc ?? '',
        safeNum(r.no_off),
        safeNum(r.labour_charges),
      ])
    } else {
      claimData.push(['', i + 1, 'N/A', '', 'Rusting', 'REPAINT', 0, 0, 0, 0, 0, 0, '', '', 0, 0])
    }
  }

  // Sub Total Row
  claimData.push([
    '',
    '',
    'Sub Total',
    '',
    '',
    '',
    '',
    totalNdp,
    0,
    '',
    totalPaint,
    totalPaint,
    '',
    '',
    '',
    totalLabour,
  ])

  const wsClaim = XLSX.utils.aoa_to_sheet(claimData)

  // Column widths
  wsClaim['!cols'] = [
    { wch: 3 },  // A blank
    { wch: 6 },  // B Sr.No
    { wch: 14 }, // C Part Number
    { wch: 22 }, // D Part Description
    { wch: 10 }, // E Defect
    { wch: 10 }, // F Repair
    { wch: 8 },  // G QTY
    { wch: 14 }, // H NDP
    { wch: 18 }, // I Cut&Weld
    { wch: 20 }, // J Paint Paid
    { wch: 18 }, // K Paint Warranty
    { wch: 16 }, // L Total Special
    { wch: 14 }, // M Job Code
    { wch: 20 }, // N Job Code Desc
    { wch: 8 },  // O No.off
    { wch: 14 }, // P Labour
  ]

  XLSX.utils.book_append_sheet(wb, wsClaim, ' Paint Claim Format')

  // Generate binary output as Uint8Array
  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new Uint8Array(u8)
}
