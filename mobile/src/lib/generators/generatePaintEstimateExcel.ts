/**
 * generatePaintEstimateExcel (mobile)
 * Generates Paint Estimate in the official Tata Motors format using ExcelJS.
 * Matches exactly what the web generateExcel.ts produces.
 *
 * Sheet 1: Guidelines
 * Sheet 2: Paint Claim Format (A–P columns)
 */

import ExcelJS from 'exceljs'

// ── Colours ──────────────────────────────────────────────────────────────────
const CYAN_HDR   = 'FF3BCCFF'
const YELLOW_AGE = 'FFFFFF00'

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
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
  } catch { return val ?? '' }
}

function calcAgeStr(dateOfSale: string | null | undefined): string {
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

function safeNum(v: unknown): number {
  const n = Number(v)
  return isNaN(n) ? 0 : n
}

function headerStyle(wb: ExcelJS.Workbook): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, color: { argb: 'FF000000' }, size: 9 },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: CYAN_HDR } },
    alignment: { wrapText: true, vertical: 'middle', horizontal: 'center' },
    border: {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    },
  }
}

function labelStyle(): Partial<ExcelJS.Style> {
  return {
    font: { bold: true, size: 9 },
    alignment: { vertical: 'middle' },
  }
}

function valueStyle(): Partial<ExcelJS.Style> {
  return {
    font: { size: 9 },
    alignment: { vertical: 'middle', wrapText: true },
  }
}

function dataStyle(bold = false): Partial<ExcelJS.Style> {
  return {
    font: { bold, size: 9 },
    alignment: { vertical: 'middle', horizontal: bold ? 'right' : 'left', wrapText: true },
    border: {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    },
  }
}

