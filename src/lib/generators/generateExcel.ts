/**
 * generateEstimateExcel — Tata Motors Paint Claim Estimate Excel generator
 *
 * Sheet 1 — "Guidelines"  : Standard TML paint-rust claim guidelines text
 * Sheet 2 — "Paint Claim Format":
 *   Rows 1-5  : Header block (vehicle / dealer / date meta)
 *               Layout: A=label1 | B:C merged=value1 | D=spacer | E=label2 | F=value2 | G=label3 | H:O merged=value3
 *   Row  6    : blank separator
 *   Row  7    : Column headers (navy fill, white bold, word-wrap, frozen)
 *   Rows 8-N  : estimate_rows data from Supabase
 *   Row  N+1  : Sub-Total row with SUM formulas for cols G, H, J, K, N, O
 *   Row  N+2  : TML / Dealer share info line
 *
 * Columns A–O (15 total):
 *   A  Sr.No                B  Part Number         C  Part Description
 *   D  Defect               E  Repair              F  Part QTY
 *   G  1-Part NDP Value     H  Cut & Weld Special Charges (A)
 *   I  Paint Paid Charges applicable as per Service Update
 *   J  Paint Charges applicable for Warranty (B)
 *   K  2-Total Special Charges (A+B)
 *   L  Job code for remove-refit   M  Job code Description
 *   N  No.off               O  3-Labour chgs
 */

import ExcelJS from 'exceljs'
import { supabase } from '../supabase'

// ─── Brand colours (ARGB — must be 8-char hex) ───────────────────────────────

const NAVY       = 'FF002B5C'
const NAVY_MID   = 'FF1A4A7A'
const GOLD       = 'FFC9A84C'
const WHITE      = 'FFFFFFFF'
const HDR_LABEL  = 'FFE8EEF7'   // light blue tint for header block labels
const SUBTOTAL_F = 'FFEFF3FB'   // light blue for Sub-Total row
const BORDER_C   = 'FF000000'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobSummary {
  job_card_id:       string
  jc_number:         string
  complaint_date:    string | null
  claim_type:        string | null
  km_reading:        number | null
  reg_number:        string
  vin:               string | null
  model:             string | null
  colour:            string | null
  paint_type:        string | null
  dealer_code:       string
  dealer_name:       string | null
  dealer_city:       string | null
  bp_city_category:  string | null
  date_of_sale:      string | null
  warranty_age_days: number | null
  tml_share_percent: number | null
}

