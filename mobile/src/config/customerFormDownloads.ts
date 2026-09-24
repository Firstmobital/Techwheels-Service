import { readEnv } from '../lib/env'

/** Blank T/P affidavit PDF for customer download (set EXPO_PUBLIC_TP_AFFIDAVIT_PDF_URL in env). */
export function getTpAffidavitPdfUrl(): string {
  return (
    readEnv('EXPO_PUBLIC_TP_AFFIDAVIT_PDF_URL', ['VITE_TP_AFFIDAVIT_PDF_URL']) ??
    ''
  ).trim()
}

export const TP_AFFIDAVIT_FORM = {
  title: 'T/P Affidavit (Third-Party Undertaking)',
  fileName: 'Techwheels_TP_Affidavit.pdf',
} as const
