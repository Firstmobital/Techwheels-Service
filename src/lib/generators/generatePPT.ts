/**
 * generateRepairPPT — Tata Motors body-paint warranty PPT generator
 *
 * Slide order
 *  1. Cover        — dark navy, "RUSTING VEHICLE DETAIL", Chassis / Reg / DoS
 *  2..N. Photos    — per panel × per photo_type (defect → primer → paint)
 *                    pre-repair excludes paint slides; post-repair includes all
 *  N+1. Summary    — total expenses table + TML / dealer share split
 *
 * All dimensions are in pptxgenjs virtual inches on a 16:9 canvas (10 × 5.625).
 */

import PptxGenJS from 'pptxgenjs'
import { supabase } from '../supabase'
import { AUTODOC_BUCKET } from '../autodocStorage'

// ─── Brand tokens ─────────────────────────────────────────────────────────────

const NAVY    = '002B5C'   // Tata Motors primary navy
const BLUE    = '003DA5'   // accent blue for table header
const GOLD    = 'C9A84C'   // Tata gold stripe
const WHITE   = 'FFFFFF'
const LGRAY   = 'F2F4F8'   // alternating row
const DGRAY   = '2D3748'   // body text

// Slide canvas (LAYOUT_16x9)
const W = 10       // inches wide
const H = 5.625    // inches tall

// ─── Supabase types ───────────────────────────────────────────────────────────

interface JobSummary {
  job_card_id:       string
  jc_number:         string
  complaint_date:    string
  claim_type:        string | null
  status:            string
  reg_number:        string
  vin:               string | null
  model:             string | null
  vehicle_year:      number | null
  colour:            string | null
  dealer_name:       string | null
  dealer_city:       string | null
  owner_name:        string | null
  date_of_sale:      string | null
  warranty_age_days: number | null
  tml_share_percent: number | null
  tml_share_amount:  number | null
  total_estimate_amount: number | null
}

interface Panel {
  id:         string
  panel_name: string
  action:     string
}

interface PanelPhoto {
  id:            string
  panel_id:      string
  photo_type:    'defect' | 'primer' | 'paint'
  repair_stage:  'pre-repair' | 'post-repair'
  storage_path:  string
  gps_city:      string | null
  captured_at:   string | null
}

interface EstimateRow {
  sr_no:            number
  panel_name:       string | null
  part_description: string | null
  action:           string | null
  qty:              number
  ndp_value:        number
  labour_charges:   number
  row_total:        number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function inr(n: number): string {
  return '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 })
}

/** Download a Supabase Storage object and return a data-URL string. */
async function toDataURL(storagePath: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from(AUTODOC_BUCKET)
      .download(storagePath)
    if (error || !data) return null
    return new Promise<string | null>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror  = () => resolve(null)
      reader.readAsDataURL(data)
    })
  } catch {
    return null
  }
}

function photoTypeLabel(t: 'defect' | 'primer' | 'paint'): string {
  return { defect: 'DEFECT PHOTO', primer: 'PRIMER PHOTO', paint: 'FINAL PAINT PHOTO' }[t]
}

// ─── Data fetching ────────────────────────────────────────────────────────────

async function fetchAll(jobCardId: string) {
  const [summaryRes, panelsRes, photosRes, estRes] = await Promise.all([
    supabase
      .from('job_card_summary')
      .select('*')
      .eq('job_card_id', jobCardId)
      .single<JobSummary>(),

    supabase
      .from('panels')
      .select('id, panel_name, action')
      .eq('job_card_id', jobCardId)
      .order('created_at'),

    supabase
      .from('panel_photos')
      .select('id, panel_id, photo_type, repair_stage, storage_path, gps_city, captured_at')
      .eq('job_card_id', jobCardId)
      .order('captured_at'),

    supabase
      .from('estimate_rows')
      .select('sr_no, panel_name, part_description, action, qty, ndp_value, labour_charges, row_total')
      .eq('job_card_id', jobCardId)
      .order('sr_no'),
  ])

  if (summaryRes.error || !summaryRes.data)
    throw new Error(`Job card not found: ${summaryRes.error?.message ?? 'no data'}`)
  if (panelsRes.error)
    throw new Error(`Panels fetch failed: ${panelsRes.error.message}`)
  if (photosRes.error)
    throw new Error(`Photos fetch failed: ${photosRes.error.message}`)
  if (estRes.error)
    throw new Error(`Estimate fetch failed: ${estRes.error.message}`)

  return {
    summary:  summaryRes.data,
    panels:   (panelsRes.data  ?? []) as Panel[],
    photos:   (photosRes.data  ?? []) as PanelPhoto[],
    estRows:  (estRes.data     ?? []) as EstimateRow[],
  }
}

