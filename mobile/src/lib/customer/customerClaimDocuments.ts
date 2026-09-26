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
    title: 'Signed Insurance Claim Form',
    subtitle: 'Signed claim declaration',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload the filled and signed insurer claim form.',
  },
  {
    docKey: 'doc_rc',
    title: 'Registration Certificate (RC)',
    subtitle: 'Vehicle ownership proof',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload clear RC or a PDF copy.',
  },
  {
    docKey: 'doc_insurance',
    title: 'Insurance Policy Copy',
    subtitle: 'Current policy schedule',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload the current insurance policy PDF or clear photos.',
  },
  {
    docKey: 'doc_dl',
    title: 'Driving Licence',
    subtitle: 'Driver at time of accident',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'One photo or one PDF that shows both the front and the back.',
  },
  {
    docKey: 'doc_aadhaar',
    title: 'Aadhaar Card',
    subtitle: 'KYC identity proof',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'One photo or one PDF that shows both the front and the back.',
  },
  {
    docKey: 'doc_pan',
    title: 'PAN Card',
    subtitle: 'Customer PAN',
    required: true,
    mandatoryFor: ['individual', 'firm'],
    hint: 'Upload a clear PAN card image.',
  },
  {
    docKey: 'doc_gst',
    title: 'GST Registration Certificate',
    subtitle: 'Firm / company registration',
    required: true,
    mandatoryFor: ['firm'],
    hint: 'Required when the vehicle is registered to a firm or company.',
  },
  {
    docKey: 'doc_company_pan',
    title: 'Company PAN',
    subtitle: 'Firm / company PAN',
    required: true,
    mandatoryFor: ['firm'],
    hint: 'Required when the vehicle is registered to a firm or company.',
  },
  {
    docKey: 'doc_bank_detail',
    title: 'Bank details / cancelled cheque',
    subtitle: 'Claim settlement account (firm)',
    required: true,
    mandatoryFor: ['firm'],
    hint: 'Upload cancelled cheque or bank passbook for claim credit.',
  },
  {
    docKey: 'doc_kyc',
    title: 'KYC Form',
    subtitle: 'Optional — insurer-specific',
    required: false,
    mandatoryFor: [],
    hint: 'Upload completed KYC if requested for the claim.',
  },
  {
    docKey: 'doc_tp_affidavit',
    title: 'T/P Affidavit',
    subtitle: 'Optional — third party',
    required: false,
    mandatoryFor: [],
    hint: 'Upload notarized T/P affidavit when applicable.',
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
  if (!card) return 'insurance'
  const ct = String(card.customer_type || '').trim().toLowerCase()
  if (ct === 'cash' || ct === 'foc') return 'cash'
  return 'insurance'
}

export function ownershipFromRepairCard(card: Record<string, unknown> | null): OwnershipType {
  const cardType = String(card?.customer_type || '').trim().toLowerCase()
  if (cardType === 'firm' || cardType.includes('company') || cardType.includes('gst')) {
    return 'firm'
  }
  return 'individual'
}
