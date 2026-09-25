import { customerGetRepairCard } from '../api/customerPortal'
import { customerListBodyshopAssets } from '../api/customerBodyshopUploads'
import {
  claimModeFromRepairCard,
  listMandatoryClaimDocuments,
  ownershipFromRepairCard,
  type ClaimMode,
} from './customerClaimDocuments'

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

export async function loadClaimDocumentProgress(
  sessionToken: string | null | undefined,
  regNumber: string | null | undefined
): Promise<ClaimDocumentProgress> {
  const empty: ClaimDocumentProgress = {
    claimMode: 'insurance',
    totalRequired: 0,
    uploadedCount: 0,
    remainingCount: 0,
    progressPercent: 100,
    missingSummary: '',
    missingTitles: [],
  }
  if (!sessionToken || !regNumber) return empty

  const card = await customerGetRepairCard(sessionToken, regNumber).catch(() => null)
  const claimMode = claimModeFromRepairCard(card)
  const ownershipType = ownershipFromRepairCard(card)
  const mandatory = listMandatoryClaimDocuments(claimMode, ownershipType)
  if (mandatory.length === 0) {
    return { ...empty, claimMode }
  }

  const assets = await customerListBodyshopAssets(sessionToken, regNumber).catch(() => ({
    documents: [],
    photos: [],
  }))
  const submittedKeys = new Set(
    assets.documents
      .filter((doc) => Boolean(String(doc.drive_url || doc.view_url || '').trim()) && !doc.drive_pending)
      .map((doc) => String(doc.doc_key || ''))
      .filter(Boolean)
  )

  const missing = mandatory.filter((doc) => !submittedKeys.has(doc.docKey))
  const uploadedCount = mandatory.length - missing.length
  const totalRequired = mandatory.length
  const progressPercent = Math.round((uploadedCount / totalRequired) * 100)

  return {
    claimMode,
    totalRequired,
    uploadedCount,
    remainingCount: missing.length,
    progressPercent,
    missingSummary: buildMissingSummary(missing.map((doc) => doc.title).slice(0, 3)),
    missingTitles: missing.map((doc) => doc.title),
  }
}
