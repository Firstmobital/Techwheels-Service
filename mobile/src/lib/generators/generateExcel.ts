/**
 * generateEstimateExcel — Tata Motors Paint Claim Estimate Excel generator
 *
 * Matches the EXACT required format: " Paint Claim Format" sheet layout
 *
 * Sheet 1: "Guidelines"
 * Sheet 2: " Paint Claim Format"
 *
 * Layout (all data cols B–P, col A is narrow blank):
 *
 *  Row 1  : blank
 *  Row 2  : Title " Paint Estimate Format" in D2 (cyan fill FF3BCCFF), merged D2:P2
 *  Row 3  : blank
 *  Row 4  : Header block row 1 — Chassis / Date of Sale / Colour+AgingNote
 *  Row 5  : Header block row 2 — Reg No / Complaint Date / B&P City Category
 *  Row 6  : Header block row 3 — Dealer Code / Vehicle Age / Paint Type
 *  Row 7  : Header block row 4 — Dealer / Years-Months / Total Expenses
 *  Row 8  : Header block row 5 — Dealer City / Cumm KMS / (blank)
 *  Row 9  : blank
 *  Row 10 : Column header row  (cyan FF3BCCFF, bold, wrapped)
 *  Row 11 : Sub-header notes row
 *  Row 12+: Data rows
 *  Last   : Sub-Total row
 *
 * Columns B–P (15 data cols, 1-indexed as 2–16):
 *  B=Sr.No  C=Part Number  D=Part Description  E=Defect  F=Repair  G=Part QTY
 *  H=1-Part NDP Value  I=Cut & Weld(A)  J=Paint Paid  K=Paint Warranty(B)
 *  L=2-Total Special(A+B)  M=Job code remove-refit  N=Job code Desc  O=No.off  P=3-Labour chgs
 */

import ExcelJS from 'exceljs'
import { supabase } from '../supabase'

// ─── Colours (ARGB 8-char) ────────────────────────────────────────────────────
const CYAN_HDR   = 'FF3BCCFF'   // cyan — title + column header fill (exact match to required)
const YELLOW_AGE = 'FFFFFF00'   // yellow — aging note cell M4
const WHITE      = 'FFFFFFFF'
const BLACK      = 'FF000000'

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
  panel_name:            string | null
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
  paint_paid_charges?:   number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return d }
}

function ageToYM(days: number | null): string {
  if (days == null) return ''
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  return `${y} Yr${y !== 1 ? 's' : ''} ${m} Months`
}

