import { Alert } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'

export interface TwoSidedDocPrintParams {
  docName: string
  regNumber: string
  frontUrl: string
  backUrl: string
}

function normalizeToDirectImageUrl(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  // Google Drive file link: convert to direct thumbnail / viewable image link
  const fileIdMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (fileIdMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w1600`
  }
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idParamMatch?.[1] && trimmed.includes('drive.google.com')) {
    return `https://drive.google.com/thumbnail?id=${idParamMatch[1]}&sz=w1600`
  }
  // Supabase storage signed URLs or any standard image URLs: use as-is
  return trimmed
}

export function generateTwoSidedDocHtml(params: TwoSidedDocPrintParams): string {
  const { docName, regNumber, frontUrl, backUrl } = params
  const safeFrontUrl = normalizeToDirectImageUrl(frontUrl)
  const safeBackUrl = normalizeToDirectImageUrl(backUrl)
  const printedDate = new Date().toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  })

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Merged 1-Page Print · ${docName} - ${regNumber}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 4mm 5mm;
    }
    *, *::before, *::after {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      margin: 0;
      padding: 10px 14px;
      color: #0f172a;
      text-align: center;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 9px 18px;
      font-weight: 800;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-close {
      background: #64748b;
    }
    .page-box {
      max-width: 900px;
      width: 100%;
      margin: 0 auto;
      border: 1.5px solid #cbd5e1;
      padding: 12px 14px;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .doc-header {
      font-size: 15px;
      font-weight: 900;
      color: #0f172a;
      margin: 0;
      padding-bottom: 6px;
      border-bottom: 2px solid #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-sub {
      font-size: 10px;
      font-weight: 600;
      color: #64748b;
      margin-top: 2px;
    }
    .side-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 0;
    }
    .side-title {
      font-size: 11px;
      font-weight: 800;
      color: #334155;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .img-container {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      min-height: 0;
    }
    .side-img {
      max-width: 100%;
      max-height: 44vh;
      width: auto;
      height: auto;
      object-fit: contain;
      border: 1.5px solid #94a3b8;
      border-radius: 6px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.06);
    }
    .mid-gap { display: none; }
    @media print {
      @page {
        size: A4 portrait;
        margin: 3mm 4mm;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
      }
      html, body {
        height: 100% !important;
        max-height: 100% !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        overflow: hidden !important;
      }
      .print-actions { display: none !important; }
      .page-box {
        border: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        box-shadow: none !important;
        height: 100vh !important;
        max-height: 100vh !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: space-between !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        page-break-after: avoid !important;
        break-after: avoid !important;
        overflow: hidden !important;
      }
      .doc-header {
        flex: 0 0 auto !important;
        font-size: 13px !important;
        font-weight: 900 !important;
        margin: 0 0 1mm 0 !important;
        padding: 0 0 1mm 0 !important;
        border-bottom: 1.5px solid #0f172a !important;
        text-align: center !important;
      }
      .doc-sub {
        font-size: 8.5px !important;
        color: #64748b !important;
        margin-top: 1px !important;
      }
      .side-block {
        flex: 1 1 0 !important;
        min-height: 0 !important;
        height: calc(50vh - 12mm) !important;
        max-height: calc(50vh - 12mm) !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0.5mm 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: center !important;
        justify-content: center !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        overflow: hidden !important;
      }
      .side-title {
        flex: 0 0 auto !important;
        font-size: 10.5px !important;
        font-weight: 900 !important;
        margin: 0 0 1mm 0 !important;
        color: #0f172a !important;
        text-align: center !important;
      }
      .img-container {
        flex: 1 1 0 !important;
        min-height: 0 !important;
        width: 100% !important;
        height: 100% !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        overflow: hidden !important;
      }
      .side-img {
        max-height: 100% !important;
        max-width: 100% !important;
        width: auto !important;
        height: auto !important;
        object-fit: contain !important;
        border: 1px solid #94a3b8 !important;
        border-radius: 4px !important;
        box-shadow: none !important;
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .mid-gap { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="print-actions">
    <button class="btn" onclick="window.print()">🖨️ Print 1-Page (Merged Front + Back)</button>
    <button class="btn btn-close" onclick="window.close()">Close</button>
  </div>
  <div class="page-box">
    <div class="doc-header">
      ${docName} — ${regNumber}
      <div class="doc-sub">Techwheels Service · Merged 1-Page Document · Printed ${printedDate}</div>
    </div>
    <div class="side-block">
      <div class="side-title">FRONT SIDE</div>
      <div class="img-container">
        <img src="${safeFrontUrl}" class="side-img" alt="FRONT SIDE" />
      </div>
    </div>
    <div class="side-block">
      <div class="side-title">BACK SIDE</div>
      <div class="img-container">
        <img src="${safeBackUrl}" class="side-img" alt="BACK SIDE" />
      </div>
    </div>
  </div>
</body>
</html>`
}

export async function printMergedTwoSidedDocument(params: TwoSidedDocPrintParams): Promise<void> {
  const html = generateTwoSidedDocHtml(params)

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
        dialogTitle: `${params.docName} (1-Page Merged) - ${params.regNumber}`,
        UTI: 'com.adobe.pdf',
      })
    } else {
      await Print.printAsync({ html })
    }
  } catch (err) {
    console.error('Print two-sided document error:', err)
    Alert.alert('Print Error', err instanceof Error ? err.message : 'Unable to print 2-sided document.')
  }
}
