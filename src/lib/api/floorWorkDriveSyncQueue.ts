import type { BodyshopFloorRoleDailyLogPhotoRow } from '../bodyshopFloorRoleWorkLog'
import { pushFloorWorkPhotoToGoogleDrive } from './bodyshopFloorRoleWorkLog'

type PendingItem = {
  photo: BodyshopFloorRoleDailyLogPhotoRow
  jobCardNumber: string
  attempt: number
}

const pendingById = new Map<number, PendingItem>()
const listeners = new Set<(photos: BodyshopFloorRoleDailyLogPhotoRow[]) => void>()

let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushing = false

const RETRY_MS = [5_000, 12_000, 25_000, 45_000, 90_000, 180_000]

function retryDelayMs(attempt: number): number {
  if (attempt < RETRY_MS.length) return RETRY_MS[attempt]
  return 180_000
}

export function floorWorkPhotoNeedsDriveSync(photo: BodyshopFloorRoleDailyLogPhotoRow): boolean {
  if (!photo?.id || !String(photo.storage_path ?? '').trim()) return false
  return !String(photo.drive_url ?? '').trim()
}

export function enqueueFloorWorkDriveAutoSync(
  photos: BodyshopFloorRoleDailyLogPhotoRow[],
  jobCardNumber: string,
): void {
  const jc = String(jobCardNumber ?? '').trim()
  if (!jc || photos.length === 0) return
  for (const photo of photos) {
    if (!floorWorkPhotoNeedsDriveSync(photo)) continue
    const prev = pendingById.get(photo.id)
    pendingById.set(photo.id, {
      photo,
      jobCardNumber: jc,
      attempt: prev?.attempt ?? 0,
    })
  }
  if (pendingById.size > 0) scheduleFlush(0)
}

export function subscribeFloorWorkDriveAutoSync(
  listener: (photos: BodyshopFloorRoleDailyLogPhotoRow[]) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifySynced(synced: BodyshopFloorRoleDailyLogPhotoRow[]) {
  if (synced.length === 0) return
  for (const listener of listeners) {
    try {
      listener(synced)
    } catch {
      /* ignore */
    }
  }
}

function scheduleFlush(delayMs: number) {
  if (flushing) return
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushPendingDriveSync()
  }, Math.max(0, delayMs))
}

async function flushPendingDriveSync(): Promise<void> {
  if (flushing || pendingById.size === 0) return
  flushing = true
  const synced: BodyshopFloorRoleDailyLogPhotoRow[] = []
  let nextDelay = 180_000

  for (const [photoId, item] of [...pendingById.entries()]) {
    try {
      const row = await pushFloorWorkPhotoToGoogleDrive({
        photoId: item.photo.id,
        storagePath: item.photo.storage_path,
        fileSizeBytes: Number(item.photo.file_size_bytes) || 0,
        regNumber: item.photo.reg_number,
        jobCardNumber: item.jobCardNumber,
      })
      if (row && String(row.drive_url ?? '').trim()) {
        pendingById.delete(photoId)
        synced.push(row)
        continue
      }
    } catch (e) {
      console.warn('[floor-work-drive-queue] retry failed', photoId, e)
    }
    item.attempt += 1
    nextDelay = Math.min(nextDelay, retryDelayMs(item.attempt))
  }

  flushing = false
  notifySynced(synced)
  if (pendingById.size > 0) scheduleFlush(nextDelay)
}

export function kickFloorWorkDriveAutoSync(): void {
  if (pendingById.size > 0) scheduleFlush(0)
}