function ageNote(days: number | null): string {
  if (days == null) return ''
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  return `AGEING ${y} YEAR${y !== 1 ? 's' : ''} ${m} Months For WARRANTY CONSIDERATION`
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
const side = (argb = BLACK) => ({ style: THIN, color: { argb } }) as ExcelJS.Border

function borderAll(cell: ExcelJS.Cell, color = BLACK) {
  const s = side(color)
  cell.border = { top: s, left: s, bottom: s, right: s }
}

// ─── Edge function data fetch ─────────────────────────────────────────────────

async function fetchData(jobCardId: string) {
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
  if (!SUPABASE_URL) throw new Error('Supabase URL not configured')

  const { data: auth } = await supabase.auth.getSession()
  const token = auth?.session?.access_token
  if (!token) throw new Error('Not authenticated. Please log in again.')

  const res = await fetch(`${SUPABASE_URL}/functions/v1/estimate-export-data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ jobCardId }),
  })

  if (!res.ok) {
    const errText = await res.text()
    let errData
    try { errData = JSON.parse(errText) } catch { errData = { error: errText } }
    throw new Error(errData.error ?? `Failed to fetch estimate data (HTTP ${res.status})`)
  }

  const result = await res.json()
  if (!result.jc) throw new Error('No job card data returned from edge function')

  return {
    jc:   result.jc   as JobSummary,
    rows: (result.rows ?? []) as EstimateRow[],
  }
}

// ─── Sheet 1: Guidelines (exact TML text) ────────────────────────────────────

function buildGuidelinesSheet(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet('Guidelines')
  ws.getColumn(1).width = 2   // col A narrow (blank)
  ws.getColumn(2).width = 120 // col B wide — content

  const lines = [
    { type: 'blank' },
    { type: 'heading', text: 'Guidelines' },
    { type: 'blank' },
    { type: 'text', text: 'This format is common for Paint Rust Cases within and Outside Warranty' },
    { type: 'text', text: 'Please fill up all the fields' },
    { type: 'text', text: 'Part Number and QTY not necessary if the replacement is not to be done' },
    { type: 'text', text: 'Submit the estimate with the Defect Photos for repair approval' },
    { type: 'blank' },
    { type: 'heading', text: 'Photo Requirements' },
    { type: 'blank' },
    { type: 'text', text: 'All photos must be geo-tagged with GPS location and timestamp enabled.' },
    { type: 'text', text: 'Defect photos must clearly show the rust / paint defect on each panel.' },
    { type: 'text', text: 'Primer photos must be taken after sanding and before painting.' },
    { type: 'text', text: 'Final paint photos must be taken after complete repair and polish.' },
    { type: 'blank' },
    { type: 'heading', text: 'TML Share Schedule (Body & Paint Warranty)' },
    { type: 'blank' },
    { type: 'text', text: 'Year 1 (0–365 days from Date of Sale)    : TML bears 100% of approved cost.' },
    { type: 'text', text: 'Year 2 (366–730 days from Date of Sale)  : TML bears 50% of approved cost.' },
    { type: 'text', text: 'Year 3 (731–1095 days from Date of Sale) : TML bears 25% of approved cost.' },
    { type: 'text', text: 'Beyond 1095 days                          : No TML share; dealer/customer bears cost.' },
  ]

  for (const item of lines) {
    if (item.type === 'blank') {
      ws.addRow([])
    } else if (item.type === 'heading') {
      const row = ws.addRow(['', item.text])
      row.height = 20
      const c = row.getCell(2)
      c.font      = { bold: true, size: 12, name: 'Calibri', color: { argb: WHITE } }
      c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF002B5C' } }
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    } else {
      const row = ws.addRow(['', item.text])
      row.height = 16
      const c = row.getCell(2)
      c.font      = { size: 10, name: 'Calibri' }
      c.alignment = { vertical: 'middle', horizontal: 'left', indent: 2 }
    }
  }
}

// ─── Sheet 2: Paint Claim Format ─────────────────────────────────────────────

function buildEstimateSheet(
  wb:      ExcelJS.Workbook,
  jc:      JobSummary,
  estRows: EstimateRow[],
) {
  // ── Row indices ────────────────────────────────────────────────────────────
  const TITLE_ROW   = 2
  const HDR_START   = 4    // first header info row
  const HDR_END     = 8    // last header info row
  const COL_HDR_ROW = 10
  const NOTE_ROW    = 11
  const DATA_START  = 12
  const DATA_END    = DATA_START + Math.max(estRows.length, 1) - 1
  const SUBTOTAL_R  = DATA_END + 1

  const ws = wb.addWorksheet(' Paint Claim Format', {
    views: [{ state: 'frozen', ySplit: 11, xSplit: 0 }],
  })

  // ── Column widths (A=1 … Q=17) ────────────────────────────────────────────
  // Matches exact widths from required file
  const widths = [5, 7, 17.5, 31.5, 11.9, 10, 9, 15.1, 22.4, 18.9, 22.6, 17.4, 13.1, 17.6, 6.4, 12.4, 16]
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  // ── Row heights ────────────────────────────────────────────────────────────
  ws.getRow(TITLE_ROW).height   = 18
  for (let r = HDR_START; r <= HDR_END; r++) {
    ws.getRow(r).height = r === 5 ? 30 : 15
  }
  ws.getRow(COL_HDR_ROW).height = 70.5
  ws.getRow(NOTE_ROW).height    = 38.25

  // ── Row 2: Title ──────────────────────────────────────────────────────────
  // Merge D2:P2  (cols 4–16)
  ws.mergeCells(TITLE_ROW, 4, TITLE_ROW, 16)
  const titleCell = ws.getCell(TITLE_ROW, 4)
  titleCell.value     = ' Paint Estimate Format'
  titleCell.font      = { bold: true, size: 14, name: 'Calibri' }
  titleCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: CYAN_HDR } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }

  // ── Rows 4-8: Header info block ───────────────────────────────────────────
  // Merge pattern (from required file):
  //   D:F  (cols 4-6)  → value1
  //   G:H  (cols 7-8)  → label2
  //   M:P  (cols 13-16)→ aging note (row 4 only)
  //   J:K  (cols 10-11)→ label3 (rows 4-7)
  for (let r = HDR_START; r <= HDR_END; r++) {
    ws.mergeCells(r, 4, r, 6)    // D:F = value1
    ws.mergeCells(r, 7, r, 8)    // G:H = label2
  }
  // M:P merge for aging note on row 4
  ws.mergeCells(HDR_START, 13, HDR_START, 16)    // M4:P4
  // J:K merge for label3 rows 4-7
  for (let r = HDR_START; r <= 7; r++) {
    ws.mergeCells(r, 10, r, 11)   // J:K
  }

  const ageDays  = jc.warranty_age_days ?? null
  const totalExp = estRows.reduce((s, r) =>
    s + (r.ndp_value || 0) + (r.total_special_charges || 0) + (r.labour_charges || 0), 0)

  // [C-label, D:F-value, G:H-label2, I-value2, J:K-label3, L-value3]
  type HRow = [string, unknown, string, unknown, string, unknown]
  const hdrData: HRow[] = [
    ['Chassis number',      jc.vin           ?? '',  'Date of sale',          fmtDate(jc.date_of_sale),   'Colour of Car',          jc.colour       ?? ''],
    ['Registration\nNumber',jc.reg_number    ?? '',  'Complaint Report Date', fmtDate(jc.complaint_date), 'B&P City Category (Refer SU794)', jc.bp_city_category ?? ''],
    ['Dealer Code',         jc.dealer_code   ?? '',  'Vehicle Age',           ageDays != null ? `${ageDays}` : '', 'Paint Type',    jc.paint_type   ?? ''],
    ['Dealer',              jc.dealer_name   ?? '',  'Years/Months',          ageToYM(ageDays),            'Total Expenses (1+2+3)', totalExp > 0 ? totalExp : ''],
    ['Dealer City',         jc.dealer_city   ?? '',  'Cumm. KMS',             jc.km_reading ?? '',         '',                       ''],
  ]

  const labelStyle = (cell: ExcelJS.Cell, val: unknown, sz = 11) => {
    cell.value     = val as ExcelJS.CellValue
    cell.font      = { bold: true, size: sz, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    borderAll(cell)
  }
  const valueStyle = (cell: ExcelJS.Cell, val: unknown, sz = 12) => {
    cell.value     = val as ExcelJS.CellValue
    cell.font      = { bold: true, size: sz, name: 'Calibri' }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: WHITE } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false }
    borderAll(cell)
  }

  hdrData.forEach(([lbl1, val1, lbl2, val2, lbl3, val3], idx) => {
    const r = HDR_START + idx

    // C = label1
    labelStyle(ws.getCell(r, 3), lbl1)
    // D:F merged = value1
    valueStyle(ws.getCell(r, 4), val1)
    // G:H merged = label2
    labelStyle(ws.getCell(r, 7), lbl2)
    // I = value2
    valueStyle(ws.getCell(r, 9), val2)
    // J:K merged = label3
    labelStyle(ws.getCell(r, 10), lbl3)
    // L = value3
    valueStyle(ws.getCell(r, 12), val3, 11)
  })

  // Row 4: Aging note in M4:P4 (yellow fill)
  const ageNoteCell = ws.getCell(HDR_START, 13)
  ageNoteCell.value     = ageNote(ageDays)
  ageNoteCell.font      = { bold: true, size: 11, name: 'Calibri' }
  ageNoteCell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW_AGE } }
  ageNoteCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  borderAll(ageNoteCell)

  // ── Row 10: Column headers ────────────────────────────────────────────────
  const COL_HEADERS = [
    'Sr. No.',
    'Part Number',
    'Part \nDescription',
    'Defect',
    'Repair',
    'Part QTY',
    '1-Part NDP Value ',
    'Cut & Weld Special Charges\n(A)',
    'Paint Paid Charges applicable as per \nService Update\n',
    'Paint Charges applicable for Warranty\n( B )',
    '2-Total Special Charges\n(A+B)',
    'Job code for remove - refit',
    'Job code Description',
    'No.off',
    '3-Labour chgs **\n(Read the Note above)',
  ]

  const hdrRow = ws.getRow(COL_HDR_ROW)
  COL_HEADERS.forEach((h, i) => {
    const cell = hdrRow.getCell(i + 2)  // starts at col B (2)
    cell.value     = h
    cell.font      = { bold: true, size: 10, name: 'Calibri' }
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: CYAN_HDR } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    borderAll(cell)
  })

  // ── Row 11: Sub-header notes ──────────────────────────────────────────────
  // Merge B11:H11 and M11:P11 (from required file)
  ws.mergeCells(NOTE_ROW, 2, NOTE_ROW, 8)    // B:H
  ws.mergeCells(NOTE_ROW, 13, NOTE_ROW, 16)  // M:P

  const noteStyle = (cell: ExcelJS.Cell, val: string, align: 'center' | 'left' = 'center') => {
    cell.value     = val
    cell.font      = { bold: true, size: 10, name: 'Calibri' }
    cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true }
    borderAll(cell)
  }

  noteStyle(ws.getCell(NOTE_ROW, 2),
    'Part QTY and NDP amount is applicable only if the part replacement is required\nPut the Part NDP value as per the TMPVL Invoice ')
  noteStyle(ws.getCell(NOTE_ROW, 9),
    'Applicable for Body noise Issue Only (cutting and welding) ')
  noteStyle(ws.getCell(NOTE_ROW, 10), 'Refer Various Service Udpates', 'left')
  noteStyle(ws.getCell(NOTE_ROW, 11), '70% for 2 Parts case\n60% for more than 2 parts case', 'left')
  noteStyle(ws.getCell(NOTE_ROW, 12), 'Job code 980016')
  noteStyle(ws.getCell(NOTE_ROW, 13),
    'Check the Info Center for Warranty Job code and Man hours\nRefer SB201DZ - Warranty Labour Rates Revision wef 1st Apr 2018')

  // ── Data rows (12 onwards) ─────────────────────────────────────────────────
  const CURRENCY_COLS = new Set([8, 9, 10, 11, 12, 16])  // H I J K L P (1-indexed)

  const rowsToRender = estRows.length > 0 ? estRows : [{
    sr_no: 1, panel_name: '', part_number: 'N/A', part_description: '',
    defect: '', action: '', qty: 0, ndp_value: 0, cut_weld_charges: 0,
    paint_charges: 0, total_special_charges: 0,
    job_code: '', job_code_desc: '', no_off: 0, labour_charges: 0,
  } as EstimateRow]

  rowsToRender.forEach((er, idx) => {
    const r   = DATA_START + idx
    const row = ws.getRow(r)
    row.height = 15

    // [B, C, D, E, F, G, H, I, J, K, L, M, N, O, P]
    const values: unknown[] = [
      er.sr_no,
      er.part_number      ?? 'N/A',
      er.part_description ?? er.panel_name ?? '',
      er.defect           ?? '',
      er.action           ?? '',
      er.qty              ?? 0,
      er.ndp_value        ?? 0,
      er.cut_weld_charges ?? 0,
      (er as EstimateRow & { paint_paid_charges?: number }).paint_paid_charges ?? 0,
      er.paint_charges    ?? 0,
      er.total_special_charges ?? 0,
      er.job_code         ?? '',
      er.job_code_desc    ?? '',
      er.no_off           ?? 0,
      er.labour_charges   ?? 0,
    ]

    values.forEach((v, ci) => {
      const colIdx = ci + 2   // cols B(2)–P(16)
      const cell   = row.getCell(colIdx)
      cell.value     = v as ExcelJS.CellValue
      cell.font      = { size: 10, name: 'Calibri' }
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      borderAll(cell)
      if (CURRENCY_COLS.has(colIdx)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
      }
    })

    // Bold numeric columns (G–P) as per required format
    for (let c = 7; c <= 16; c++) {
      const cell = row.getCell(c)
      cell.font = { ...cell.font as ExcelJS.Font, bold: true }
    }
  })

  // ── Sub-Total row ─────────────────────────────────────────────────────────
  const stRow  = ws.getRow(SUBTOTAL_R)
  stRow.height = 15

  // B:B = blank, C = "Sub Total", then H I K L P get SUM
  for (let c = 2; c <= 16; c++) {
    const cell = stRow.getCell(c)
    cell.font = { bold: true, size: 10, name: 'Calibri' }
    borderAll(cell)
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
  }

  stRow.getCell(3).value = 'Sub Total'

  // SUM cols: H(8), I(9), K(11), L(12), P(16)
  const sumCols = [8, 9, 11, 12, 16]
  sumCols.forEach(c => {
    const cell = stRow.getCell(c)
    cell.value = {
      formula: `SUM(${colLetter(c)}${DATA_START}:${colLetter(c)}${DATA_END})`,
      result: estRows.reduce((s, er) => {
        if (c === 8)  return s + (er.ndp_value ?? 0)
        if (c === 9)  return s + (er.cut_weld_charges ?? 0)
        if (c === 11) return s + (er.paint_charges ?? 0)
        if (c === 12) return s + (er.total_special_charges ?? 0)
        if (c === 16) return s + (er.labour_charges ?? 0)
        return s
      }, 0),
    }
  })
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
  const fileName = options?.fileName ?? defaultName

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
