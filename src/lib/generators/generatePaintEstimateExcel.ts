/**
 * generatePaintEstimateExcel
 * Generates an Excel file in the official Tata Motors Paint Estimate Format
 * matching the "Paint Claim Format" sheet structure used for warranty claims.
 *
 * Columns (A–P):
 * B: Sr.No  C: Part Number  D: Part Description  E: Defect  F: Repair
 * G: Part QTY  H: 1-Part NDP Value  I: Cut & Weld Special Charges (A)
 * J: Paint Paid Charges  K: Paint Charges for Warranty (B)  L: 2-Total Special Charges (A+B)
 * M: Job Code (remove-refit)  N: Job Code Description  O: No.off  P: 3-Labour Charges
 */

import * as XLSX from 'xlsx'

export interface PaintEstimateJobCard {
  vin: string | null
  reg_number: string | null
  dealer_code?: string | null
  dealer_name?: string | null
  dealer_city?: string | null
  date_of_sale?: string | null
  complaint_date?: string | null
  km_reading?: number | null
  age_category?: string | null
  colour?: string | null
  paint_type?: string | null
  jc_number?: string | null
  model?: string | null
}

export interface PaintEstimateRow {
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
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  } catch { return val }
}

function calcAgeMonths(dateOfSale: string | null | undefined): string {
  if (!dateOfSale) return ''
  try {
    const sale = new Date(dateOfSale)
    const now = new Date()
    const months = (now.getFullYear() - sale.getFullYear()) * 12 + (now.getMonth() - sale.getMonth())
    const years = Math.floor(months / 12)
    const rem = months % 12
    return `AGEING ${years} YEAR${years !== 1 ? 's' : ''} ${rem} MONTHS FOR WARRANTY CONSIDERATION`
  } catch { return '' }
}

