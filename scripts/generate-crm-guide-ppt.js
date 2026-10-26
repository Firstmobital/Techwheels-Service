/**
 * generate-crm-guide-ppt.js
 *
 * Generates a step-by-step training PPT for the Tata Motors CRM DMS system
 * vehicle data scraping process.
 *
 * Usage:
 *   node scripts/generate-crm-guide-ppt.js
 *
 * Output: CRM_Vehicle_Data_Guide.pptx  (in project root)
 */

import PptxGenJS from 'pptxgenjs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const NAVY   = '002B5C'
const BLUE   = '003DA5'
const GOLD   = 'C9A84C'
const WHITE  = 'FFFFFF'
const LGRAY  = 'F2F4F8'
const DGRAY  = '2D3748'
const GREEN  = '276749'
const RED    = 'C53030'

const W = 10
const H = 5.625

// ─── Shared header/footer helpers ────────────────────────────────────────────

function addHeader(slide, title, stepNum, totalSteps) {
  // Navy header bar
  slide.addShape('rect', { x: 0, y: 0, w: W, h: 0.9, fill: { color: NAVY } })
  // Gold accent left bar
  slide.addShape('rect', { x: 0, y: 0, w: 0.16, h: 0.9, fill: { color: GOLD } })

  slide.addText(title, {
    x: 0.3, y: 0, w: W - 3, h: 0.9,
    fontSize: 20, bold: true, color: WHITE, fontFace: 'Calibri', valign: 'middle',
  })

  if (stepNum) {
    slide.addText(`STEP ${stepNum} / ${totalSteps}`, {
      x: W - 2.5, y: 0, w: 2.3, h: 0.9,
      fontSize: 11, bold: true, color: GOLD, fontFace: 'Calibri',
      align: 'right', valign: 'middle',
    })
  }

  // Gold strip under header
  slide.addShape('rect', { x: 0, y: 0.9, w: W, h: 0.06, fill: { color: GOLD } })
}

function addFooter(slide) {
  slide.addShape('rect', { x: 0, y: H - 0.32, w: W, h: 0.32, fill: { color: GOLD } })
  slide.addText('FIRST MOBITAL PVT. LTD.  |  Tata Motors Authorised Dealer  |  Jaipur', {
    x: 0.2, y: H - 0.32, w: W - 0.4, h: 0.32,
    fontSize: 8, bold: true, color: NAVY, fontFace: 'Calibri',
    align: 'center', valign: 'middle',
  })
}

function addCallout(slide, text, x, y, w, h, color = BLUE) {
  slide.addShape('rect', { x, y, w, h, fill: { color }, line: { color, width: 0 } })
  slide.addText(text, {
    x: x + 0.12, y, w: w - 0.2, h,
    fontSize: 9, color: WHITE, fontFace: 'Calibri', valign: 'middle', bold: true,
  })
}

function addNumberedStep(slide, num, text, x, y) {
  // Circle badge
  slide.addShape('ellipse', { x, y: y - 0.02, w: 0.32, h: 0.32, fill: { color: NAVY } })
  slide.addText(String(num), {
    x, y: y - 0.02, w: 0.32, h: 0.32,
    fontSize: 11, bold: true, color: WHITE, fontFace: 'Calibri',
    align: 'center', valign: 'middle',
  })
  slide.addText(text, {
    x: x + 0.4, y, w: W - x - 0.6, h: 0.35,
    fontSize: 11, color: DGRAY, fontFace: 'Calibri', valign: 'middle',
  })
}

// ─── Slide 1: Cover ───────────────────────────────────────────────────────────

function addCoverSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: NAVY } })
  slide.addShape('rect', { x: 0, y: 0, w: 0.22, h: H, fill: { color: GOLD } })
  slide.addShape('rect', { x: 0, y: H - 0.32, w: W, h: 0.32, fill: { color: GOLD } })

  slide.addText('CRM DMS VEHICLE DATA', {
    x: 0.55, y: 0.8, w: W - 1.5, h: 1.0,
    fontSize: 34, bold: true, color: WHITE, fontFace: 'Calibri',
  })
  slide.addText('EXTRACTION GUIDE', {
    x: 0.55, y: 1.75, w: W - 1.5, h: 0.7,
    fontSize: 26, bold: true, color: GOLD, fontFace: 'Calibri',
  })
  slide.addShape('rect', { x: 0.55, y: 2.55, w: 5, h: 0.05, fill: { color: GOLD } })
  slide.addText(
    'Step-by-step procedure to log in, search a vehicle by Chassis No.,\n' +
    'extract Service Information and Customer Contact details from\n' +
    'Tata Motors PV CRM DMS System.',
    {
      x: 0.55, y: 2.7, w: W - 1.3, h: 1.2,
      fontSize: 12, color: WHITE, fontFace: 'Calibri', lineSpacing: 18,
    }
  )

  slide.addText('FIRST MOBITAL PVT. LTD.  |  Jaipur  |  TMPC-Ser-N3-RJ-3000840', {
    x: 0.3, y: H - 0.32, w: W - 0.5, h: 0.32,
    fontSize: 8, bold: true, color: NAVY, fontFace: 'Calibri',
    align: 'center', valign: 'middle',
  })
}

