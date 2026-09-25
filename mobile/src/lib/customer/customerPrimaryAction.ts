import type { ClaimMode } from './customerClaimDocuments'

export type CustomerPrimaryAction = {
  message: string
  detail?: string
  ctaLabel: string
  route: '/(customer)/documents' | '/(customer)/estimate' | '/(customer)/invoices'
}

export function resolveCustomerPrimaryAction(input: {
  claimMode: ClaimMode
  missingMandatoryDocs: number
  currentStage: number
  estimateApprovalPending?: boolean
  additionalApprovalPending?: boolean
  customerSettlementDue?: boolean
  /** Home uses Needs You card for documents; journey screen sets true. */
  includeDocumentAction?: boolean
}): CustomerPrimaryAction | null {
  if (
    input.includeDocumentAction !== false &&
    input.claimMode === 'insurance' &&
    input.missingMandatoryDocs > 0
  ) {
    const n = input.missingMandatoryDocs
    return {
      message: n === 1 ? '1 document still needed' : `${n} documents still needed`,
      detail: 'Upload claim paperwork so the surveyor can proceed.',
      ctaLabel: 'Upload Documents',
      route: '/(customer)/documents',
    }
  }

  if (input.additionalApprovalPending || (input.currentStage === 12 && input.estimateApprovalPending)) {
    return {
      message: 'Additional repair approval required',
      detail: 'Supplementary work needs your approval before the workshop continues.',
      ctaLabel: 'Review & Approve',
      route: '/(customer)/estimate',
    }
  }

  if (input.estimateApprovalPending && input.currentStage >= 6 && input.currentStage <= 7) {
    return {
      message: 'Estimate approval is pending',
      detail: 'Review the workshop quotation and approve or reject.',
      ctaLabel: 'Review & Approve',
      route: '/(customer)/estimate',
    }
  }

  if (input.customerSettlementDue && input.currentStage >= 15) {
    return {
      message: 'Customer payment / settlement pending',
      detail: 'View billing and any amount payable before handover.',
      ctaLabel: 'View Billing',
      route: '/(customer)/invoices',
    }
  }

  return null
}

export function readEstimateApprovalPending(card: Record<string, unknown> | null): boolean {
  if (!card) return false
  const approved = card.customer_estimate_approved ?? card.estimate_customer_approved
  if (approved === true) return false
  const stage = Number(card.current_stage || 0)
  if (stage >= 7 && approved === false) return true
  const hasEstimate = Boolean(card.estimate_amount || card.estimate_document || card.estimate_prepared_at)
  return hasEstimate && approved !== true && stage >= 6 && stage <= 7
}

export function readAdditionalApprovalPending(card: Record<string, unknown> | null): boolean {
  if (!card) return false
  const flag = card.additional_approval_pending ?? card.supplementary_approval_pending
  if (typeof flag === 'boolean') return flag
  const stage = Number(card.current_stage || 0)
  return stage === 12 && Boolean(card.additional_estimate_amount || card.additional_approval_required)
}