export async function generatePaintEstimateExcelBlob(
  jc: PaintEstimateJobCard,
  rows: PaintEstimateDataRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AutoDoc Warranty System'
  wb.created = new Date()

  // ── Sheet 1: Guidelines ─────────────────────────────────────────────────
  const wsG = wb.addWorksheet('Guidelines')
  wsG.getColumn(1).width = 3
  wsG.getColumn(2).width = 95

  const guideLines = [
    { text: 'Guidelines', bold: true },
    { text: 'This format is common for Paint Rust Cases within and Outside Warranty' },
    { text: 'Please fill up all the fields' },
    { text: 'Part Number and QTY not necessary if the replacement is not to be done' },
    { text: 'Submit the estimate with the Defect Photos for repair approval' },
    { text: 'Post Repair and claim submission, Defect and Repaired Photos are essential in this estimate' },
    { text: 'Do not Copy - Paste photo in sheet, use Insert >> Pictures Option of Excel' },
    { text: '' },
    { text: 'Regular Warranty Claims', bold: true },
    { text: 'Estimate with the photos before repair and after repair are required' },
    { text: 'Ensure to attach all relevant documents in attachment link' },
    { text: '' },
    { text: 'Post Warranty Claims', bold: true },
    { text: 'Submit this estimate, Service History to CCM for recommendation' },
    { text: 'CCM will then submit this case to Warranty Ops Team' },
    { text: 'TML Share is 75% of total within 2-3 years' },
    { text: 'TML Share is 50% of total within 3-4 years' },
    { text: 'TML Share is 25% of total within 4-5 years' },
    { text: 'Warranty Ops team will study and recommend the repairs with the manual claim format' },
  ]

  guideLines.forEach((g, i) => {
    const row = wsG.getRow(i + 1)
    const cell = row.getCell(2)
    cell.value = g.text
    cell.font = { bold: !!g.bold, size: 10 }
    row.height = 16
  })

  // ── Sheet 2: Paint Claim Format ─────────────────────────────────────────
  const ws = wb.addWorksheet(' Paint Claim Format')

  // Column widths (A=narrow, B–P = data cols)
  ws.getColumn(1).width = 3    // A blank
  ws.getColumn(2).width = 6    // B Sr.No
  ws.getColumn(3).width = 14   // C Part Number
  ws.getColumn(4).width = 22   // D Part Description
  ws.getColumn(5).width = 10   // E Defect
  ws.getColumn(6).width = 10   // F Repair
  ws.getColumn(7).width = 8    // G QTY
  ws.getColumn(8).width = 14   // H NDP
  ws.getColumn(9).width = 18   // I Cut&Weld
  ws.getColumn(10).width = 20  // J Paint Paid
  ws.getColumn(11).width = 18  // K Paint Warranty
  ws.getColumn(12).width = 16  // L Total Special
  ws.getColumn(13).width = 14  // M Job Code
  ws.getColumn(14).width = 20  // N Job Code Desc
  ws.getColumn(15).width = 8   // O No.off
  ws.getColumn(16).width = 14  // P Labour

  // ── Calculations ──────────────────────────────────────────────────────
  let ageInDays = 0
  let ageInYears = 0
  if (jc.date_of_sale) {
    try {
      ageInDays = Math.floor((Date.now() - new Date(jc.date_of_sale).getTime()) / 86400000)
      ageInYears = parseFloat((ageInDays / 365).toFixed(2))
    } catch { /**/ }
  }
  const totalNdp    = rows.reduce((s, r) => s + safeNum(r.ndp_value), 0)
  const totalPaint  = rows.reduce((s, r) => s + safeNum(r.total_special_charges), 0)
  const totalLabour = rows.reduce((s, r) => s + safeNum(r.labour_charges), 0)
  const grandTotal  = totalNdp + totalPaint + totalLabour
  const tmlShare    = Math.round(grandTotal * 0.5)

  // ── Row 1: Title ─────────────────────────────────────────────────────
  ws.mergeCells('D1:P1')
  const titleCell = ws.getCell('D1')
  titleCell.value = ' Paint Estimate Format'
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF000000' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CYAN_HDR } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 24

  // ── Row 2: blank ─────────────────────────────────────────────────────
  ws.getRow(2).height = 6

  // ── Helper: set info row ─────────────────────────────────────────────
  function setInfoRow(
    rowNum: number,
    label1: string, val1: string,
    label2: string, val2: string,
    label3: string, val3: string,
    ageNote?: string,
  ) {
    const row = ws.getRow(rowNum)
    row.height = 18
    // C=label, D=val, G=label, I=val, J=label, L=val, M=ageNote
    row.getCell(3).value = label1; Object.assign(row.getCell(3), { ...labelStyle() })
    row.getCell(4).value = val1;   Object.assign(row.getCell(4), { ...valueStyle() })
    row.getCell(7).value = label2; Object.assign(row.getCell(7), { ...labelStyle() })
    row.getCell(9).value = val2;   Object.assign(row.getCell(9), { ...valueStyle() })
    row.getCell(10).value = label3; Object.assign(row.getCell(10), { ...labelStyle() })
    row.getCell(12).value = val3;   Object.assign(row.getCell(12), { ...valueStyle() })
    if (ageNote) {
      ws.mergeCells(`M${rowNum}:P${rowNum}`)
      const c = row.getCell(13)
      c.value = ageNote
      c.font = { bold: true, size: 9, color: { argb: 'FF000000' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW_AGE } }
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    }
  }

  setInfoRow(3,
    'Chassis number',       jc.vin ?? '',
    'Date of sale',         fmtDate(jc.date_of_sale),
    'Colour of Car',        jc.colour ?? '',
    calcAgeStr(jc.date_of_sale),
  )
  setInfoRow(4,
    'Registration\nNumber', jc.reg_number ?? '',
    'Complaint Report Date', fmtDate(jc.complaint_date),
    'B&P City Category (Refer SU794)', '',
  )
  setInfoRow(5,
    'Dealer Code',          jc.dealer_code ?? '3000840',
    'Vehicle Age',          String(ageInDays),
    'Paint Type',           jc.paint_type ?? '',
  )
  setInfoRow(6,
    'Dealer',               jc.dealer_name ?? 'FIRST MOBITE PVT.LTD.',
    'Years/Months',         String(ageInYears),
    'Total Expenses (1+2+3)', String(grandTotal),
  )
  setInfoRow(7,
    'Dealer City',          jc.dealer_city ?? 'JAIPUR',
    'Cumm. KMS',            String(jc.km_reading ?? ''),
    '',                     String(tmlShare),
  )

  // ── Row 8: blank ─────────────────────────────────────────────────────
  ws.getRow(8).height = 6

  // ── Row 9: Column headers ─────────────────────────────────────────────
  const hdrRow = ws.getRow(9)
  hdrRow.height = 42
  const headers = [
    '', 'Sr. No.', 'Part Number', 'Part\nDescription',
    'Defect', 'Repair', 'Part QTY', '1-Part NDP Value',
    'Cut & Weld Special Charges\n(A)',
    'Paint Paid Charges applicable as per\nService Update',
    'Paint Charges applicable for Warranty\n(B)',
    '2-Total Special Charges\n(A+B)',
    'Job code for\nremove-refit',
    'Job code Description',
    'No.off',
    '3-Labour chgs',
  ]
  headers.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 1)
    cell.value = h
    if (h) Object.assign(cell, headerStyle(wb))
  })

  // ── Row 10: Sub-header notes ───────────────────────────────────────────
  const subRow = ws.getRow(10)
  subRow.height = 36
  const subHeaders = [
    '', 'Part QTY and NDP amount applicable only if part replacement is required', '', '', '', '', '',
    '',
    'Applicable for Body noise Issue Only',
    'Refer Various Service Updates',
    '70% for 2 Parts\n60% for >2 parts',
    'Job code 980016',
    'Check Info Center for Warranty Job code',
    '', '', '',
  ]
  subHeaders.forEach((h, i) => {
    const cell = subRow.getCell(i + 1)
    cell.value = h || null
    cell.font = { italic: true, size: 8 }
    cell.alignment = { wrapText: true, vertical: 'top' }
  })

  // ── Rows 11+: Data rows ───────────────────────────────────────────────
  const MAX_ROWS = 11
  for (let i = 0; i < MAX_ROWS; i++) {
    const r = rows[i]
    const rowNum = 11 + i
    const dRow = ws.getRow(rowNum)
    dRow.height = 16
    const vals = r
      ? [
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
        ]
      : ['', i + 1, 'N/A', '', 'Rusting', 'REPAINT', 0, 0, 0, 0, 0, 0, '', '', 0, 0]

    vals.forEach((v, ci) => {
      const cell = dRow.getCell(ci + 1)
      cell.value = v as ExcelJS.CellValue
      if (ci > 0) {
        const isNum = typeof v === 'number'
        cell.font = { size: 9 }
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        }
        cell.alignment = { vertical: 'middle', horizontal: isNum ? 'right' : 'left' }
      }
    })
  }

  // ── Sub Total row ─────────────────────────────────────────────────────
  const totalRowNum = 11 + MAX_ROWS
  const tRow = ws.getRow(totalRowNum)
  tRow.height = 18
  const totals = [
    '', '', 'Sub Total', '', '', '', '',
    totalNdp, 0, '', totalPaint, totalPaint, '', '', '', totalLabour,
  ]
  totals.forEach((v, ci) => {
    const cell = tRow.getCell(ci + 1)
    cell.value = v as ExcelJS.CellValue
    cell.font = { bold: true, size: 9 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CYAN_HDR } }
    cell.alignment = { vertical: 'middle', horizontal: typeof v === 'number' ? 'right' : 'left' }
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    }
  })

  // Write to buffer
  const buf = await wb.xlsx.writeBuffer()
  return buf as Buffer
}
