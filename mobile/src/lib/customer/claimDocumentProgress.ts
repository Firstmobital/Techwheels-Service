import { customerGetRepairCard } from '../api/customerPortal'
import type { CustomerBodyshopAsset } from '../api/customerBodyshopUploads'
import type { ClaimMode } from './customerClaimDocuments'
import {
  mergeRepairCardIntoDocumentsCache,
  readCustomerDocumentsCache,
  syncCustomerDocumentsFromServer,
} from './customerDocumentsCache'
import { countMandatoryDocumentProgress } from './repairCardDocuments'

export type ClaimDocumentProgress = {
  claimMode: ClaimMode
  totalRequired: number
  uploadedCount: number
  remainingCount: number
  progressPercent: number
  missingSummary: string
  missingTitles: string[]
}

function buildMissingSummary(titles: string[]): string {
  if (titles.length === 0) return ''
  if (titles.length === 1) return `${titles[0]} is missing`
  if (titles.length === 2) return `${titles[0]} is missing and ${titles[1]} is missing`
  return `${titles[0]} is missing and ${titles[1]} is missing, and ${titles.length - 2} more`
}

export function claimDocumentProgressFromSnapshot(
  card: Record<string, unknown> | null,
  driveDocuments?: CustomerBodyshopAsset[] | null
): ClaimDocumentProgress {
  const stats = countMandatoryDocumentProgress(card, undefined, undefined, driveDocuments)
  return {
    claimMode: stats.claimMode,
    totalRequired: stats.totalRequired,
    uploadedCount: stats.uploadedCount,
    remainingCount: stats.remainingCount,
    progressPercent: stats.progressPercent,
    missingSummary: buildMissingSummary(stats.missingTitles.slice(0, 3)),
    missingTitles: stats.missingTitles,
  }
}

/** @deprecated alias */
export const claimDocumentProgressFromRepairCard = claimDocumentProgressFromSnapshot

export async function loadClaimDocumentProgress(
  regNumber: string | null | undefined,
  sessionToken?: string | null
): Promise<ClaimDocumentProgress> {
  let card: Record<string, unknown> | null = null
  let driveDocuments: CustomerBodyshopAsset[] = []

  if (regNumber) {
    const cached = await readCustomerDocumentsCache(regNumber)
    card = cached?.repairCard ?? null
    driveDocuments = cached?.documents ?? []
  }

  if (sessionToken && regNumber) {
    try {
      const fresh = await syncCustomerDocumentsFromServer(sessionToken, regNumber)
      card = fresh.repairCard
      driveDocuments = fresh.documents
    } catch {
      try {
        const repairCard = await customerGetRepairCard(sessionToken, regNumber)
        if (repairCard) {
          card = repairCard
          await mergeRepairCardIntoDocumentsCache(regNumber, repairCard)
        }
      } catch {
        // keep cache
      }
    }
  }

  return claimDocumentProgressFromSnapshot(card, driveDocuments)
}

export async function loadClaimDocumentProgressFromCache(
  regNumber: string | null | undefined
): Promise<ClaimDocumentProgress | null> {
  if (!regNumber) return null
  const cached = await readCustomerDocumentsCache(regNumber)
  if (!cached?.repairCard && !cached?.documents?.length) return null
  return claimDocumentProgressFromSnapshot(cached.repairCard, cached.documents)
}