// ─── Slide: Cover ─────────────────────────────────────────────────────────────

function addCoverSlide(prs: PptxGenJS, jc: JobSummary, type: 'pre-repair' | 'post-repair') {
  const slide = prs.addSlide()

  // Full navy background
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: W, h: H, fill: { color: NAVY },
  })

  // Gold bottom stripe
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: H - 0.28, w: W, h: 0.28, fill: { color: GOLD },
  })

  // Left accent bar
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: 0.18, h: H - 0.28, fill: { color: GOLD },
  })

  // Main title
  slide.addText('RUSTING VEHICLE DETAIL', {
    x: 0.38, y: 0.55, w: W - 0.5, h: 0.9,
    fontSize: 34, bold: true, color: WHITE,
    fontFace: 'Calibri',
    align: 'left',
  })

  // Sub-label
  const subLabel = type === 'pre-repair'
    ? 'PRE-REPAIR DOCUMENTATION'
    : 'POST-REPAIR DOCUMENTATION'
  slide.addText(subLabel, {
    x: 0.38, y: 1.48, w: 6, h: 0.38,
    fontSize: 13, bold: true, color: GOLD,
    fontFace: 'Calibri', align: 'left',
  })

  // Gold divider
  slide.addShape(prs.ShapeType.rect, {
    x: 0.38, y: 2.0, w: W - 0.7, h: 0.04, fill: { color: GOLD },
  })

  // 6 detail fields in 2 columns
  const fields = [
    { label: 'CHASSIS NO.',      value: jc.vin          ?? '—' },
    { label: 'REGISTRATION NO.', value: jc.reg_number   ?? '—' },
    { label: 'DATE OF SALE',     value: fmt(jc.date_of_sale)   },
    { label: 'MODEL',            value: jc.model        ?? '—' },
    { label: 'COLOUR',           value: jc.colour       ?? '—' },
    { label: 'JC NUMBER',        value: jc.jc_number    ?? '—' },
  ]

  fields.forEach(({ label, value }, i) => {
    const col  = i % 2           // 0 = left, 1 = right
    const row  = Math.floor(i / 2)
    const xOff = col === 0 ? 0.38 : 5.4
    const yOff = 2.15 + row * 0.82

    slide.addText(label, {
      x: xOff, y: yOff, w: 4.5, h: 0.25,
      fontSize: 9, color: GOLD, fontFace: 'Calibri',
      bold: true, align: 'left',
    })
    slide.addText(value, {
      x: xOff, y: yOff + 0.24, w: 4.5, h: 0.44,
      fontSize: 17, color: WHITE, fontFace: 'Calibri',
      bold: true, align: 'left',
    })
  })

  // Dealer name in gold stripe
  const dealerLine = [jc.dealer_name, jc.dealer_city].filter(Boolean).join('  |  ')
  slide.addText(dealerLine.toUpperCase(), {
    x: 0.38, y: H - 0.28, w: W - 0.5, h: 0.28,
    fontSize: 9, bold: true, color: NAVY,
    fontFace: 'Calibri', align: 'left', valign: 'middle',
  })
}

// ─── Slide: Photo (Two-column layout) ──────────────────────────────────────

const TITLE_H  = 0.68
const STRIPE_H = 0.06
const FOOT_H   = 0.42