export function generatePaintEstimateExcelBlob(
  jc: PaintEstimateJobCard,
  rows: PaintEstimateRow[],
): Uint8Array {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Guidelines ────────────────────────────────────────────────
  const guideData = [
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
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData)
  wsGuide['!cols'] = [{ wch: 4 }, { wch: 90 }]
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Guidelines')

  // ── Sheet 2: Paint Claim Format ────────────────────────────────────────
  // Build AOA (array of arrays) with 16 columns (A–P)
  const S = (v: unknown) => (v == null ? '' : String(v))
  const N = (v: unknown) => (v == null || v === '' ? 0 : Number(v))

  const ageStr = calcAgeMonths(jc.date_of_sale)
  const totalNdp    = rows.reduce((s, r) => s + N(r.ndp_value), 0)
  const totalPaint  = rows.reduce((s, r) => s + N(r.total_special_charges), 0)
  const totalLabour = rows.reduce((s, r) => s + N(r.labour_charges), 0)
  const grandTotal  = totalNdp + totalPaint + totalLabour

  // Row 1: Title
  // Row 2: blank
  // Row 3: Chassis | Date of Sale | Colour + Ageing
  // Row 4: Reg No  | Complaint Date | B&P City Category
  // Row 5: Dealer Code | Vehicle Age (days) | Paint Type
  // Row 6: Dealer | Years/Months | Total Expenses
  // Row 7: Dealer City | Cumm. KMS | TML Share (50%)
  // Row 8: blank
  // Row 9: Header row
  // Row 10: Sub-header notes
  // Row 11+: Data rows
  // Last row: Sub Total

  const data: (string | number)[][] = []

  // R1: Title
  data.push(['', '', '', ' Paint Estimate Format', '', '', '', '', '', '', '', '', '', '', '', ''])

  // R2: blank
  data.push(new Array(16).fill(''))

  // Calculate vehicle age in days
  let ageInDays = ''
  let ageInYears = ''
  if (jc.date_of_sale) {
    try {
      const days = Math.floor((Date.now() - new Date(jc.date_of_sale).getTime()) / 86400000)
      ageInDays = String(days)
      ageInYears = (days / 365).toFixed(2)
    } catch { /**/ }
  }

  // R3
  data.push(['', '', 'Chassis number', S(jc.vin), '', '', 'Date of sale', '', fmtDate(jc.date_of_sale), 'Colour of Car', '', S(jc.colour), ageStr, '', '', ''])
  // R4
  data.push(['', '', 'Registration\nNumber', S(jc.reg_number), '', '', 'Complaint Report Date', 'Complaint Date', fmtDate(jc.complaint_date), 'B&P City Category (Refer SU794)', '', '', '', '', '', ''])
  // R5
  data.push(['', '', 'Dealer Code', S(jc.dealer_code ?? '3000840'), '', '', 'Vehicle Age', '', ageInDays, 'Paint Type', '', S(jc.paint_type), '', '', '', ''])
  // R6
  data.push(['', '', 'Dealer', S(jc.dealer_name ?? 'FIRST MOBITE PVT.LTD.'), '', '', 'Years/Months', '', ageInYears, 'Total Expenses (1+2+3)', '', grandTotal, '', '', '', ''])
  // R7
  data.push(['', '', 'Dealer City', S(jc.dealer_city ?? 'JAIPUR'), '', '', 'Cumm. KMS', '', N(jc.km_reading), '', '', grandTotal * 0.5, '', '', '', ''])

  // R8: blank
  data.push(new Array(16).fill(''))

  // R9: Column headers
  data.push([
    '',
    'Sr. No.',
    'Part Number',
    'Part\nDescription',
    'Defect',
    'Repair',
    'Part QTY',
    '1-Part NDP Value',
    'Cut & Weld Special Charges\n(A)',
    'Paint Paid Charges applicable as per Service Update',
    'Paint Charges applicable for Warranty\n(B)',
    '2-Total Special Charges\n(A+B)',
    'Job code for remove-refit',
    'Job code Description',
    'No.off',
    '3-Labour chgs',
  ])

  // R10: Sub-header notes
  data.push([
    '',
    'Part QTY and NDP amount is applicable only if the part replacement is required',
    '',
    '',
    '',
    '',
    '',
    '',
    'Applicable for Body noise Issue Only (cutting and welding)',
    'Refer Various Service Updates',
    '70% for 2 Parts case\n60% for more than 2 parts case',
    'Job code 980016',
    'Check the Info Center for Warranty Job code',
    '',
    '',
    '',
  ])

  // R11+: Data rows (up to 11 rows like original)
  const MAX_ROWS = 11
  for (let i = 0; i < MAX_ROWS; i++) {
    const r = rows[i]
    if (r) {
      data.push([
        '',
        r.sr_no,
        S(r.part_number ?? 'N/A'),
        S(r.panel_name),
        S(r.defect ?? 'Rusting'),
        S(r.action ?? 'REPAINT'),
        N(r.qty),
        N(r.ndp_value),
        N(r.cut_weld_charges),
        N(r.paint_charges),
        N(r.total_special_charges),
        N(r.total_special_charges),  // col L = col K in original
        S(r.job_code),
        S(r.job_code_desc),
        N(r.no_off),
        N(r.labour_charges),
      ])
    } else {
      data.push(['', i + 1, 'N/A', '', 'Rusting', 'REPAINT', 0, 0, 0, 0, 0, 0, '', '', 0, 0])
    }
  }

  // Sub Total row
  data.push([
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

  const ws = XLSX.utils.aoa_to_sheet(data)

  // Column widths
  ws['!cols'] = [
    { wch: 3 },   // A
    { wch: 6 },   // B Sr No
    { wch: 14 },  // C Part Number
    { wch: 22 },  // D Part Description
    { wch: 10 },  // E Defect
    { wch: 10 },  // F Repair
    { wch: 8 },   // G QTY
    { wch: 14 },  // H NDP
    { wch: 18 },  // I Cut & Weld
    { wch: 20 },  // J Paint Paid
    { wch: 18 },  // K Paint Warranty
    { wch: 16 },  // L Total Special
    { wch: 14 },  // M Job Code
    { wch: 20 },  // N Job Code Desc
    { wch: 8 },   // O No.off
    { wch: 14 },  // P Labour
  ]

  XLSX.utils.book_append_sheet(wb, ws, ' Paint Claim Format')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array
}
