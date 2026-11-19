/**
 * Merged front+back document as a single A4 sheet.
 *
 * App 2-page bug (OTA did not “fail”; CSS tweaks could not fix it):
 * expo-print `printToFileAsync` defaults to US Letter 612×792px (279mm tall).
 * An A4-tall sheet (297mm / 296mm) overflows Letter by ~17mm → a sliver on page 2.
 * Pass `A4_PRINT_WIDTH_PX` / `A4_PRINT_HEIGHT_PX` and use `mode: 'pdf'` HTML (no chrome).
 */

export const A4_PRINT_WIDTH_PX = 595
export const A4_PRINT_HEIGHT_PX = 842
const HALF_PX = 421

export type TwoSidedPrintSide =
  | {
      kind: 'image'
      src: string
      alt: string
      driveThumbnailFallback?: string
      driveUrl?: string | null
    }
  | { kind: 'pdf'; src: string; alt: string }

export type BuildTwoSidedMergedPrintHtmlParams = {
  title: string
  docName: string
  regNo: string
  front: TwoSidedPrintSide
  back: TwoSidedPrintSide
  driveLinks?: { front?: string | null; back?: string | null }
  /** `pdf` = no toolbar, px-sized sheet for expo-print / print CSS. */
  mode?: 'preview' | 'pdf'
}

function escAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/'/g, '&#39;')
}

function renderHalf(position: 'top' | 'bottom', side: TwoSidedPrintSide): string {
  const cls = position === 'top' ? 'half half-top' : 'half half-bottom'
  if (side.kind === 'pdf') {
    const src = escAttr(side.src)
    const alt = escAttr(side.alt)
    return `<div class="${cls}"><iframe src="${src}#toolbar=0" class="doc-frame" title="${alt}"></iframe></div>`
  }

  const src = escAttr(side.src)
  const alt = escAttr(side.alt)
  const fallback = escAttr(side.driveThumbnailFallback ?? '')
  const driveBtn = side.driveUrl
    ? `<a href="${escAttr(side.driveUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm">Open on Google Drive</a>`
    : ''

  return `<div class="${cls}">
  <img
    src="${src}"
    class="doc-img"
    alt="${alt}"
    width="${A4_PRINT_WIDTH_PX}"
    height="${HALF_PX}"
    onerror="if(!this.dataset.fallback && '${fallback}'){this.dataset.fallback='1';this.src='${fallback}';}else{this.style.display='none';var f=this.nextElementSibling;if(f)f.style.display='block';}"
  />
  <div class="img-fallback" style="display:none;">
    <p>Unable to display image preview directly.</p>
    ${driveBtn}
  </div>
</div>`
}

const PDF_CSS = `
  @page { size: ${A4_PRINT_WIDTH_PX}px ${A4_PRINT_HEIGHT_PX}px; margin: 0; }
  html, body {
    margin: 0;
    padding: 0;
    width: ${A4_PRINT_WIDTH_PX}px;
    height: ${A4_PRINT_HEIGHT_PX}px;
    overflow: hidden;
    background: #fff;
  }
  .print-actions { display: none; }
  .sheet {
    position: relative;
    width: ${A4_PRINT_WIDTH_PX}px;
    height: ${A4_PRINT_HEIGHT_PX}px;
    overflow: hidden;
    background: #fff;
  }
  .half {
    position: absolute;
    left: 0;
    width: ${A4_PRINT_WIDTH_PX}px;
    height: ${HALF_PX}px;
    overflow: hidden;
  }
  .half-top { top: 0; }
  .half-bottom { top: ${HALF_PX}px; }
  .doc-img, .doc-frame {
    display: block;
    width: ${A4_PRINT_WIDTH_PX}px;
    height: ${HALF_PX}px;
    max-width: ${A4_PRINT_WIDTH_PX}px;
    max-height: ${HALF_PX}px;
    object-fit: contain;
    object-position: center center;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .img-fallback { display: none; }
`

const PREVIEW_CSS = `
  @page { size: A4 portrait; margin: 0; }
  *, *::before, *::after { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #f8fafc;
    margin: 0;
    padding: 10px 14px;
    color: #0f172a;
    text-align: center;
  }
  .print-actions {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
    flex-wrap: wrap;
  }
  .btn {
    background: #2563eb;
    color: #fff;
    border: none;
    padding: 9px 18px;
    font-weight: 800;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn-secondary { background: #475569; }
  .btn-close { background: #64748b; }
  .btn-sm { font-size: 11px; padding: 5px 10px; }
  .sheet {
    position: relative;
    width: ${A4_PRINT_WIDTH_PX}px;
    height: ${A4_PRINT_HEIGHT_PX}px;
    margin: 0 auto;
    overflow: hidden;
    background: #fff;
    border: 1.5px solid #cbd5e1;
    border-radius: 10px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
  }
  .half {
    position: absolute;
    left: 0;
    width: ${A4_PRINT_WIDTH_PX}px;
    height: ${HALF_PX}px;
    overflow: hidden;
  }
  .half-top { top: 0; }
  .half-bottom { top: ${HALF_PX}px; }
  .doc-img, .doc-frame {
    display: block;
    width: ${A4_PRINT_WIDTH_PX}px;
    height: ${HALF_PX}px;
    object-fit: contain;
    object-position: center center;
    margin: 0;
    padding: 0;
    border: 0;
  }
  .img-fallback {
    padding: 12px;
    background: #fef2f2;
    border: 1.5px dashed #f87171;
    border-radius: 8px;
    color: #991b1b;
    font-size: 12px;
    text-align: center;
  }
  @media print {
    ${PDF_CSS}
    body { padding: 0 !important; }
    .print-actions { display: none !important; }
    .sheet { border: none !important; border-radius: 0 !important; box-shadow: none !important; margin: 0 !important; }
  }
`

export function buildTwoSidedMergedPrintHtml(params: BuildTwoSidedMergedPrintHtmlParams): string {
  const mode = params.mode ?? 'preview'
  const title = escAttr(params.title)
  const docName = escAttr(params.docName)
  const regNo = escAttr(params.regNo)
  const frontHalf = renderHalf('top', params.front)
  const backHalf = renderHalf('bottom', params.back)
  const css = mode === 'pdf' ? PDF_CSS : PREVIEW_CSS

  const frontDrive = params.driveLinks?.front
  const backDrive = params.driveLinks?.back
  const toolbar =
    mode === 'pdf'
      ? ''
      : `<div class="print-actions">
    <button type="button" class="btn" onclick="window.print()">Print 1-Page (Merged Front + Back)</button>
    ${frontDrive ? `<a href="${escAttr(frontDrive)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Open Front on Drive</a>` : ''}
    ${backDrive ? `<a href="${escAttr(backDrive)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary">Open Back on Drive</a>` : ''}
    <button type="button" class="btn btn-close" onclick="window.close()">Close</button>
  </div>`

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=${A4_PRINT_WIDTH_PX}, initial-scale=1" />
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
  ${toolbar}
  <div class="sheet" aria-label="${docName} ${regNo}">
    ${frontHalf}
    ${backHalf}
  </div>
</body>
</html>`
}