function addPhotoSlide(
  prs:        PptxGenJS,
  summary:    JobSummary,
  panelName:  string,
  pType:      'defect' | 'primer' | 'paint',
  dataURL:    string | null,
  gpsCity:    string | null,
  capturedAt: string | null,
) {
  const slide = prs.addSlide()

  // White base
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: W, h: H, fill: { color: WHITE },
  })

  // Title bar across full width
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: W, h: TITLE_H, fill: { color: NAVY },
  })

  const titleText = pType === 'defect'
    ? panelName.toUpperCase()
    : `${panelName.toUpperCase()}  —  ${photoTypeLabel(pType)}`

  slide.addText(titleText, {
    x: 0.25, y: 0, w: W - 0.5, h: TITLE_H,
    fontSize: 16, bold: true, color: WHITE,
    fontFace: 'Calibri', valign: 'middle',
  })

  // Gold accent strip under title
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: TITLE_H, w: W, h: STRIPE_H, fill: { color: GOLD },
  })

  // ── Two-column layout ───────────────────────────────────────────────────

  const CONTENT_Y  = TITLE_H + STRIPE_H
  const CONTENT_H  = H - CONTENT_Y - FOOT_H

  // Left column: Vehicle details (40% width)
  const LEFT_W = W * 0.4
  const LEFT_X = 0

  slide.addShape(prs.ShapeType.rect, {
    x: LEFT_X, y: CONTENT_Y, w: LEFT_W, h: CONTENT_H, fill: { color: LGRAY },
  })

  // Panel section
  let detailY = CONTENT_Y + 0.2
  slide.addText('PANEL', {
    x: LEFT_X + 0.15, y: detailY, w: LEFT_W - 0.3, h: 0.2,
    fontSize: 9, bold: true, color: GOLD, fontFace: 'Calibri',
  })
  slide.addText(panelName.toUpperCase(), {
    x: LEFT_X + 0.15, y: detailY + 0.2, w: LEFT_W - 0.3, h: 0.35,
    fontSize: 13, bold: true, color: DGRAY, fontFace: 'Calibri',
  })

  // Vehicle details section
  detailY += 0.7
  const detailFields = [
    { label: 'REG NO.', value: summary.reg_number ?? '—' },
    { label: 'VIN', value: summary.vin ?? '—' },
    { label: 'MODEL', value: summary.model ?? '—' },
    { label: 'COLOUR', value: summary.colour ?? '—' },
    { label: 'JC NO.', value: summary.jc_number ?? '—' },
  ]

  detailFields.forEach(({ label, value }) => {
    slide.addText(label, {
      x: LEFT_X + 0.15, y: detailY, w: LEFT_W - 0.3, h: 0.18,
      fontSize: 8, bold: true, color: GOLD, fontFace: 'Calibri',
    })
    slide.addText(value, {
      x: LEFT_X + 0.15, y: detailY + 0.18, w: LEFT_W - 0.3, h: 0.25,
      fontSize: 10, color: DGRAY, fontFace: 'Calibri',
    })
    detailY += 0.48
  })

  // Right column: Image (60% width)
  const RIGHT_W = W * 0.6
  const RIGHT_X = LEFT_W
  const IMG_H   = CONTENT_H - 0.35  // Space for geotag at bottom

  // Image area or placeholder
  if (dataURL) {
    slide.addImage({
      data: dataURL,
      x: RIGHT_X, y: CONTENT_Y, w: RIGHT_W, h: IMG_H,
      sizing: { type: 'contain', w: RIGHT_W, h: IMG_H },
    })
  } else {
    slide.addShape(prs.ShapeType.rect, {
      x: RIGHT_X, y: CONTENT_Y, w: RIGHT_W, h: IMG_H, fill: { color: LGRAY },
    })
    slide.addText('Photo not available', {
      x: RIGHT_X, y: CONTENT_Y + IMG_H / 2 - 0.2, w: RIGHT_W, h: 0.4,
      fontSize: 14, color: DGRAY, align: 'center', fontFace: 'Calibri',
    })
  }

  // Geotag strip at bottom of right column
  const geoStripY = CONTENT_Y + IMG_H
  slide.addShape(prs.ShapeType.rect, {
    x: RIGHT_X, y: geoStripY, w: RIGHT_W, h: 0.35, fill: { color: DGRAY },
  })

  const geoTag  = gpsCity ? `📍 ${gpsCity}` : ''
  const dateTag = capturedAt ? fmt(capturedAt) : ''
  const geoInfo = [geoTag, dateTag].filter(Boolean).join('   |   ')

  if (geoInfo) {
    slide.addText(geoInfo, {
      x: RIGHT_X + 0.1, y: geoStripY, w: RIGHT_W - 0.2, h: 0.35,
      fontSize: 9, color: WHITE, fontFace: 'Calibri', valign: 'middle',
    })
  }

  // ─── Footer bar ────────────────────────────────────────────────────────

  const footY = H - FOOT_H
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: footY, w: W, h: FOOT_H, fill: { color: NAVY },
  })

  const dealerLine = [summary.dealer_name, summary.dealer_city, fmt(capturedAt)]
    .filter(Boolean).join('   |   ')

  if (dealerLine) {
    slide.addText(dealerLine, {
      x: 0.25, y: footY, w: W - 0.5, h: FOOT_H,
      fontSize: 10, color: WHITE, fontFace: 'Calibri', valign: 'middle',
    })
  }
}

