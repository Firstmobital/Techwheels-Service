/**
 * generate-workflow-chart.js
 * Creates a clean workflow chart PPT for the CRM DMS scraping process.
 */

import PptxGenJS from 'pptxgenjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const NAVY  = '002B5C'
const BLUE  = '003DA5'
const GOLD  = 'C9A84C'
const WHITE = 'FFFFFF'
const GREEN = '276749'
const LGRAY = 'F2F4F8'
const DGRAY = '2D3748'
const RED   = 'C53030'
const TEAL  = '0D7377'
const W = 10
const H = 5.625

async function main() {
  const prs = new PptxGenJS()
  prs.layout  = 'LAYOUT_16x9'
  prs.title   = 'CRM DMS Workflow Chart'
  prs.author  = 'First Mobital Pvt. Ltd.'

  // ── Slide 1: Full Workflow Chart ────────────────────────────────────────────
  const slide = prs.addSlide()

  // Background
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: LGRAY } })

  // Header
  slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.72, fill: { color: NAVY } })
  slide.addShape('rect', { x: 0, y: 0, w: 0.16, h: 0.72, fill: { color: GOLD } })
  slide.addShape('rect', { x: 0, y: 0.72, w: W, h: 0.06, fill: { color: GOLD } })
  slide.addText('CRM DMS — Vehicle Data Extraction Workflow', {
    x: 0.3, y: 0, w: 7, h: 0.72,
    fontSize: 18, bold: true, color: WHITE, fontFace: 'Calibri', valign: 'middle',
  })
  slide.addText('FIRST MOBITAL PVT. LTD.', {
    x: 7.2, y: 0, w: 2.6, h: 0.72,
    fontSize: 10, color: GOLD, fontFace: 'Calibri', align: 'right', valign: 'middle', bold: true,
  })

  // Footer
  slide.addShape('rect', { x: 0, y: H - 0.3, w: W, h: 0.3, fill: { color: GOLD } })
  slide.addText('Tata Motors PV CRM DMS  |  carsdms.inservices.tatamotors.com', {
    x: 0.2, y: H - 0.3, w: W - 0.4, h: 0.3,
    fontSize: 8, bold: true, color: NAVY, fontFace: 'Calibri', align: 'center', valign: 'middle',
  })

  // ── Helper: draw a box ──────────────────────────────────────────────────────
  function box(x, y, w, h, label, sublabel, color, textColor = WHITE, fontSize = 9) {
    slide.addShape('rect', {
      x, y, w, h,
      fill: { color },
      line: { color: color, width: 0 },
      shadow: { type: 'outer', color: '999999', blur: 3, offset: 1, angle: 45 },
    })
    slide.addText(label, {
      x: x + 0.05, y, w: w - 0.1, h: sublabel ? h * 0.55 : h,
      fontSize, bold: true, color: textColor, fontFace: 'Calibri',
      align: 'center', valign: sublabel ? 'bottom' : 'middle',
    })
    if (sublabel) {
      slide.addText(sublabel, {
        x: x + 0.05, y: y + h * 0.55, w: w - 0.1, h: h * 0.45,
        fontSize: fontSize - 1, color: textColor, fontFace: 'Calibri',
        align: 'center', valign: 'top',
      })
    }
  }

  // ── Helper: arrow down ──────────────────────────────────────────────────────
  function arrowDown(x, y, len = 0.18) {
    slide.addShape('line', {
      x, y, w: 0, h: len,
      line: { color: DGRAY, width: 1.5 },
      arrows: { end: { type: 'arrow', size: 2 } },
    })
  }

  // ── Helper: arrow right ─────────────────────────────────────────────────────
  function arrowRight(x, y, len = 0.22) {
    slide.addShape('line', {
      x, y, w: len, h: 0,
      line: { color: DGRAY, width: 1.5 },
      arrows: { end: { type: 'arrow', size: 2 } },
    })
  }

  // ── Helper: diamond (decision) ──────────────────────────────────────────────
  function diamond(x, y, w, h, label, color) {
    // Draw as rotated rectangle using points
    const cx = x + w / 2, cy = y + h / 2
    slide.addShape('rect', {
      x: cx - w * 0.35, y: cy - h * 0.5,
      w: w * 0.7, h: h,
      fill: { color },
      rotate: 45,
    })
    slide.addText(label, {
      x, y: y + h * 0.2, w, h: h * 0.6,
      fontSize: 7.5, bold: true, color: WHITE, fontFace: 'Calibri',
      align: 'center', valign: 'middle',
    })
  }

  // ── Layout: 3 columns ───────────────────────────────────────────────────────
  // Column 1: Setup (Login + Navigate)   x=0.25
  // Column 2: Search loop                x=3.7
  // Column 3: Data extraction            x=7.0

  const BW  = 2.3   // box width
  const BH  = 0.46  // box height
  const ROW = [0.88, 1.5, 2.12, 2.74, 3.36, 3.98, 4.5]

  // ── COLUMN 1: SETUP (done once) ─────────────────────────────────────────────
  const C1 = 0.22

  // "START" oval
  slide.addShape('ellipse', { x: C1 + 0.35, y: 0.82, w: 1.55, h: 0.42, fill: { color: NAVY } })
  slide.addText('START', { x: C1 + 0.35, y: 0.82, w: 1.55, h: 0.42, fontSize: 11, bold: true, color: GOLD, fontFace: 'Calibri', align: 'center', valign: 'middle' })

  arrowDown(C1 + 1.12, 1.24, 0.18)

  box(C1, 1.42, BW, BH, '① LOGIN TO CRM', 'Enter User ID + Password → Click Login', NAVY, WHITE, 8)
  arrowDown(C1 + 1.15, 1.88, 0.18)

  box(C1, 2.06, BW, BH, '② CLICK VEHICLES TAB', 'Top navigation → "Vehicles"', BLUE, WHITE, 8)
  arrowDown(C1 + 1.15, 2.52, 0.18)

  box(C1, 2.70, BW, BH, '③ SELECT VIEW', '"All Visible Vehicles" dropdown', BLUE, WHITE, 8)
  arrowDown(C1 + 1.15, 3.16, 0.18)

  // "ONCE" badge
  slide.addShape('rect', { x: C1, y: 1.35, w: BW, h: 1.95, fill: { type: 'none' }, line: { color: GOLD, width: 2, dashType: 'dash' } })
  slide.addText('DONE ONCE PER SESSION', {
    x: C1 + 0.06, y: 1.35, w: BW - 0.12, h: 0.22,
    fontSize: 6.5, bold: true, color: GOLD, fontFace: 'Calibri', align: 'center',
  })

  // Load Queue box
  box(C1, 3.34, BW, BH, '④ LOAD CHASSIS QUEUE', 'Fetch pending chassis Nos. from backend', TEAL, WHITE, 8)

  // Arrow right to column 2
  arrowRight(C1 + BW, 3.57, 0.48)

  // ── COLUMN 2: SEARCH LOOP ───────────────────────────────────────────────────
  const C2 = 3.68

  box(C2, 0.88, BW, BH, '⑤ PICK NEXT CHASSIS NO.', 'From the pending queue list', TEAL, WHITE, 8)
  arrowDown(C2 + 1.15, 1.34, 0.18)

  box(C2, 1.52, BW, BH, '⑥ CLICK SEARCH BUTTON', 'Magnifying glass icon in toolbar', BLUE, WHITE, 8)
  arrowDown(C2 + 1.15, 1.98, 0.18)

  box(C2, 2.16, BW, BH, '⑦ ENTER CHASSIS NO.', 'Paste in "Chassis No:" field (UPPERCASE)', BLUE, WHITE, 8)
  arrowDown(C2 + 1.15, 2.62, 0.18)

  box(C2, 2.80, BW, BH, '⑧ PRESS GO →', 'Execute query / press Enter', BLUE, WHITE, 8)
  arrowDown(C2 + 1.15, 3.26, 0.18)

  // Decision diamond
  diamond(C2, 3.36, BW, 0.72, 'Record\nFound?', RED)
  arrowDown(C2 + 1.15, 4.08, 0.18)

  // No branch (left)
  slide.addShape('line', { x: C2, y: 3.72, w: -0.4, h: 0, line: { color: RED, width: 1.2 }, arrows: { end: { type: 'arrow', size: 2 } } })
  slide.addText('NO', { x: C2 - 0.7, y: 3.58, w: 0.4, h: 0.28, fontSize: 8, bold: true, color: RED, fontFace: 'Calibri', align: 'center' })
  slide.addShape('rect', { x: C2 - 1.55, y: 4.12, w: 1.1, h: 0.38, fill: { color: RED } })
  slide.addText('Mark\nNOT_FOUND', { x: C2 - 1.55, y: 4.12, w: 1.1, h: 0.38, fontSize: 7, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })

  // Yes label
  slide.addText('YES', { x: C2 + 1.0, y: 4.0, w: 0.4, h: 0.24, fontSize: 8, bold: true, color: GREEN, fontFace: 'Calibri' })

  // Arrow right to column 3
  arrowRight(C2 + BW, 2.44, 0.5)

  // More chassis? decision
  box(C2, 4.26, BW, 0.4, '⑫ MORE CHASSIS?   → YES = loop back to ⑤', '', TEAL, WHITE, 7.5)

  // Loop back arrow (left side going up)
  slide.addShape('line', { x: C2, y: 4.46, w: -0.3, h: 0, line: { color: TEAL, width: 1.5 } })
  slide.addShape('line', { x: C2 - 0.3, y: 0.82 + 0.21, w: 0, h: 3.64, line: { color: TEAL, width: 1.5 } })
  slide.addShape('line', { x: C2 - 0.3, y: 1.09, w: 0.3, h: 0, line: { color: TEAL, width: 1.5 }, arrows: { end: { type: 'arrow', size: 2 } } })

  // ── COLUMN 3: DATA EXTRACTION ────────────────────────────────────────────────
  const C3 = 7.42

  box(C3, 0.88, BW, BH, '⑨ VEHICLE IS LOADED', 'All fields populated on screen', GREEN, WHITE, 8)
  arrowDown(C3 + 1.15, 1.34, 0.18)

  // Service Info box (taller)
  slide.addShape('rect', { x: C3, y: 1.52, w: BW, h: 1.1, fill: { color: BLUE }, shadow: { type: 'outer', color: '999999', blur: 3, offset: 1, angle: 45 } })
  slide.addText('⑩ SCRAPE SERVICE INFORMATION', { x: C3 + 0.05, y: 1.52, w: BW - 0.1, h: 0.35, fontSize: 8, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })
  const svcFields = ['Last Service Km • Last Service Dealer', 'Last Service Date • Next Service Date', 'Next Service Type • Odometer Reading']
  svcFields.forEach((f, i) => {
    slide.addText('• ' + f, { x: C3 + 0.1, y: 1.87 + i * 0.23, w: BW - 0.2, h: 0.22, fontSize: 7, color: LGRAY, fontFace: 'Calibri' })
  })

  arrowDown(C3 + 1.15, 2.62, 0.18)

  box(C3, 2.80, BW, BH, '⑪ CLICK "CONTACTS" TAB', 'Sub-tab below vehicle form', BLUE, WHITE, 8)
  arrowDown(C3 + 1.15, 3.26, 0.18)

  // Contacts extraction box
  slide.addShape('rect', { x: C3, y: 3.44, w: BW, h: 0.9, fill: { color: GREEN }, shadow: { type: 'outer', color: '999999', blur: 3, offset: 1, angle: 45 } })
  slide.addText('⑫ EXTRACT CUSTOMER CONTACTS ONLY', { x: C3 + 0.05, y: 3.44, w: BW - 0.1, h: 0.35, fontSize: 8, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })
  slide.addText('Filter: Contact Status = "Customer"', { x: C3 + 0.1, y: 3.79, w: BW - 0.2, h: 0.24, fontSize: 7.5, color: LGRAY, fontFace: 'Calibri', align: 'center' })
  slide.addText('Capture: First Name  +  Cell Phone No.', { x: C3 + 0.1, y: 4.03, w: BW - 0.2, h: 0.28, fontSize: 7.5, color: GOLD, fontFace: 'Calibri', align: 'center', bold: true })

  arrowDown(C3 + 1.15, 4.34, 0.18)

  box(C3, 4.52, BW, 0.38, '⑬ SAVE TO BACKEND (Supabase)', 'Mark chassis as "done" in queue', NAVY, WHITE, 7.5)

  // ── Legend ──────────────────────────────────────────────────────────────────
  const legendItems = [
    [NAVY, 'Setup / One-time'],
    [BLUE, 'Search Loop Steps'],
    [GREEN, 'Data Extraction'],
    [TEAL, 'Queue / Loop Control'],
    [RED, 'Error Handling'],
  ]
  slide.addText('LEGEND', { x: 0.25, y: 4.56, w: 1.0, h: 0.22, fontSize: 7, bold: true, color: DGRAY, fontFace: 'Calibri' })
  legendItems.forEach(([color, label], i) => {
    slide.addShape('rect', { x: 0.25, y: 4.78 + i * 0.0, w: 0.18, h: 0.15, fill: { color } })
    slide.addText(label, { x: 0.48, y: 4.74 + i * 0.0, w: 1.1, h: 0.18, fontSize: 6.5, color: DGRAY, fontFace: 'Calibri' })
  })
  // Stack them horizontally instead
  legendItems.forEach(([color, label], i) => {
    const lx = 0.25 + i * 1.9
    slide.addShape('rect', { x: lx, y: 4.78, w: 0.18, h: 0.15, fill: { color } })
    slide.addText(label, { x: lx + 0.22, y: 4.76, w: 1.6, h: 0.18, fontSize: 6.5, color: DGRAY, fontFace: 'Calibri' })
  })

  const outPath = path.join(__dirname, '..', 'CRM_Workflow_Chart.pptx')
  await prs.writeFile({ fileName: outPath })
  console.log(`✅  Workflow chart saved to: ${outPath}`)
}

main().catch(err => { console.error(err); process.exit(1) })
