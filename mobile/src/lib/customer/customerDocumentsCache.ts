import AsyncStorage from '@react-native-async-storage/async-storage'
import { customerGetRepairCard } from '../api/customerPortal'
import {
  customerListBodyshopAssets,
  type CustomerBodyshopAsset,
} from '../api/customerBodyshopUploads'
import { offlineStorage } from '../offlineStorage'

export type CustomerDocumentsCachePayload = {
  repairCard: Record<string, unknown> | null
  documents: CustomerBodyshopAsset[]
  photos: CustomerBodyshopAsset[]
  cachedAt: number
}

const CACHE_KEY_PREFIX = 'customer_docs_'
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000

const memoryByReg = new Map<string, CustomerDocumentsCachePayload>()
const syncInflight = new Map<string, Promise<CustomerDocumentsCachePayload>>()

export function normalizeRegForDocumentsCache(regNumber: string) {
  return regNumber.trim().toUpperCase().replace(/[\s-]/g, '')
}

function storageKey(regNumber: string) {
  return `${CACHE_KEY_PREFIX}${normalizeRegForDocumentsCache(regNumber)}`
}

function regKey(regNumber: string) {
  return normalizeRegForDocumentsCache(regNumber)
}

function normalizePayload(raw: Partial<CustomerDocumentsCachePayload> | null): CustomerDocumentsCachePayload | null {
  if (!raw) return null
  return {
    repairCard: raw.repairCard ?? null,
    documents: Array.isArray(raw.documents) ? raw.documents : [],
    photos: Array.isArray(raw.photos) ? raw.photos : [],
    cachedAt: typeof raw.cachedAt === 'number' ? raw.cachedAt : Date.now(),
  }
}

function rememberInMemory(regNumber: string, payload: CustomerDocumentsCachePayload) {
  memoryByReg.set(regKey(regNumber), payload)
}

/** Synchronous read when memory was hydrated (same app session). */
export function peekCustomerDocumentsMemory(
  regNumber: string | null | undefined
): CustomerDocumentsCachePayload | null {
  if (!regNumber?.trim()) return null
  return memoryByReg.get(regKey(regNumber)) ?? null
}

export async function readCustomerDocumentsCache(
  regNumber: string | null | undefined
): Promise<CustomerDocumentsCachePayload | null> {
  if (!regNumber?.trim()) return null

  const mem = peekCustomerDocumentsMemory(regNumber)
  if (mem) return mem

  const disk = normalizePayload(await offlineStorage.get<CustomerDocumentsCachePayload>(storageKey(regNumber)))
  if (disk) {
    rememberInMemory(regNumber, disk)
  }
  return disk
}

export async function writeCustomerDocumentsCache(
  regNumber: string,
  payload: CustomerDocumentsCachePayload
): Promise<void> {
  const normalized = normalizePayload(payload)
  if (!normalized) return
  rememberInMemory(regNumber, normalized)
  await offlineStorage.set(storageKey(regNumber), normalized, CACHE_TTL_MS)
}

export async function mergeRepairCardIntoDocumentsCache(
  regNumber: string,
  repairCard: Record<string, unknown> | null
): Promise<void> {
  const existing =
    (await readCustomerDocumentsCache(regNumber)) ??
    ({
      repairCard: null,
      documents: [],
      photos: [],
      cachedAt: Date.now(),
    } satisfies CustomerDocumentsCachePayload)
  await writeCustomerDocumentsCache(regNumber, {
    ...existing,
    repairCard,
    cachedAt: Date.now(),
  })
}

/** Load disk → memory without network (call after login restore). */
export async function warmCustomerDocumentsMemory(regNumber: string): Promise<void> {
  await readCustomerDocumentsCache(regNumber)
}

export async function warmCustomerDocumentsMemoryForRegs(regNumbers: string[]): Promise<void> {
  await Promise.all(regNumbers.map((reg) => warmCustomerDocumentsMemory(reg)))
}

/** Fetch repair card + assets, persist locally, return fresh snapshot (deduped per reg). */
export async function syncCustomerDocumentsFromServer(
  sessionToken: string,
  regNumber: string
): Promise<CustomerDocumentsCachePayload> {
  const key = regKey(regNumber)
  const inflight = syncInflight.get(key)
  if (inflight) return inflight

  const job = (async () => {
    const [repairCard, assets] = await Promise.all([
      customerGetRepairCard(sessionToken, regNumber).catch(() => null),
      customerListBodyshopAssets(sessionToken, regNumber).catch(() => ({
        documents: [] as CustomerBodyshopAsset[],
        photos: [] as CustomerBodyshopAsset[],
      })),
    ])
    const payload: CustomerDocumentsCachePayload = {
      repairCard,
      documents: assets.documents,
      photos: assets.photos,
      cachedAt: Date.now(),
    }
    await writeCustomerDocumentsCache(regNumber, payload)
    return payload
  })().finally(() => {
    syncInflight.delete(key)
  })

  syncInflight.set(key, job)
  return job
}

export async function clearAllCustomerDocumentsCaches(): Promise<void> {
  memoryByReg.clear()
  syncInflight.clear()
  try {
    const keys = await AsyncStorage.getAllKeys()
    const prefix = `tw_cache_${CACHE_KEY_PREFIX}`
    const toRemove = keys.filter((k) => k.startsWith(prefix))
    if (toRemove.length > 0) {
      await AsyncStorage.multiRemove(toRemove)
    }
  } catch {
    // ignore
  }
}
