export type ClaimMode = 'insurance' | 'cash'
export type OwnershipType = 'individual' | 'firm'

/** Matches web BodyshopRepairPage BODYSHOP_DOCS mandatoryFor. */
export type CustomerDocAudience = OwnershipType

export type CustomerClaimDocumentDef = {
  docKey: string
  title: string
  subtitle: string
  hint: string
  /** When true, counts toward progress if mandatoryFor includes the customer type. */
  required: boolean
  /** Empty = optional for all insurance claims (KYC, T/P affidavit). */
  mandatoryFor: CustomerDocAudience[]
}

/**
 * Same rules as web mandatory documents (individual vs firm).
 * Individual: RC, insurance, DL, claim form, Aadhaar, PAN (6).
 * Firm: those + GST, company PAN, bank details (9).
 */
export const CUSTOMER_CLAIM_DOCUMENTS: CustomerClaimDocumentDef[] = [
  {
    docKey: 'doc_claim_form',
    title: 'Signed Insurance Claim Form (PDF)',
    subtitle: 'Signed claim declaration PDF',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: '📄 Please upload as a PDF file.',
  },
  {
    docKey: 'doc_rc',
    title: 'Registration Certificate / RC',
    subtitle: 'Vehicle ownership proof',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of RC Front side.',
  },
  {
    docKey: 'doc_rc_back',
    title: 'Registration Certificate / RC',
    subtitle: 'Back side',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of RC Back side.',
  },
  {
    docKey: 'doc_insurance',
    title: 'Insurance Policy Copy (PDF)',
    subtitle: 'Current policy schedule PDF',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: '📄 Please upload as a PDF file.',
  },
  {
    docKey: 'doc_dl',
    title: 'Driving Licence',
    subtitle: 'Driver licence',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of DL Front side.',
  },
  {
    docKey: 'doc_dl_back',
    title: 'Driving Licence',
    subtitle: 'Back side',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of DL Back side.',
  },
  {
    docKey: 'doc_aadhaar',
    title: 'Aadhaar Card',
    subtitle: 'KYC photo ID',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of Aadhaar Front side.',
  },
  {
    docKey: 'doc_aadhaar_back',
    title: 'Aadhaar Card',
    subtitle: 'Back side',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of Aadhaar Back side.',
  },
  {
    docKey: 'doc_pan',
    title: 'PAN Card',
    subtitle: 'Customer PAN Card',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of PAN card.',
  },
  {
    docKey: 'doc_gst',
    title: 'GST Registration Certificate (PDF)',
    subtitle: 'Firm / company registration PDF',
    required: true,
    mandatoryFor: ['firm'],
    hint: '📄 Please upload as a PDF file.',
  },
  {
    docKey: 'doc_company_pan',
    title: 'Company PAN Card',
    subtitle: 'Firm / company PAN card',
    required: true,
    mandatoryFor: ['firm'],
    hint: 'Upload clear photo of Company PAN card.',
  },
  {
    docKey: 'doc_bank_detail',
    title: 'Bank Details / Cancelled Cheque (PDF)',
    subtitle: 'Claim settlement account PDF',
    required: true,
    mandatoryFor: ['firm'],
    hint: '📄 Please upload as a PDF file.',
  },
  {
    docKey: 'doc_kyc',
    title: 'KYC Form (PDF)',
    subtitle: 'Optional — insurer-specific PDF',
    required: false,
    mandatoryFor: [],
    hint: '📄 Optional: Upload as a PDF file.',
  },
  {
    docKey: 'doc_tp_affidavit',
    title: 'T/P Affidavit (PDF)',
    subtitle: 'Optional — third party PDF',
    required: false,
    mandatoryFor: [],
    hint: '📄 Optional: Upload as a PDF file.',
  },
]

export function documentAppliesToCustomerType(
  doc: CustomerClaimDocumentDef,
  ownershipType: OwnershipType
): boolean {
  if (doc.mandatoryFor.length === 0) return true
  return doc.mandatoryFor.includes(ownershipType)
}

export function listClaimDocumentsForUpload(
  claimMode: ClaimMode,
  ownershipType: OwnershipType
): CustomerClaimDocumentDef[] {
  if (claimMode === 'cash') return []
  return CUSTOMER_CLAIM_DOCUMENTS.filter((doc) => documentAppliesToCustomerType(doc, ownershipType))
}

export function listMandatoryClaimDocuments(
  claimMode: ClaimMode,
  ownershipType: OwnershipType
): CustomerClaimDocumentDef[] {
  return listClaimDocumentsForUpload(claimMode, ownershipType).filter((doc) => doc.required)
}

export function claimModeFromRepairCard(card: Record<string, unknown> | null): ClaimMode {
  if (!card) return 'cash'
  const ct = String(card.customer_type || '').trim().toLowerCase()
  if (ct === 'cash' || ct === 'foc' || ct === 'mechanical' || ct === 'paid') return 'cash'
  return 'insurance'
}

/** Front + back uploads shown as one card in the customer app. */
export const CUSTOMER_TWO_SIDED_DOC_PAIRS = [
  {
    frontKey: 'doc_aadhaar',
    backKey: 'doc_aadhaar_back',
    title: 'Aadhaar Card',
    hint: 'Upload clear photos of the front and back of your Aadhaar card.',
  },
  {
    frontKey: 'doc_dl',
    backKey: 'doc_dl_back',
    title: 'Driving Licence',
    hint: 'Upload clear photos of the front and back of your driving licence.',
  },
  {
    frontKey: 'doc_rc',
    backKey: 'doc_rc_back',
    title: 'Registration Certificate (RC)',
    hint: 'Upload clear photos of the front and back of your RC.',
  },
] as const

export type CustomerDocumentDisplayItem =
  | { kind: 'single'; slot: CustomerClaimDocumentDef }
  | {
      kind: 'two-sided'
      title: string
      hint: string
      front: CustomerClaimDocumentDef
      back: CustomerClaimDocumentDef
    }

/** Merge front/back doc keys into one UI row each, preserving list order. */
export function buildCustomerDocumentDisplayList(
  slots: CustomerClaimDocumentDef[]
): CustomerDocumentDisplayItem[] {
  const pairByFront = new Map<string, (typeof CUSTOMER_TWO_SIDED_DOC_PAIRS)[number]>(
    CUSTOMER_TWO_SIDED_DOC_PAIRS.map((p) => [p.frontKey, p])
  )
  const backKeys = new Set<string>(CUSTOMER_TWO_SIDED_DOC_PAIRS.map((p) => p.backKey))
  const slotByKey = new Map(slots.map((s) => [s.docKey, s]))
  const used = new Set<string>()
  const out: CustomerDocumentDisplayItem[] = []

  for (const slot of slots) {
    if (used.has(slot.docKey) || backKeys.has(slot.docKey)) continue

    const pair = pairByFront.get(slot.docKey)
    const backSlot = pair ? slotByKey.get(pair.backKey) : undefined
    if (pair && backSlot) {
      used.add(slot.docKey)
      used.add(pair.backKey)
      out.push({
        kind: 'two-sided',
        title: pair.title,
        hint: pair.hint,
        front: slot,
        back: backSlot,
      })
      continue
    }

    out.push({ kind: 'single', slot })
  }

  return out
}

export function ownershipFromRepairCard(card: Record<string, unknown> | null): OwnershipType {
  const cardType = String(card?.customer_type || '').trim().toLowerCase()
  if (cardType === 'firm' || cardType.includes('company') || cardType.includes('gst')) {
    return 'firm'
  }
  return 'individual'
}