// ─── Slide: Summary ───────────────────────────────────────────────────────────

function addSummarySlide(prs: PptxGenJS, jc: JobSummary, rows: EstimateRow[]) {
  const slide = prs.addSlide()

  // White base
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: W, h: H, fill: { color: WHITE },
  })

  // Header band
  const HDR = 0.75
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: 0, w: W, h: HDR, fill: { color: NAVY },
  })
  slide.addText('REPAIR EXPENSE SUMMARY', {
    x: 0.3, y: 0, w: W - 0.6, h: HDR,
    fontSize: 20, bold: true, color: WHITE,
    fontFace: 'Calibri', align: 'center', valign: 'middle',
  })

  // Gold strip
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: HDR, w: W, h: 0.05, fill: { color: GOLD },
  })

  // Vehicle context line
  const context = [jc.reg_number, jc.model, jc.jc_number, jc.claim_type]
    .filter(Boolean).join('   |   ')
  slide.addText(context, {
    x: 0.3, y: HDR + 0.1, w: W - 0.6, h: 0.32,
    fontSize: 10, color: DGRAY, fontFace: 'Calibri', align: 'center',
  })

  // ── Table ──────────────────────────────────────────────────────────────────
  const TBL_Y = HDR + 0.52
  const RH    = 0.30   // row height
  const COLS  = { panel: 0.2, desc: 2.5, action: 6.2, total: 8.2 }

  // Header row
  slide.addShape(prs.ShapeType.rect, {
    x: 0.15, y: TBL_Y, w: W - 0.3, h: RH, fill: { color: BLUE },
  })
  slide.addText('Panel',       { x: COLS.panel  + 0.05, y: TBL_Y, w: 2.2, h: RH, fontSize: 9,  bold: true, color: WHITE, valign: 'middle' })
  slide.addText('Description', { x: COLS.desc   + 0.05, y: TBL_Y, w: 3.5, h: RH, fontSize: 9,  bold: true, color: WHITE, valign: 'middle' })
  slide.addText('Action',      { x: COLS.action + 0.05, y: TBL_Y, w: 1.8, h: RH, fontSize: 9,  bold: true, color: WHITE, valign: 'middle' })
  slide.addText('Amount',      { x: COLS.total  - 0.05, y: TBL_Y, w: 1.6, h: RH, fontSize: 9,  bold: true, color: WHITE, align: 'right', valign: 'middle' })

  // Data rows (max 8 before overflow)
  const MAX_ROWS = 8
  const visible  = rows.slice(0, MAX_ROWS)
  let grandTotal = 0

  visible.forEach((row, i) => {
    const ry  = TBL_Y + RH + i * RH
    const bg  = i % 2 === 0 ? LGRAY : WHITE

    slide.addShape(prs.ShapeType.rect, {
      x: 0.15, y: ry, w: W - 0.3, h: RH, fill: { color: bg },
    })
    slide.addText(row.panel_name       ?? '—', { x: COLS.panel  + 0.05, y: ry, w: 2.2, h: RH, fontSize: 8, color: DGRAY, valign: 'middle' })
    slide.addText(row.part_description ?? '—', { x: COLS.desc   + 0.05, y: ry, w: 3.5, h: RH, fontSize: 8, color: DGRAY, valign: 'middle' })
    slide.addText(row.action           ?? '—', { x: COLS.action + 0.05, y: ry, w: 1.8, h: RH, fontSize: 8, color: DGRAY, valign: 'middle' })
    slide.addText(inr(row.row_total ?? 0),      { x: COLS.total  - 0.05, y: ry, w: 1.6, h: RH, fontSize: 8, color: DGRAY, align: 'right', valign: 'middle' })
    grandTotal += row.row_total ?? 0
  })

  if (rows.length > MAX_ROWS) {
    const moreY = TBL_Y + RH + MAX_ROWS * RH
    slide.addText(`+ ${rows.length - MAX_ROWS} more line items…`, {
      x: COLS.panel + 0.05, y: moreY, w: 4, h: RH,
      fontSize: 8, italic: true, color: DGRAY, valign: 'middle',
    })
  }

  const extraRows = rows.length > MAX_ROWS ? 1 : 0
  const totalY    = TBL_Y + RH + visible.length * RH + extraRows * RH + 0.08

  // Total row
  slide.addShape(prs.ShapeType.rect, {
    x: 0.15, y: totalY, w: W - 0.3, h: RH * 1.25, fill: { color: NAVY },
  })
  slide.addText('TOTAL REPAIR COST', {
    x: COLS.panel + 0.05, y: totalY, w: 7.5, h: RH * 1.25,
    fontSize: 11, bold: true, color: WHITE, valign: 'middle',
  })
  slide.addText(inr(grandTotal), {
    x: COLS.total - 0.05, y: totalY, w: 1.6, h: RH * 1.25,
    fontSize: 11, bold: true, color: GOLD, align: 'right', valign: 'middle',
  })

  // TML / dealer share breakdown
  if (jc.tml_share_percent != null) {
    const tmlPct    = jc.tml_share_percent
    const dealerPct = 100 - tmlPct
    const tmlAmt    = grandTotal * (tmlPct / 100)
    const dealerAmt = grandTotal - tmlAmt

    slide.addText(
      `TML Share (${tmlPct}%): ${inr(tmlAmt)}   |   Dealer Share (${dealerPct}%): ${inr(dealerAmt)}`,
      {
        x: 0.15, y: totalY + RH * 1.25 + 0.08, w: W - 0.3, h: 0.3,
        fontSize: 10, color: DGRAY, align: 'center', fontFace: 'Calibri',
      },
    )
  }

  // Gold footer stripe
  slide.addShape(prs.ShapeType.rect, {
    x: 0, y: H - 0.28, w: W, h: 0.28, fill: { color: GOLD },
  })
  const footer = [
    (jc.dealer_name ?? 'Tata Motors Authorised Dealer').toUpperCase(),
    jc.dealer_city ?? '',
    `Generated ${new Date().toLocaleDateString('en-IN')}`,
  ].filter(Boolean).join('   |   ')
  slide.addText(footer, {
    x: 0.2, y: H - 0.28, w: W - 0.4, h: 0.28,
    fontSize: 8, bold: true, color: NAVY,
    fontFace: 'Calibri', align: 'center', valign: 'middle',
  })
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function generateRepairPPT(
  jobCardId: string,
  type: 'pre-repair' | 'post-repair',
): Promise<void> {
  // 1. Fetch all Supabase data in parallel
  const { summary, panels, photos, estRows } = await fetchAll(jobCardId)

  // 2. Decide which photo types to render based on repair stage
  // Pre-repair: defect & primer photos only, from pre-repair stage
  // Post-repair: all photo types, from post-repair stage
  const allowedTypes: Array<'defect' | 'primer' | 'paint'> =
    type === 'pre-repair' ? ['defect', 'primer'] : ['defect', 'primer', 'paint']

  const renderPhotos = photos.filter(
    p => allowedTypes.includes(p.photo_type) && p.repair_stage === type,
  )

  // 3. Download all photos concurrently
  const imgMap = new Map<string, string | null>()
  await Promise.all(
    renderPhotos.map(async (p) => {
      imgMap.set(p.id, await toDataURL(p.storage_path))
    }),
  )

  // 4. Build the presentation
  const prs = new PptxGenJS()
  prs.layout  = 'LAYOUT_16x9'
  prs.author  = summary.dealer_name ?? 'Tata Motors Dealership'
  prs.company = 'Tata Motors Limited'
  prs.subject = `Warranty Repair — ${summary.reg_number}`
  prs.title   = 'RUSTING VEHICLE DETAIL'

  // Slide 1 — Cover
  addCoverSlide(prs, summary, type)

  // Slides 2…N — Photos grouped by panel, ordered defect → primer → paint
  const TYPE_ORDER: Array<'defect' | 'primer' | 'paint'> = ['defect', 'primer', 'paint']

  for (const panel of panels) {
    for (const pType of TYPE_ORDER) {
      if (!allowedTypes.includes(pType)) continue
      const panelPhotos = renderPhotos.filter(
        p => p.panel_id === panel.id && p.photo_type === pType,
      )
      for (const photo of panelPhotos) {
        addPhotoSlide(
          prs,
          summary,
          panel.panel_name,
          photo.photo_type,
          imgMap.get(photo.id) ?? null,
          photo.gps_city,
          photo.captured_at,
        )
      }
    }
  }

  // Last slide — Expenses summary
  addSummarySlide(prs, summary, estRows)

  // 5. Trigger browser download
  const slug     = (summary.reg_number ?? jobCardId).replace(/\s+/g, '_')
  const fileName = `PPT_${slug}.pptx`
  await prs.writeFile({ fileName })
}
