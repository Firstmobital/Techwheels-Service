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

/** Load repair card + bodyshop assets from the server (deduped in-flight per vehicle). */
export async function fetchCustomerDocuments(
  sessionToken: string,
  regNumber: string
): Promise<CustomerDocumentsSnapshot> {
  const key = regKey(regNumber)
  const existing = inflight.get(key)
  if (existing) return existing

  const job = (async () => {
    const [repairCard, assets] = await Promise.all([
      customerGetRepairCard(sessionToken, regNumber).catch(() => null),
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
