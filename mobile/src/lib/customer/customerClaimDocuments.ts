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
    title: 'Registration Certificate / RC (Front)',
    subtitle: 'Vehicle ownership proof - Front side',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of RC Front side.',
  },
  {
    docKey: 'doc_rc_back',
    title: 'Registration Certificate / RC (Back)',
    subtitle: 'Vehicle ownership proof - Back side',
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
    title: 'Driving Licence (Front)',
    subtitle: 'Driver DL - Front side',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of DL Front side.',
  },
  {
    docKey: 'doc_dl_back',
    title: 'Driving Licence (Back)',
    subtitle: 'Driver DL - Back side',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of DL Back side.',
  },
  {
    docKey: 'doc_aadhaar',
    title: 'Aadhaar Card (Front)',
    subtitle: 'KYC photo ID - Front side',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear photo of Aadhaar Front side.',
  },
  {
    docKey: 'doc_aadhaar_back',
    title: 'Aadhaar Card (Back)',
    subtitle: 'KYC address proof - Back side',
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

export function ownershipFromRepairCard(card: Record<string, unknown> | null): OwnershipType {
  const cardType = String(card?.customer_type || '').trim().toLowerCase()
  if (cardType === 'firm' || cardType.includes('company') || cardType.includes('gst')) {
    return 'firm'
  }
  return 'individual'
}