interface EstimateRow {
  sr_no:                 number
  part_number:           string | null
  part_description:      string | null
  defect:                string | null
  action:                string | null
  qty:                   number
  ndp_value:             number
  cut_weld_charges:      number
  paint_charges:         number
  total_special_charges: number
  job_code:              string | null
  job_code_desc:         string | null
  no_off:                number
  labour_charges:        number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function ageToYM(days: number | null): string {
  if (days == null) return '—'
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  return `${y} yr${y !== 1 ? 's' : ''} ${m} mo`
}

function colLetter(n: number): string {
  let result = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    result = String.fromCharCode(65 + rem) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

const THIN: ExcelJS.BorderStyle = 'thin'
const side = { style: THIN, color: { argb: BORDER_C } } as const

function border(cell: ExcelJS.Cell) {
  cell.border = { top: side, left: side, bottom: side, right: side }
}

function applyBorders(ws: ExcelJS.Worksheet, r1: number, r2: number, c1: number, c2: number) {
  for (let r = r1; r <= r2; r++)
    for (let c = c1; c <= c2; c++)
      border(ws.getCell(r, c))
}

// ─── Supabase fetch ───────────────────────────────────────────────────────────

async function fetchData(jobCardId: string) {
  const [sumRes, estRes] = await Promise.all([
    supabase
      .from('job_card_summary')
      .select([
        'job_card_id', 'jc_number', 'complaint_date', 'claim_type', 'km_reading',
        'reg_number', 'vin', 'model', 'colour', 'paint_type',
        'dealer_code', 'dealer_name', 'dealer_city', 'bp_city_category',
        'date_of_sale', 'warranty_age_days', 'tml_share_percent',
      ].join(', '))
      .eq('job_card_id', jobCardId)
      .single<JobSummary>(),

    supabase
      .from('estimate_rows')
      .select([
        'sr_no', 'part_number', 'part_description', 'defect', 'action',
        'qty', 'ndp_value', 'cut_weld_charges', 'paint_charges',
        'total_special_charges', 'job_code', 'job_code_desc', 'no_off', 'labour_charges',
      ].join(', '))
      .eq('job_card_id', jobCardId)
      .order('sr_no'),
  ])

  if (sumRes.error || !sumRes.data)
    throw new Error(`Job card not found: ${sumRes.error?.message ?? 'no data'}`)
  if (estRes.error)
    throw new Error(`Estimate rows: ${estRes.error.message}`)

  return { jc: sumRes.data, rows: (estRes.data ?? []) as unknown as EstimateRow[] }
}

// ─── Sheet 1: Guidelines ──────────────────────────────────────────────────────

function buildGuidelinesSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Guidelines')
  ws.getColumn(1).width = 120

  const titleRow = ws.addRow(['TATA MOTORS — PAINT RUST CLAIM GUIDELINES'])
  titleRow.height = 36
  const tc = titleRow.getCell(1)
  tc.font      = { bold: true, size: 16, color: { argb: WHITE }, name: 'Calibri' }
  tc.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  tc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  ws.addRow([])

  const sections: Array<{ heading?: string; text?: string }> = [
    { heading: 'Applicability' },
    { text: '•  This format is common for Paint Rust Cases within and Outside Warranty.' },
    { text: '•  All Paint Rust warranty / goodwill claims must be submitted using this format only.' },
    { text: '•  Cases outside warranty require prior approval from TML Area / Regional Office before repair.' },

    { heading: 'Documentation Required' },
    { text: '•  Service History: Upload complete service history of the vehicle.' },
    { text: '•  Job Card Video: Record a video of the job card clearly showing all defect details.' },
    { text: '•  Delivery Video: Record a video of the vehicle at final delivery to customer.' },
    { text: '•  Pre-Repair PPT: Upload pre-repair PPT with defect and primer photos (geo-tagged).' },
    { text: '•  Post-Repair PPT: Upload post-repair PPT with final paint photos (geo-tagged).' },
    { text: '•  This Excel Estimate: Filled-in paint claim format with all charges.' },

    { heading: 'Photo Requirements' },
    { text: '•  All photos must be geo-tagged with GPS location and timestamp enabled.' },
    { text: '•  Defect photos must clearly show the rust / paint defect on each panel.' },
    { text: '•  Primer photos must be taken after sanding and before painting.' },
    { text: '•  Final paint photos must be taken after complete repair and polish.' },
    { text: '•  Minimum 1 photo per photo type per panel is mandatory.' },

    { heading: 'Estimate Format Rules' },
    { text: '•  Part NDP values must match the current TML parts price list.' },
    { text: '•  Labour charges must match the approved labour rate for the dealer city category.' },
    { text: '•  Cut & Weld charges are applicable only where structural repair is performed.' },
    { text: '•  Paint charges must follow the approved paint rate per panel as per TML service update.' },
    { text: '•  Total Expenses = (1) NDP Value + (2) Total Special Charges + (3) Labour Charges.' },

    { heading: 'Claim Submission' },
    { text: '•  Claim must be submitted within 30 days of repair completion.' },
    { text: '•  Incomplete documentation will result in claim rejection without appeal.' },
    { text: '•  TML share is determined by vehicle age from Date of Sale at time of complaint.' },
    { text: "•  All claims are subject to TML audit and field inspection at TML's discretion." },

    { heading: 'TML Share Schedule (Body & Paint Warranty)' },
    { text: '•  Year 1  (0 – 365 days from Date of Sale)    : TML bears 100% of approved cost.' },
    { text: '•  Year 2  (366 – 730 days from Date of Sale)  : TML bears  50% of approved cost.' },
    { text: '•  Year 3  (731 – 1095 days from Date of Sale) : TML bears  25% of approved cost.' },
    { text: '•  Beyond 1095 days                             : No TML share; dealer / customer bears cost.' },
  ]

  for (const item of sections) {
    if (item.heading) {
      ws.addRow([])
      const hr = ws.addRow([item.heading.toUpperCase()])
      hr.height = 22
      const c = hr.getCell(1)
      c.font      = { bold: true, size: 11, color: { argb: WHITE }, name: 'Calibri' }
      c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY_MID } }
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    } else {
      const tr = ws.addRow([item.text ?? ''])
      tr.height = 18
      const c = tr.getCell(1)
      c.font      = { size: 10, name: 'Calibri' }
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
    }
  }
}

// ─── Sheet 2: Paint Claim Format ─────────────────────────────────────────────

