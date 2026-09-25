export type ClaimMode = 'insurance' | 'cash'
export type OwnershipType = 'individual' | 'firm'

export type CustomerClaimDocumentDef = {
  docKey: string
  title: string
  subtitle: string
  /** Counts toward home / progress when true */
  required: boolean
  condition?: 'firm' | 'optional_major'
  hint: string
}

/** Shared catalog for Documents tab + home progress card (bodyshop upload API). */
export const CUSTOMER_CLAIM_DOCUMENTS: CustomerClaimDocumentDef[] = [
  { docKey: 'doc_rc', title: 'Registration Certificate (RC)', subtitle: 'Vehicle ownership proof', required: true, hint: 'Upload clear RC or a PDF copy.' },
  { docKey: 'doc_insurance', title: 'Insurance Policy Copy', subtitle: 'Current policy schedule', required: true, hint: 'Upload the current insurance policy PDF or clear photos.' },
  { docKey: 'doc_dl', title: 'Driving Licence', subtitle: 'Driver at time of accident', required: true, hint: 'One photo or one PDF that shows both the front and the back.' },
  { docKey: 'doc_claim_form', title: 'Signed Insurance Claim Form', subtitle: 'Signed claim declaration', required: true, hint: 'Upload the filled and signed insurer claim form.' },
  { docKey: 'doc_aadhaar', title: 'Aadhaar Card', subtitle: 'KYC identity proof', required: true, hint: 'One photo or one PDF that shows both the front and the back.' },
  { docKey: 'doc_pan', title: 'PAN Card', subtitle: 'Customer PAN', required: true, hint: 'Upload a clear PAN card image.' },
  { docKey: 'doc_gst', title: 'GST Registration Certificate', subtitle: 'For firm/company vehicles', required: true, condition: 'firm', hint: 'Required when the vehicle is registered to a firm/company.' },
  { docKey: 'doc_company_pan', title: 'Company PAN', subtitle: 'For firm/company vehicles', required: true, condition: 'firm', hint: 'Required when the vehicle is registered to a firm/company.' },
  {
    docKey: 'doc_bank_detail',
    title: 'Bank details / cancelled cheque',
    subtitle: 'Optional — claim settlement account',
    required: false,
    hint: 'Optional. Upload cancelled cheque or bank passbook if claim credit is needed.',
  },
  { docKey: 'doc_kyc', title: 'KYC Form', subtitle: 'For major/insurer-specific cases', required: false, condition: 'optional_major', hint: 'Upload completed KYC if requested for the claim.' },
]

export function listClaimDocumentsForUpload(claimMode: ClaimMode, ownershipType: OwnershipType): CustomerClaimDocumentDef[] {
  if (claimMode === 'cash') return []
  return CUSTOMER_CLAIM_DOCUMENTS.filter((doc) => {
    if (doc.condition === 'firm') return ownershipType === 'firm'
    if (doc.condition === 'optional_major') return true
    return true
  })
}

export function listMandatoryClaimDocuments(claimMode: ClaimMode, ownershipType: OwnershipType): CustomerClaimDocumentDef[] {
  return listClaimDocumentsForUpload(claimMode, ownershipType).filter((doc) => doc.required)
}

export function claimModeFromRepairCard(card: Record<string, unknown> | null): ClaimMode {
  if (!card) return 'insurance'
  const insured = Boolean(card.insurance_company || card.insurance_policy_no || card.claim_intimation_no)
  return insured ? 'insurance' : 'cash'
}

export function ownershipFromRepairCard(card: Record<string, unknown> | null): OwnershipType {
  const cardType = String(card?.customer_type || '').toLowerCase()
  return cardType.includes('firm') || cardType.includes('company') ? 'firm' : 'individual'
}
