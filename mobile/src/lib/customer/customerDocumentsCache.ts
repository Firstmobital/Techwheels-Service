import { customerGetRepairCard } from '../api/customerPortal'
import {
  customerListBodyshopAssets,
  type CustomerBodyshopAsset,
} from '../api/customerBodyshopUploads'

export type CustomerDocumentsSnapshot = {
  repairCard: Record<string, unknown> | null
  documents: CustomerBodyshopAsset[]
  photos: CustomerBodyshopAsset[]
}

/** @deprecated use CustomerDocumentsSnapshot */
export type CustomerDocumentsCachePayload = CustomerDocumentsSnapshot & { cachedAt?: number }

const inflight = new Map<string, Promise<CustomerDocumentsSnapshot>>()

function regKey(regNumber: string) {
  return regNumber.trim().toUpperCase().replace(/[\s-]/g, '')
}

export type FetchCustomerDocumentsOptions = {
  /** Skip repair-card RPC when visit context already has a card. */
  repairCard?: Record<string, unknown> | null
  /** When true, always refetch repair card from the server. */
  refreshRepairCard?: boolean
}

/** Pure helper — used by fetchCustomerDocuments and unit tests. */
export function shouldUseContextRepairCardForDocuments(opts?: FetchCustomerDocumentsOptions): boolean {
  return !opts?.refreshRepairCard && opts != null && 'repairCard' in opts
}

/** Load repair card + bodyshop assets from the server (deduped in-flight per vehicle). */
export async function fetchCustomerDocuments(
  sessionToken: string,
  regNumber: string,
  opts?: FetchCustomerDocumentsOptions
): Promise<CustomerDocumentsSnapshot> {
  const key = regKey(regNumber)
  const existing = inflight.get(key)
  if (existing) return existing

  const job = (async () => {
    const useContextCard = shouldUseContextRepairCardForDocuments(opts)
    const repairCardPromise = useContextCard
      ? Promise.resolve(opts!.repairCard ?? null)
      : customerGetRepairCard(sessionToken, regNumber, {
          bypassCache: opts?.refreshRepairCard ?? false,
        }).catch(() => null)

    const [repairCard, assets] = await Promise.all([
      repairCardPromise,
      customerListBodyshopAssets(sessionToken, regNumber).catch(() => ({
        documents: [] as CustomerBodyshopAsset[],
        photos: [] as CustomerBodyshopAsset[],
      })),
    ])
    return {
      repairCard,
      documents: assets.documents,
      photos: assets.photos,
    }
  })().finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, job)
  return job
}

/** @deprecated alias — no local cache; always hits the backend. */
export const syncCustomerDocumentsFromServer = fetchCustomerDocuments

export function resetCustomerDocumentsInflight(): void {
  inflight.clear()
}
