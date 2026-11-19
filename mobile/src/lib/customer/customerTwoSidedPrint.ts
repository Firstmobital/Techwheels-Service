import { Alert } from 'react-native'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import {
  A4_PRINT_HEIGHT_PX,
  A4_PRINT_WIDTH_PX,
  buildTwoSidedMergedPrintHtml,
} from '../../../../src/lib/print/twoSidedMergedPrintHtml'

export interface TwoSidedDocPrintParams {
  docName: string
  regNumber: string
  frontUrl: string
  backUrl: string
}

function normalizeToDirectImageUrl(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  const fileIdMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (fileIdMatch?.[1]) {
    return `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w1600`
  }
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (idParamMatch?.[1] && trimmed.includes('drive.google.com')) {
    return `https://drive.google.com/thumbnail?id=${idParamMatch[1]}&sz=w1600`
  }
  return trimmed
}

export function generateTwoSidedDocHtml(params: TwoSidedDocPrintParams): string {
  const { docName, regNumber, frontUrl, backUrl } = params
  return buildTwoSidedMergedPrintHtml({
    title: `Merged 1-Page Print · ${docName} - ${regNumber}`,
    docName,
    regNo: regNumber,
    front: { kind: 'image', src: normalizeToDirectImageUrl(frontUrl), alt: 'Front' },
    back: { kind: 'image', src: normalizeToDirectImageUrl(backUrl), alt: 'Back' },
    mode: 'pdf',
  })
}

export async function printMergedTwoSidedDocument(params: TwoSidedDocPrintParams): Promise<void> {
  const html = generateTwoSidedDocHtml(params)

  if (typeof window !== 'undefined' && (window as any).print && !(window as any).ReactNativeWebView) {
    try {
      const printWindow = window.open('', '_blank')
      if (printWindow) {
        printWindow.document.write(
          buildTwoSidedMergedPrintHtml({
            title: `Merged 1-Page Print · ${params.docName} - ${params.regNumber}`,
            docName: params.docName,
            regNo: params.regNumber,
            front: { kind: 'image', src: normalizeToDirectImageUrl(params.frontUrl), alt: 'Front' },
            back: { kind: 'image', src: normalizeToDirectImageUrl(params.backUrl), alt: 'Back' },
            mode: 'preview',
          }),
        )
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

  try {
    const printed = await Print.printToFileAsync({
      html,
      width: A4_PRINT_WIDTH_PX,
      height: A4_PRINT_HEIGHT_PX,
    })
    if (printed.numberOfPages > 1) {
      console.warn('[merged-print] expected 1 A4 page, got', printed.numberOfPages)
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(printed.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `${params.docName} (1-Page Merged) - ${params.regNumber}`,
        UTI: 'com.adobe.pdf',
      })
    } else {
      await Print.printAsync({
        html,
        width: A4_PRINT_WIDTH_PX,
        height: A4_PRINT_HEIGHT_PX,
      })
    }
  } catch (err) {
    console.error('Print two-sided document error:', err)
    Alert.alert('Print Error', err instanceof Error ? err.message : 'Unable to print 2-sided document.')
  }
}