// ─── Slide 2: Step 1 — Login ──────────────────────────────────────────────────

function addLoginSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Login to Tata Motors CRM DMS', 1, 10)
  addFooter(slide)

  // Browser mockup
  slide.addShape('rect', { x: 0.4, y: 1.1, w: 6.2, h: 3.9, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })
  // Address bar
  slide.addShape('rect', { x: 0.4, y: 1.1, w: 6.2, h: 0.35, fill: { color: 'E2E8F0' } })
  slide.addText('carsdms.inservices.tatamotors.com', {
    x: 0.55, y: 1.1, w: 5.9, h: 0.35,
    fontSize: 8, color: '4A5568', fontFace: 'Calibri', valign: 'middle',
  })

  // Page content mockup
  slide.addText('TATA MOTORS', { x: 0.65, y: 1.6, w: 3, h: 0.4, fontSize: 16, bold: true, color: NAVY, fontFace: 'Calibri' })
  slide.addText('Connecting Aspirations', { x: 0.65, y: 2.0, w: 3, h: 0.25, fontSize: 9, color: DGRAY, fontFace: 'Calibri' })
  slide.addText('Welcome to Tata Motors PV CRM DMS System', { x: 0.65, y: 2.35, w: 5.6, h: 0.3, fontSize: 11, bold: true, color: DGRAY, fontFace: 'Calibri' })

  // Login form mockup
  slide.addText('User ID', { x: 4.8, y: 2.5, w: 1.5, h: 0.25, fontSize: 9, color: DGRAY, fontFace: 'Calibri' })
  slide.addShape('rect', { x: 4.8, y: 2.75, w: 1.6, h: 0.28, fill: { color: WHITE }, line: { color: NAVY, width: 1 } })
  slide.addText('Password', { x: 4.8, y: 3.08, w: 1.5, h: 0.25, fontSize: 9, color: DGRAY, fontFace: 'Calibri' })
  slide.addShape('rect', { x: 4.8, y: 3.33, w: 1.6, h: 0.28, fill: { color: WHITE }, line: { color: NAVY, width: 1 } })
  slide.addText('●●●●●●●●', { x: 4.83, y: 3.33, w: 1.5, h: 0.28, fontSize: 10, color: DGRAY, fontFace: 'Calibri', valign: 'middle' })
  slide.addShape('rect', { x: 5.1, y: 3.72, w: 1.0, h: 0.3, fill: { color: GREEN } })
  slide.addText('Login', { x: 5.1, y: 3.72, w: 1.0, h: 0.3, fontSize: 11, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })

  // Callout arrows
  addCallout(slide, '① Enter your User ID', 7.0, 2.65, 2.8, 0.35)
  addCallout(slide, '② Enter your Password', 7.0, 3.2, 2.8, 0.35)
  addCallout(slide, '③ Click Login button', 7.0, 3.75, 2.8, 0.35)

  // Arrow lines
  slide.addShape('line', { x: 6.4, y: 2.9, w: 0.58, h: 0, line: { color: BLUE, width: 1.5 }, arrows: { end: { type: 'arrow' } } })
  slide.addShape('line', { x: 6.4, y: 3.47, w: 0.58, h: 0, line: { color: BLUE, width: 1.5 }, arrows: { end: { type: 'arrow' } } })
  slide.addShape('line', { x: 6.4, y: 3.87, w: 0.58, h: 0, line: { color: BLUE, width: 1.5 }, arrows: { end: { type: 'arrow' } } })

  slide.addText('⚠  Login is done only ONCE per session. The session stays active for all chassis lookups.', {
    x: 0.4, y: 4.85, w: 9.2, h: 0.35,
    fontSize: 9, italic: true, color: '744210', fontFace: 'Calibri',
  })
}

// ─── Slide 3: Step 2 — Home Screen ───────────────────────────────────────────

function addHomeScreenSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Home Screen After Login', 2, 10)
  addFooter(slide)

  // Nav bar mockup
  slide.addShape('rect', { x: 0.3, y: 1.05, w: 9.4, h: 0.45, fill: { color: NAVY } })
  const navItems = ['eLearning', 'Home', 'Contacts', 'Accounts', 'Activities', 'Vehicles', 'Service History', 'Partner Alerts']
  navItems.forEach((item, i) => {
    const isActive = item === 'Home'
    if (isActive) slide.addShape('rect', { x: 0.3 + i * 1.18, y: 1.05, w: 1.1, h: 0.45, fill: { color: BLUE } })
    slide.addText(item, {
      x: 0.35 + i * 1.18, y: 1.05, w: 1.05, h: 0.45,
      fontSize: 7.5, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle', bold: isActive,
    })
  })

  slide.addShape('rect', { x: 0.3, y: 1.6, w: 9.4, h: 2.8, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })
  slide.addText('Welcome Back DEEPAK SHARMA of FIRST MOBITAL PVT. LTD.', {
    x: 0.5, y: 1.7, w: 8.8, h: 0.4, fontSize: 13, bold: true, color: NAVY, fontFace: 'Calibri',
  })
  slide.addText('You last accessed on 06/16/2026 17:40:52.', {
    x: 0.5, y: 2.1, w: 8.8, h: 0.35, fontSize: 10, color: DGRAY, fontFace: 'Calibri',
  })

  addCallout(slide, '✓  You are now logged in. Proceed to click the Vehicles tab.', 0.3, 4.85, 9.4, 0.38, GREEN)
}

// ─── Slide 4: Step 3 — Click Vehicles ────────────────────────────────────────

function addClickVehiclesSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Navigate to the Vehicles Module', 3, 10)
  addFooter(slide)

  // Nav bar
  slide.addShape('rect', { x: 0.3, y: 1.05, w: 9.4, h: 0.45, fill: { color: NAVY } })
  const navItems = ['eLearning', 'Home', 'Contacts', 'Accounts', 'Activities', 'Vehicles', 'Service History', 'Partner Alerts']
  navItems.forEach((item, i) => {
    const isActive = item === 'Vehicles'
    if (isActive) slide.addShape('rect', { x: 0.3 + i * 1.18, y: 1.05, w: 1.1, h: 0.45, fill: { color: BLUE } })
    slide.addText(item, {
      x: 0.35 + i * 1.18, y: 1.05, w: 1.05, h: 0.45,
      fontSize: 7.5, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle', bold: isActive,
    })
  })

  // Red highlight circle around Vehicles tab
  slide.addShape('rect', { x: 6.88, y: 1.0, w: 1.1, h: 0.55, line: { color: RED, width: 3 }, fill: { type: 'none' } })

  addCallout(slide, '← Click "Vehicles" in the top navigation bar', 1.0, 1.72, 7.5, 0.38)

  slide.addShape('rect', { x: 0.3, y: 2.25, w: 9.4, h: 2.3, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })
  slide.addText('The Vehicles list will open showing "My Dealership\'s Vehicles" by default.', {
    x: 0.5, y: 2.4, w: 9.0, h: 0.4, fontSize: 11, color: DGRAY, fontFace: 'Calibri',
  })
  slide.addText('You will see columns: Chassis No., Booking Ref No, Registration Number, Engine No., Product/VC#, Product Line, Owner Account Name, etc.', {
    x: 0.5, y: 2.9, w: 9.0, h: 0.55, fontSize: 10, color: DGRAY, fontFace: 'Calibri', lineSpacing: 16,
  })

  addCallout(slide, '⚡  Next step: change the view filter from "My Dealership\'s Vehicles" to "All Visible Vehicles"', 0.3, 4.85, 9.4, 0.38, '744210')
}

// ─── Slide 5: Step 4 — Select All Visible Vehicles ───────────────────────────

function addSelectAllVehiclesSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Switch to "All Visible Vehicles" View', 4, 10)
  addFooter(slide)

  // Dropdown mockup
  slide.addShape('rect', { x: 0.4, y: 1.1, w: 3.5, h: 0.38, fill: { color: WHITE }, line: { color: NAVY, width: 1 } })
  slide.addText('My Dealership\'s Vehicles  ▼', {
    x: 0.5, y: 1.1, w: 3.3, h: 0.38,
    fontSize: 10, color: DGRAY, fontFace: 'Calibri', valign: 'middle',
  })

  // Dropdown open state
  slide.addShape('rect', { x: 0.4, y: 1.48, w: 3.5, h: 0.75, fill: { color: WHITE }, line: { color: NAVY, width: 1 } })
  slide.addText('✓  My Dealership\'s Vehicles', {
    x: 0.5, y: 1.5, w: 3.3, h: 0.35,
    fontSize: 10, color: DGRAY, fontFace: 'Calibri', valign: 'middle',
  })
  slide.addShape('rect', { x: 0.4, y: 1.86, w: 3.5, h: 0.35, fill: { color: BLUE } })
  slide.addText('All Visible Vehicles', {
    x: 0.5, y: 1.86, w: 3.3, h: 0.35,
    fontSize: 10, bold: true, color: WHITE, fontFace: 'Calibri', valign: 'middle',
  })

  // Red box around dropdown
  slide.addShape('rect', { x: 0.35, y: 1.05, w: 3.6, h: 0.45, line: { color: RED, width: 3 }, fill: { type: 'none' } })

  addCallout(slide, '① Click the dropdown at top-left of the Vehicles list', 4.2, 1.17, 5.5, 0.38)
  addCallout(slide, '② Select "All Visible Vehicles" from the dropdown', 4.2, 1.72, 5.5, 0.38)

  slide.addShape('rect', { x: 0.4, y: 2.7, w: 9.2, h: 1.8, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })
  slide.addText('Why "All Visible Vehicles"?', {
    x: 0.6, y: 2.8, w: 8.8, h: 0.35,
    fontSize: 12, bold: true, color: NAVY, fontFace: 'Calibri',
  })
  slide.addText(
    'The default view "My Dealership\'s Vehicles" only shows vehicles registered at your dealership.\n' +
    '"All Visible Vehicles" allows you to search any chassis number that has ever been serviced\n' +
    'or registered in the Tata Motors network.',
    {
      x: 0.6, y: 3.15, w: 8.8, h: 1.2,
      fontSize: 10, color: DGRAY, fontFace: 'Calibri', lineSpacing: 16,
    }
  )

  addCallout(slide, '✓  After selecting, a full vehicle search form will appear with Fetch RC and Fetch EW Invoice buttons.', 0.3, 4.85, 9.4, 0.38, GREEN)
}

// ─── Slide 6: Step 5 — Vehicle Search Form ───────────────────────────────────

function addVehicleFormSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, '"All Visible Vehicles" — Vehicle Form Opens', 5, 10)
  addFooter(slide)

  // Form mockup
  slide.addShape('rect', { x: 0.3, y: 1.1, w: 9.4, h: 3.4, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })

  // Buttons row
  slide.addShape('rect', { x: 0.45, y: 1.2, w: 1.0, h: 0.32, fill: { color: BLUE } })
  slide.addText('Fetch RC', { x: 0.45, y: 1.2, w: 1.0, h: 0.32, fontSize: 9, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })
  slide.addShape('rect', { x: 1.55, y: 1.2, w: 1.3, h: 0.32, fill: { color: BLUE } })
  slide.addText('Fetch EW Invoice', { x: 1.55, y: 1.2, w: 1.3, h: 0.32, fontSize: 9, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })

  // Three-column headers
  const sections = ['Vehicle Information', 'Service Information', 'Aggregate Details']
  sections.forEach((sec, i) => {
    slide.addText(sec, {
      x: 0.45 + i * 3.15, y: 1.65, w: 2.9, h: 0.3,
      fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri',
    })
  })

  // Sample fields
  const fields = [
    ['Chassis No:', '', 'Last Service Km:', '', 'Engine No:', ''],
    ['Product Name:', '', 'Last Service Dealer:', '', 'Battery No:', ''],
    ['Model:', '', 'Last Service Date:', '', 'Tyre Make (FR):', ''],
    ['TM Invoice Date:', '', 'Next Service Date:', '', 'Tyre # (FR):', ''],
    ['Resale Date:', '', 'Next Service Type:', '', 'Transaxle No:', ''],
  ]
  fields.forEach((row, ri) => {
    row.forEach((cell, ci) => {
      const isLabel = ci % 2 === 0
      slide.addText(cell, {
        x: 0.45 + Math.floor(ci / 2) * 3.15 + (isLabel ? 0 : 1.1),
        y: 2.05 + ri * 0.34,
        w: isLabel ? 1.05 : 1.85,
        h: 0.3,
        fontSize: 8,
        color: isLabel ? DGRAY : '4A5568',
        fontFace: 'Calibri',
        bold: isLabel,
      })
      if (!isLabel) {
        slide.addShape('rect', {
          x: 0.45 + Math.floor(ci / 2) * 3.15 + 1.1,
          y: 2.07 + ri * 0.34,
          w: 1.85, h: 0.25,
          fill: { color: WHITE }, line: { color: 'CCCCCC', width: 0.5 },
        })
      }
    })
  })

  addCallout(slide, '⚡  All fields are empty — you must search by Chassis No. to populate the form (Step 6→8)', 0.3, 4.85, 9.4, 0.38, '744210')
}

// ─── Slide 7: Step 6 — Click Search ──────────────────────────────────────────

function addClickSearchSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Click the Search (Query) Button', 6, 10)
  addFooter(slide)

  // Toolbar mockup
  slide.addShape('rect', { x: 0.3, y: 1.1, w: 9.4, h: 0.5, fill: { color: 'E2E8F0' }, line: { color: 'CCCCCC', width: 1 } })

  const icons = ['⊕', '✎', '⊟', '🔗', '☰', '■', '📊']
  icons.forEach((icon, i) => {
    slide.addText(icon, {
      x: 0.4 + i * 0.42, y: 1.1, w: 0.38, h: 0.5,
      fontSize: 14, fontFace: 'Segoe UI Emoji', align: 'center', valign: 'middle',
    })
  })

  // Highlight the search icon (magnifying glass — index 0 of toolbar icons in Siebel)
  slide.addShape('rect', { x: 0.35, y: 1.05, w: 0.43, h: 0.6, line: { color: RED, width: 3 }, fill: { type: 'none' } })

  addCallout(slide, '← Click the magnifying glass (🔍) Search/Query icon in the toolbar', 1.9, 1.25, 7.8, 0.38)

  // Info box
  slide.addShape('rect', { x: 0.3, y: 1.85, w: 9.4, h: 2.6, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })
  slide.addText('What happens when you click Search:', {
    x: 0.5, y: 1.95, w: 8.8, h: 0.35, fontSize: 12, bold: true, color: NAVY, fontFace: 'Calibri',
  })

  const points = [
    'The form fields become editable (white background with borders)',
    'A "Vehicles:Go" button appears at the top right of the form',
    'Three navigation arrows appear (cancel, go back, execute query)',
    'You can now type your Chassis Number in the "Chassis No:" field',
  ]
  points.forEach((p, i) => {
    addNumberedStep(slide, i + 1, p, 0.5, 2.4 + i * 0.42)
  })

  addCallout(slide, '✓  The search form is now active. Proceed to Step 7 — Enter Chassis Number.', 0.3, 4.85, 9.4, 0.38, GREEN)
}

// ─── Slide 8: Step 7 — Enter Chassis Number ──────────────────────────────────

function addEnterChassisSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Enter Chassis Number in Search Form', 7, 10)
  addFooter(slide)

  // Search form mockup
  slide.addShape('rect', { x: 0.3, y: 1.1, w: 9.4, h: 3.4, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })

  // Header row with Go button
  slide.addShape('rect', { x: 8.8, y: 1.15, w: 0.7, h: 0.35, fill: { color: BLUE } })
  slide.addText('Go →', { x: 8.8, y: 1.15, w: 0.7, h: 0.35, fontSize: 9, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })

  // Chassis No field — filled in
  slide.addText('Chassis No:', { x: 0.5, y: 1.65, w: 1.4, h: 0.35, fontSize: 10, bold: true, color: DGRAY, fontFace: 'Calibri', valign: 'middle' })
  slide.addShape('rect', { x: 1.95, y: 1.67, w: 2.5, h: 0.3, fill: { color: WHITE }, line: { color: NAVY, width: 2 } })
  slide.addText('MAT624026ELJ202', { x: 2.0, y: 1.67, w: 2.4, h: 0.3, fontSize: 10, color: NAVY, fontFace: 'Calibri', bold: true, valign: 'middle' })

  // Other empty fields
  const otherFields = [
    ['Vehicle Registration Number:', 4.7],
    ['Engine No.:', 4.7],
    ['Account:', 7.2],
  ]
  otherFields.forEach(([label, x], i) => {
    slide.addText(label, { x: x > 6 ? x : 0.5, y: 2.1 + (i > 0 ? (i - 1) * 0.4 : 0), w: 2.2, h: 0.32, fontSize: 8, color: DGRAY, fontFace: 'Calibri', valign: 'middle' })
  })

  // Highlight chassis field
  slide.addShape('rect', { x: 1.9, y: 1.62, w: 2.6, h: 0.42, line: { color: RED, width: 3 }, fill: { type: 'none' } })

  addCallout(slide, '① Type or paste the Chassis No. in the "Chassis No:" field', 4.6, 1.67, 5.1, 0.38)

  // Note box
  slide.addShape('rect', { x: 0.3, y: 3.1, w: 9.4, h: 1.4, fill: { color: WHITE }, line: { color: NAVY, width: 1 } })
  slide.addText('Important Notes:', { x: 0.5, y: 3.2, w: 8.8, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: 'Calibri' })
  slide.addText(
    '• Chassis numbers are case-sensitive — enter in UPPERCASE (e.g., MAT624026ELJ202)\n' +
    '• Do NOT add any spaces before or after the chassis number\n' +
    '• The system pulls all details automatically once the chassis is found',
    {
      x: 0.5, y: 3.52, w: 9.0, h: 0.9,
      fontSize: 9.5, color: DGRAY, fontFace: 'Calibri', lineSpacing: 15,
    }
  )

  addCallout(slide, '② After typing, press Enter OR click the Go → button (top right)', 0.3, 4.85, 9.4, 0.38, '744210')
}

