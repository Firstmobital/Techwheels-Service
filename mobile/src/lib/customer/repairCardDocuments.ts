import {
  claimModeFromRepairCard,
  listMandatoryClaimDocuments,
  listClaimDocumentsForUpload,
  ownershipFromRepairCard,
  type ClaimMode,
  type OwnershipType,
} from './customerClaimDocuments'

export function isRepairCardDocComplete(card: Record<string, unknown> | null, docKey: string): boolean {
  if (!card) return false
  if (card[docKey] === true) return true

  const uploaded = Array.isArray(card.uploaded_documents)
    ? (card.uploaded_documents as { doc_key?: string }[])
    : []
  return uploaded.some((row) => String(row.doc_key || '').trim() === docKey)
}

export function countMandatoryDocumentProgress(
  card: Record<string, unknown> | null,
  claimMode?: ClaimMode,
  ownershipType?: OwnershipType
): {
  claimMode: ClaimMode
  ownershipType: OwnershipType
  totalRequired: number
  uploadedCount: number
  remainingCount: number
  progressPercent: number
  missingTitles: string[]
} {
  const mode = claimMode ?? claimModeFromRepairCard(card)
  const owner = ownershipType ?? ownershipFromRepairCard(card)
  const mandatory = listMandatoryClaimDocuments(mode, owner)
  const totalRequired = mandatory.length
  const missingTitles: string[] = []

  let uploadedCount = 0
  for (const doc of mandatory) {
    if (isRepairCardDocComplete(card, doc.docKey)) {
      uploadedCount += 1
    } else {
      missingTitles.push(doc.title)
    }
  }

  const remainingCount = Math.max(0, totalRequired - uploadedCount)
  const progressPercent = totalRequired > 0 ? Math.round((uploadedCount / totalRequired) * 100) : 100

  return {
    claimMode: mode,
    ownershipType: owner,
    totalRequired,
    uploadedCount,
    remainingCount,
    progressPercent,
    missingTitles,
  }
}

export function listVisibleClaimDocuments(card: Record<string, unknown> | null) {
  const mode = claimModeFromRepairCard(card)
  const owner = ownershipFromRepairCard(card)
  return { mode, owner, documents: listClaimDocumentsForUpload(mode, owner) }
}