function buildEstimateSheet(
  wb:        ExcelJS.Workbook,
  jc:        JobSummary,
  estRows:   EstimateRow[],
) {
  // Row layout constants
  const DATA_START  = 8
  const DATA_END    = DATA_START + Math.max(estRows.length - 1, 0)
  const SUBTOTAL_R  = DATA_END + (estRows.length > 0 ? 1 : 0)
  const TML_ROW     = SUBTOTAL_R + 1
  const COL_HDR_ROW = 7

  const ws = wb.addWorksheet('Paint Claim Format', {
    views: [{ state: 'frozen', ySplit: 7, xSplit: 0 }],
  })

  // Column widths for A(1)–O(15)
  const COL_W = [8, 18, 32, 22, 12, 8, 16, 24, 30, 28, 22, 18, 22, 9, 16]
  COL_W.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── Merges for header block rows 1-5 ─────────────────────────────────────
  // Per-row layout: A=label1 | B:C=value1 | D=spacer | E=label2 | F=value2 | G=label3 | H:O=value3
  for (let r = 1; r <= 5; r++) {
    ws.mergeCells(r, 2, r, 3)    // B:C  → value1
    ws.mergeCells(r, 8, r, 15)   // H:O  → value3 (8 cols of wide right section)
  }

  const ageDays = jc.warranty_age_days ?? null

  // [label1, value1, label2, value2, label3, value3]
  type HRow = [string, unknown, string, unknown, string, unknown]
  const hRows: HRow[] = [
    ['Chassis Number',       jc.vin          ?? '—',  'Date of Sale',          fmtDate(jc.date_of_sale),   'Colour of Car',        jc.colour          ?? '—'],
    ['Registration Number',  jc.reg_number   ?? '—',  'Complaint Report Date', fmtDate(jc.complaint_date), 'B&P City Category',    jc.bp_city_category ?? '—'],
    ['Dealer Code',          jc.dealer_code  ?? '—',  'Vehicle Age',           ageDays != null ? `${ageDays} days` : '—', 'Paint Type', jc.paint_type ?? '—'],
    ['Dealer',               jc.dealer_name  ?? '—',  'Years / Months',        ageToYM(ageDays),            'Total Expenses (1+2+3)', null],
    ['Dealer City',          jc.dealer_city  ?? '—',  'Cumm. KMS',             jc.km_reading ?? '—',        '', ''],
  ]

  hRows.forEach(([l1, v1, l2, v2, l3, v3], idx) => {
    const r = idx + 1
    ws.getRow(r).height = 28

    // label style
    const lStyle = (cell: ExcelJS.Cell, val: unknown) => {
      cell.value     = val as ExcelJS.CellValue
      cell.font      = { bold: true, size: 10, name: 'Calibri', color: { argb: NAVY } }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_LABEL } }
      cell.alignment = { vertical: 'middle', wrapText: true }
      border(cell)
    }
    // value style
    const vStyle = (cell: ExcelJS.Cell, val: unknown) => {
      cell.value     = val as ExcelJS.CellValue
      cell.font      = { size: 10, name: 'Calibri' }
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      cell.alignment = { vertical: 'middle', wrapText: false }
      border(cell)
    }

    lStyle(ws.getCell(r, 1), l1)   // A: label1
    vStyle(ws.getCell(r, 2), v1)   // B:C merged: value1
    lStyle(ws.getCell(r, 4), '')   // D: spacer (empty label style)
    lStyle(ws.getCell(r, 5), l2)   // E: label2
    vStyle(ws.getCell(r, 6), v2)   // F: value2
    lStyle(ws.getCell(r, 7), l3)   // G: label3

    // Row 4: Total Expenses value gets a live SUM formula
    if (r === 4 && l3 === 'Total Expenses (1+2+3)') {
      // Only reference subtotal row if we have data rows
      const tCell = ws.getCell(r, 8)  // H:O merged
      tCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } }
      tCell.alignment = { vertical: 'middle' }
      border(tCell)
      if (estRows.length > 0) {
        tCell.value   = { formula: `${colLetter(7)}${SUBTOTAL_R}+${colLetter(11)}${SUBTOTAL_R}+${colLetter(15)}${SUBTOTAL_R}`, result: 0 }
        tCell.numFmt  = '[$₹-4009]#,##0.00'
        tCell.font    = { bold: true, size: 11, name: 'Calibri', color: { argb: NAVY } }
      } else {
        tCell.value = '—'
        tCell.font  = { size: 10, name: 'Calibri' }
      }
    } else {
      vStyle(ws.getCell(r, 8), v3)   // H:O merged: value3
    }
  })

  // Apply gold top border on the entire header block (visual accent)
  for (let c = 1; c <= 15; c++) {
    const cell = ws.getCell(1, c)
    cell.border = { ...cell.border, top: { style: 'medium', color: { argb: GOLD } } }
  }

  // ── Blank row 6 ───────────────────────────────────────────────────────────
  ws.getRow(6).height = 6

  // ── Column header row 7 ───────────────────────────────────────────────────
  const COL_HEADERS = [
    'Sr.No',
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
  ]

  const hdrRow = ws.getRow(COL_HDR_ROW)
  hdrRow.height = 54

  COL_HEADERS.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 1)
    cell.value     = h
    cell.font      = { bold: true, size: 9, name: 'Calibri', color: { argb: WHITE } }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    border(cell)
  })

  // Gold bottom border on column header row
  for (let c = 1; c <= 15; c++) {
    const cell = ws.getCell(COL_HDR_ROW, c)
    cell.border = { ...cell.border, bottom: { style: 'medium', color: { argb: GOLD } } }
  }

  // ── Data rows (rows 8 to DATA_END) ────────────────────────────────────────
  const CURRENCY_COLS = new Set([7, 8, 9, 10, 11, 15])  // G H I J K O
  const INR_FMT = '[$₹-4009]#,##0.00'

  estRows.forEach((er, idx) => {
    const r   = DATA_START + idx
    const row = ws.getRow(r)
    row.height = 18

    const values: unknown[] = [
      er.sr_no,
      er.part_number      ?? '',
      er.part_description ?? '',
      er.defect           ?? '',
      er.action           ?? '',
      er.qty,
      er.ndp_value,
      er.cut_weld_charges,
      '',                           // Paint Paid (not in schema — left blank for manual entry)
      er.paint_charges,
      er.total_special_charges,
      er.job_code         ?? '',
      er.job_code_desc    ?? '',
      er.no_off,
      er.labour_charges,
    ]

    values.forEach((v, ci) => {
      const c    = ci + 1
      const cell = row.getCell(c)
      cell.value     = v as ExcelJS.CellValue
      cell.font      = { size: 9, name: 'Calibri' }
      cell.alignment = { vertical: 'middle' }
      if (CURRENCY_COLS.has(c)) {
        cell.numFmt    = INR_FMT
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      }
      border(cell)
    })
  })

  // ── Sub-Total row ─────────────────────────────────────────────────────────
  if (estRows.length > 0) {
    const stRow = ws.getRow(SUBTOTAL_R)
    stRow.height = 22

    // Label in col A; SUM formulas in cols G, H, J, K, N, O; borders everywhere
    for (let c = 1; c <= 15; c++) {
      const cell = stRow.getCell(c)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTOTAL_F } }
      cell.font = { bold: true, size: 9, name: 'Calibri', color: { argb: NAVY } }
      border(cell)

      if (c === 1) {
        cell.value     = 'Sub Total'
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        continue
      }

      // Cols that get SUM: G(7) H(8) J(10) K(11) N(14) O(15)
      if ([7, 8, 10, 11, 14, 15].includes(c)) {
        cell.value     = { formula: `SUM(${colLetter(c)}${DATA_START}:${colLetter(c)}${DATA_END})`, result: 0 }
        cell.numFmt    = INR_FMT
        cell.alignment = { vertical: 'middle', horizontal: 'right' }
      }
    }
  }

  // ── TML / Dealer share info line ──────────────────────────────────────────
  if (jc.tml_share_percent != null) {
    ws.mergeCells(TML_ROW, 1, TML_ROW, 15)
    const infoCell = ws.getCell(TML_ROW, 1)
    const pct      = jc.tml_share_percent
    infoCell.value     = `TML Share: ${pct}%    |    Dealer Share: ${100 - pct}%    |    Warranty Age: ${ageDays ?? '—'} days  (${ageToYM(ageDays)})`
    infoCell.font      = { italic: true, size: 9, name: 'Calibri', color: { argb: NAVY } }
    infoCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_LABEL } }
    infoCell.alignment = { vertical: 'middle', horizontal: 'center' }
    border(infoCell)
  }

  // Ensure all header block cells also have borders (merged cells need explicit border on the master cell)
  applyBorders(ws, 1, 5, 1, 7)
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function generateEstimateExcel(
  jobCardId: string,
  options?: { download?: boolean; fileName?: string },
): Promise<Blob> {
  const { jc, rows } = await fetchData(jobCardId)

  const wb = new ExcelJS.Workbook()
  wb.creator  = jc.dealer_name ?? 'Tata Motors Dealership'
  wb.company  = 'Tata Motors Limited'
  wb.created  = new Date()
  wb.modified = new Date()

  buildGuidelinesSheet(wb)
  buildEstimateSheet(wb, jc, rows)

  const buffer = await wb.xlsx.writeBuffer()
  const blob   = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const defaultName = `Paint_Estimate_${(jc.reg_number ?? jobCardId).replace(/\s+/g, '_')}.xlsx`
  const fileName = options?.fileName || defaultName

  if (options?.download !== false) {
    const url  = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href     = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return blob
}
