import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  getActiveClaimDocumentSlots,
  type ClaimMode,
  type OwnershipType,
} from '../../app/(customer)/documents'

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

export async function loadClaimDocumentProgress(regNumber: string | null | undefined): Promise<ClaimDocumentProgress> {
  const storageKey = `claim_docs_${regNumber || 'default'}`
  let claimMode: ClaimMode = 'insurance'
  let ownershipType: OwnershipType = 'individual'
  let uploads: Record<string, { uri?: string }> = {}

  try {
    const raw = await AsyncStorage.getItem(storageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as {
        uploads?: Record<string, { uri?: string }>
        claimMode?: ClaimMode
        ownershipType?: OwnershipType
      }
      uploads = parsed.uploads || {}
      if (parsed.claimMode) claimMode = parsed.claimMode
      if (parsed.ownershipType) ownershipType = parsed.ownershipType
    }
  } catch {
    // ignore
  }

  const activeSlots = getActiveClaimDocumentSlots(claimMode, ownershipType)
  const mandatorySlots = activeSlots.filter((s) => s.isMandatory)
  const totalRequired = mandatorySlots.length
  const uploadedCount = mandatorySlots.filter((s) => Boolean(uploads[s.id]?.uri)).length
  const remainingCount = Math.max(0, totalRequired - uploadedCount)
  const progressPercent = totalRequired > 0 ? Math.round((uploadedCount / totalRequired) * 100) : 100

  const missingTitles = mandatorySlots
    .filter((s) => !uploads[s.id]?.uri)
    .map((s) => {
      if (s.pageNumber && s.totalPages && s.totalPages > 1) {
        return `${s.title} (${s.slotLabel})`
      }
      return s.title
    })

  return {
    claimMode,
    totalRequired,
    uploadedCount,
    remainingCount,
    progressPercent,
    missingSummary: buildMissingSummary(missingTitles.slice(0, 3)),
    missingTitles,
  }
}
