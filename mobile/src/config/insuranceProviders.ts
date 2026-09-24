export interface InsuranceProvider {
  id: string
  name: string
  claimFormUrl: string
  isPaperless: boolean
}

export const INSURANCE_PROVIDERS: Record<string, InsuranceProvider> = {
  HDFC_ERGO: {
    id: 'HDFC_ERGO',
    name: 'HDFC ERGO',
    claimFormUrl: 'https://www.hdfcergo.com/documents/downloads/claimforms/MotorClaimform.pdf',
    isPaperless: false,
  },
  ICICI_LOMBARD: {
    id: 'ICICI_LOMBARD',
    name: 'ICICI Lombard',
    claimFormUrl: 'https://www.icicilombard.com/docs/default-source/downloads/motor_claim_form.pdf',
    isPaperless: false,
  },
  SBI_GENERAL: {
    id: 'SBI_GENERAL',
    name: 'SBI General',
    claimFormUrl: 'https://content.sbigeneral.in/uploads/978a5ca67ab241dba8e8e865be1df963.pdf',
    isPaperless: false,
  },
  DIGIT: {
    id: 'DIGIT',
    name: 'Go Digit',
    claimFormUrl: '',
    isPaperless: true,
  },
  ACKO: {
    id: 'ACKO',
    name: 'Acko General',
    claimFormUrl: '',
    isPaperless: true,
  },
}

export function matchInsuranceProviderId(companyName: string | null | undefined): string | undefined {
  const raw = String(companyName || '').trim().toLowerCase()
  if (!raw) return undefined
  const match = Object.values(INSURANCE_PROVIDERS).find((provider) => {
    const name = provider.name.toLowerCase()
    const id = provider.id.toLowerCase().replace(/_/g, ' ')
    return raw.includes(name) || name.includes(raw) || raw.includes(id)
  })
  return match?.id
}