// ─── Slide 9: Step 8 — Press Arrow / Go ──────────────────────────────────────

function addPressGoSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Execute the Search — Press Go Arrow', 8, 10)
  addFooter(slide)

  // Toolbar with Go button highlighted
  slide.addShape('rect', { x: 0.3, y: 1.1, w: 9.4, h: 0.48, fill: { color: 'E2E8F0' }, line: { color: 'CCCCCC', width: 1 } })

  // Go arrow button (blue circle with →)
  slide.addShape('ellipse', { x: 8.85, y: 1.16, w: 0.36, h: 0.36, fill: { color: BLUE } })
  slide.addText('→', { x: 8.85, y: 1.16, w: 0.36, h: 0.36, fontSize: 16, bold: true, color: WHITE, fontFace: 'Calibri', align: 'center', valign: 'middle' })
  slide.addShape('rect', { x: 8.8, y: 1.1, w: 0.46, h: 0.48, line: { color: RED, width: 3 }, fill: { type: 'none' } })

  addCallout(slide, '← Click this blue Go (→) arrow to execute the search', 2.0, 1.22, 6.6, 0.38)

  // Result mockup
  slide.addShape('rect', { x: 0.3, y: 1.78, w: 9.4, h: 2.7, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })
  slide.addText('Vehicle Information loaded:', { x: 0.5, y: 1.88, w: 8.8, h: 0.32, fontSize: 11, bold: true, color: GREEN, fontFace: 'Calibri' })

  const resultFields = [
    ['Chassis No:', 'MAT624026ELJ202', 'Last Service Km:', '105,449'],
    ['Reg. Number:', 'RJ14CU8495', 'Last Service Dealer:', 'FIRST MOBITAL PV'],
    ['Product Name:', '54220224AIJR', 'Last Service Date:', '31/03/2026'],
    ['Model:', 'ZEST', 'Next Service Date:', '25/02/2026'],
    ['TM Invoice Date:', '15/09/2014', 'Next Service Type:', 'Schedule Service'],
  ]
  resultFields.forEach((row, ri) => {
    slide.addText(row[0], { x: 0.5, y: 2.25 + ri * 0.36, w: 1.5, h: 0.32, fontSize: 8.5, bold: true, color: DGRAY, fontFace: 'Calibri', valign: 'middle' })
    slide.addText(row[1], { x: 2.05, y: 2.25 + ri * 0.36, w: 2.2, h: 0.32, fontSize: 8.5, color: NAVY, fontFace: 'Calibri', valign: 'middle', bold: true })
    slide.addText(row[2], { x: 4.5, y: 2.25 + ri * 0.36, w: 1.7, h: 0.32, fontSize: 8.5, bold: true, color: DGRAY, fontFace: 'Calibri', valign: 'middle' })
    slide.addText(row[3], { x: 6.25, y: 2.25 + ri * 0.36, w: 3.2, h: 0.32, fontSize: 8.5, color: NAVY, fontFace: 'Calibri', valign: 'middle', bold: true })
  })

  addCallout(slide, '✓  Vehicle details are now populated. Proceed to scrape Service Information.', 0.3, 4.85, 9.4, 0.38, GREEN)
}

// ─── Slide 10: Step 9+10 — Scrape Service Information ────────────────────────

function addScrapeServiceInfoSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Scrape Service Information Fields', '9 & 10', 10)
  addFooter(slide)

  // Service Information box
  slide.addShape('rect', { x: 0.3, y: 1.1, w: 9.4, h: 0.38, fill: { color: NAVY } })
  slide.addText('Service Information', { x: 0.5, y: 1.1, w: 9.0, h: 0.38, fontSize: 13, bold: true, color: WHITE, fontFace: 'Calibri', valign: 'middle', align: 'center' })

  const serviceFields = [
    ['Vehicle Registration Number', 'RJ14CU8495', 'Last Service Km', '105,449'],
    ['Dealer Invoice Number', 'RoshanM-1415-001', 'Last Service Dealer', 'FIRST MOBITAL PV'],
    ['Commercial Invoice#', '0711281035', 'Last Service Division', '3000840-Sv&Pa-Jai'],
    ['TM Invoice Date', '15/09/2014', 'Last Service Date', '31/03/2026'],
    ['Resale Date', '27/09/2014', 'Next Service Date', '25/02/2026'],
    ['Resale Odometer Reading', '105,449', 'Next Service Type', 'Schedule Service'],
  ]

  serviceFields.forEach(([l1, v1, l2, v2], ri) => {
    const y = 1.6 + ri * 0.39
    const bg = ri % 2 === 0 ? WHITE : LGRAY
    slide.addShape('rect', { x: 0.3, y, w: 9.4, h: 0.37, fill: { color: bg } })

    slide.addText(l1 + ':', { x: 0.45, y, w: 2.3, h: 0.37, fontSize: 8.5, bold: true, color: DGRAY, fontFace: 'Calibri', valign: 'middle' })
    slide.addText(v1,        { x: 2.8,  y, w: 2.0, h: 0.37, fontSize: 8.5, color: NAVY, fontFace: 'Calibri', valign: 'middle', bold: true })
    slide.addText(l2 + ':', { x: 5.0,  y, w: 2.3, h: 0.37, fontSize: 8.5, bold: true, color: DGRAY, fontFace: 'Calibri', valign: 'middle' })
    slide.addText(v2,        { x: 7.4,  y, w: 2.1, h: 0.37, fontSize: 8.5, color: NAVY, fontFace: 'Calibri', valign: 'middle', bold: true })
  })

  // Highlight box around the whole service info
  slide.addShape('rect', { x: 0.28, y: 1.08, w: 9.44, h: 2.36, line: { color: RED, width: 3 }, fill: { type: 'none' } })

  addCallout(slide, '⬆  Extract ALL fields shown above from the Service Information section', 0.3, 4.85, 9.4, 0.38, RED)
}

// ─── Slide 11: Step — Contact Details ────────────────────────────────────────

function addContactDetailsSlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Fetch Customer Contact Details', 10, 10)
  addFooter(slide)

  // Sub-tab bar
  const tabs = ['Contacts', 'Service Requests', 'Agreement', 'Ownership History', 'PDI CheckSheet', 'AMC Contract', 'Service History', 'Complaints']
  slide.addShape('rect', { x: 0.3, y: 1.1, w: 9.4, h: 0.4, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })
  tabs.forEach((tab, i) => {
    const isActive = tab === 'Contacts'
    if (isActive) slide.addShape('rect', { x: 0.3 + i * 1.2, y: 1.1, w: 1.15, h: 0.4, fill: { color: NAVY } })
    slide.addText(tab, {
      x: 0.32 + i * 1.2, y: 1.1, w: 1.1, h: 0.4,
      fontSize: 6.8, color: isActive ? WHITE : DGRAY, fontFace: 'Calibri',
      align: 'center', valign: 'middle', bold: isActive,
    })
  })

  // Red highlight around Contacts tab
  slide.addShape('rect', { x: 0.28, y: 1.07, w: 1.2, h: 0.46, line: { color: RED, width: 3 }, fill: { type: 'none' } })

  // Contacts table
  slide.addShape('rect', { x: 0.3, y: 1.65, w: 9.4, h: 0.38, fill: { color: NAVY } })
  const headers = ['First Name', 'Cell Phone No.', 'Created Date', 'Contact Status']
  const colW = [3.0, 2.5, 2.0, 1.9]
  let cx = 0.45
  headers.forEach((h, i) => {
    slide.addText(h, { x: cx, y: 1.65, w: colW[i], h: 0.38, fontSize: 9, bold: true, color: WHITE, fontFace: 'Calibri', valign: 'middle' })
    cx += colW[i]
  })

  const rows = [
    ['SANJAY', '8854800005', '27/09/2014', 'Customer'],
    ['ROSHAN', '8233000010', '23/09/2014', 'General'],
    ['DALPAT SINGH', '9982253538', '25/02/2025', 'General'],
  ]
  rows.forEach((row, ri) => {
    const ry = 2.05 + ri * 0.45
    const isCustomer = row[3] === 'Customer'
    const bg = isCustomer ? '#EBF8F0' : WHITE
    slide.addShape('rect', { x: 0.3, y: ry, w: 9.4, h: 0.42, fill: { color: isCustomer ? 'EBF8F0' : WHITE }, line: { color: 'CCCCCC', width: 0.5 } })

    let rowCx = 0.45
    row.forEach((cell, ci) => {
      const isStatusCustomer = ci === 3 && cell === 'Customer'
      slide.addText(cell, {
        x: rowCx, y: ry, w: colW[ci], h: 0.42,
        fontSize: 9.5, color: isStatusCustomer ? GREEN : DGRAY,
        fontFace: 'Calibri', valign: 'middle', bold: isStatusCustomer,
      })
      rowCx += colW[ci]
    })

    // Extract only Customer row
    if (isCustomer) {
      slide.addShape('rect', { x: 0.28, y: ry - 0.02, w: 9.44, h: 0.46, line: { color: GREEN, width: 2.5 }, fill: { type: 'none' } })
    }
  })

  slide.addText('Extract ONLY rows where Contact Status = "Customer"  →  First Name + Cell Phone No.', {
    x: 0.3, y: 3.45, w: 9.4, h: 0.35,
    fontSize: 10, bold: true, color: RED, fontFace: 'Calibri', align: 'center',
  })

  addCallout(slide, '✓  SANJAY  |  8854800005  ← This is the only Customer contact to capture', 0.3, 4.85, 9.4, 0.38, GREEN)
}

