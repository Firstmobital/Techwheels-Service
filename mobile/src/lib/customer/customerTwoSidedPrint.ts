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
  <title>Merged 1-Page Print · ${docName} - ${regNumber}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      margin: 0;
      padding: 16px;
      color: #0f172a;
      text-align: center;
    }
    .print-actions {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .btn {
      background: #2563eb;
      color: #ffffff;
      border: none;
      padding: 10px 18px;
      font-weight: 800;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn-close {
      background: #64748b;
    }
    .page-box {
      max-width: 720px;
      margin: 0 auto;
      border: 1.5px solid #cbd5e1;
      padding: 20px;
      border-radius: 12px;
      background: #ffffff;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .doc-header {
      font-size: 17px;
      font-weight: 900;
      color: #1e293b;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e2e8f0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .doc-sub {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .side-block {
      margin-bottom: 20px;
      text-align: center;
    }
    .side-title {
      font-size: 12px;
      font-weight: 800;
      color: #475569;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .side-img {
      max-width: 100%;
      max-height: 380px;
      object-fit: contain;
      border: 1px solid #94a3b8;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.06);
    }
    @media print {
      .print-actions { display: none !important; }
      body { margin: 0; padding: 0; background: #fff; }
      .page-box { border: none; padding: 0; max-width: 100%; box-shadow: none; }
      .side-img { max-height: 420px; }
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
      <img src="${safeFrontUrl}" class="side-img" />
    </div>
    <div class="side-block">
      <div class="side-title">BACK SIDE</div>
      <img src="${safeBackUrl}" class="side-img" />
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
