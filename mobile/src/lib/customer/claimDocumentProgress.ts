import { customerGetRepairCard } from '../api/customerPortal'
import type { ClaimMode } from './customerClaimDocuments'
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

/** PRD ┬º5.3 / AC-02 ΓÇö progress from repair card + mandatory doc matrix (not local-only storage). */
export async function loadClaimDocumentProgress(
  regNumber: string | null | undefined,
  sessionToken?: string | null
): Promise<ClaimDocumentProgress> {
  let card: Record<string, unknown> | null = null
  if (sessionToken && regNumber) {
    try {
      card = await customerGetRepairCard(sessionToken, regNumber)
    } catch {
      card = null
    }
  }

  const stats = countMandatoryDocumentProgress(card)

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
