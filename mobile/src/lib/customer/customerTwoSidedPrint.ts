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
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Merged 1-Page Print · ${docName} - ${regNumber}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
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
      max-width: 210mm;
      width: 100%;
      min-height: 290mm;
      margin: 0 auto;
      border: 1.5px solid #cbd5e1;
      padding: 4mm 3mm;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
      gap: 0;
    }
    .side-block {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      justify-content: flex-start;
      width: 100%;
      flex: 1 1 0;
      min-height: 145mm;
      min-width: 0;
    }
    .img-container {
      display: block;
      width: 100%;
      flex: 1 1 auto;
      min-height: 145mm;
      line-height: 0;
    }
    .side-img {
      display: block;
      width: 100%;
      height: 145mm;
      max-width: 100%;
      object-fit: contain;
      object-position: center center;
      border: none;
      border-radius: 0;
      box-shadow: none;
    }
    .mid-gap { display: none; }
    @media print {
      @page {
        size: A4 portrait;
        margin: 0;
      }
      *, *::before, *::after {
        box-sizing: border-box !important;
      }
      html, body {
        width: 210mm !important;
        height: 297mm !important;
        max-height: 297mm !important;
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
        width: 210mm !important;
        height: 297mm !important;
        max-height: 297mm !important;
        min-height: 0 !important;
        max-width: none !important;
        box-shadow: none !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 0 !important;
        page-break-after: avoid !important;
        break-after: avoid-page !important;
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
        overflow: hidden !important;
      }
      .side-block {
        flex: 0 0 50% !important;
        height: 50% !important;
        max-height: 50% !important;
        min-height: 0 !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        justify-content: center !important;
        overflow: hidden !important;
        page-break-before: avoid !important;
        page-break-after: avoid !important;
        break-before: avoid-page !important;
        break-after: avoid-page !important;
      }
      .img-container {
        flex: 1 1 auto !important;
        min-height: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-height: 100% !important;
        display: block !important;
        line-height: 0 !important;
        overflow: hidden !important;
      }
      .side-img {
        display: block !important;
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 148.4mm !important;
        object-fit: contain !important;
        object-position: center center !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
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
    <div class="side-block">
      <div class="img-container">
        <img src="${safeFrontUrl}" class="side-img" alt="Front" />
      </div>
    </div>
    <div class="side-block">
      <div class="img-container">
        <img src="${safeBackUrl}" class="side-img" alt="Back" />
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