// ─── Slide 12: Summary / Loop ─────────────────────────────────────────────────

function addSummarySlide(prs) {
  const slide = prs.addSlide()
  slide.addShape('rect', { x: 0, y: 0, w: W, h: H, fill: { color: WHITE } })
  addHeader(slide, 'Complete Process Summary & Automation Loop', null, null)
  addFooter(slide)

  // Flow diagram
  const steps = [
    { num: 1, text: 'Login Once\n(CRM credentials)' },
    { num: 2, text: 'Go to Vehicles\n→ All Visible Vehicles' },
    { num: 3, text: 'Click Search\n(magnifying glass)' },
    { num: 4, text: 'Enter Chassis No.\nPress Go →' },
    { num: 5, text: 'Scrape Service\nInformation' },
    { num: 6, text: 'Scrape Contacts\n(Customer only)' },
    { num: 7, text: 'Save to Backend\n(Supabase / Excel)' },
    { num: 8, text: 'Next Chassis\n(repeat 3→7)' },
  ]

  steps.forEach((step, i) => {
    const col = i % 4
    const row = Math.floor(i / 4)
    const x = 0.4 + col * 2.4
    const y = 1.15 + row * 1.6

    const isLoop = step.num === 8
    slide.addShape('rect', { x, y, w: 2.0, h: 1.0,
      fill: { color: isLoop ? GOLD : (step.num === 1 ? NAVY : BLUE) },
      line: { color: isLoop ? '8B6914' : BLUE, width: 1 },
    })
    slide.addText(`${step.num}`, {
      x, y: y + 0.08, w: 2.0, h: 0.28,
      fontSize: 16, bold: true, color: isLoop ? NAVY : WHITE, fontFace: 'Calibri', align: 'center',
    })
    slide.addText(step.text, {
      x: x + 0.05, y: y + 0.38, w: 1.9, h: 0.58,
      fontSize: 8.5, color: isLoop ? NAVY : WHITE, fontFace: 'Calibri', align: 'center', lineSpacing: 12,
    })

    // Arrow between steps (horizontal)
    if (col < 3) {
      slide.addShape('line', {
        x: x + 2.05, y: y + 0.5, w: 0.3, h: 0,
        line: { color: DGRAY, width: 1.5 }, arrows: { end: { type: 'arrow' } },
      })
    }
  })

  // Loop arrow from step 8 back to step 3 indicator
  slide.addShape('rect', { x: 0.3, y: 4.55, w: 9.4, h: 0.58, fill: { color: LGRAY }, line: { color: 'CCCCCC', width: 1 } })
  slide.addText(
    '🔄  Steps 3→7 repeat automatically for every new chassis number uploaded to the backend queue.\n' +
    '   Login (Step 1) and navigation (Step 2) happen ONLY ONCE per session.',
    {
      x: 0.5, y: 4.55, w: 9.0, h: 0.58,
      fontSize: 9, color: DGRAY, fontFace: 'Calibri', lineSpacing: 14,
    }
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const prs = new PptxGenJS()
  prs.layout  = 'LAYOUT_16x9'
  prs.author  = 'Techwheels Service'
  prs.company = 'First Mobital Pvt. Ltd.'
  prs.subject = 'CRM DMS Vehicle Data Extraction Guide'
  prs.title   = 'CRM DMS Vehicle Data Extraction Guide'

  addCoverSlide(prs)
  addLoginSlide(prs)
  addHomeScreenSlide(prs)
  addClickVehiclesSlide(prs)
  addSelectAllVehiclesSlide(prs)
  addVehicleFormSlide(prs)
  addClickSearchSlide(prs)
  addEnterChassisSlide(prs)
  addPressGoSlide(prs)
  addScrapeServiceInfoSlide(prs)
  addContactDetailsSlide(prs)
  addSummarySlide(prs)

  const outPath = path.join(__dirname, '..', 'CRM_Vehicle_Data_Guide.pptx')
  await prs.writeFile({ fileName: outPath })
  console.log(`✅  PPT saved to: ${outPath}`)
}

main().catch(err => {
  console.error('Error generating PPT:', err)
  process.exit(1)
})
