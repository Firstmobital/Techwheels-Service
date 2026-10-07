import { supabase } from '../supabase'
import type { FloorWorkVehicleMeta } from '../bodyshopFloorWork/display'
import {
  inferRegistrationFromAssignmentKey,
  isSystemJobCardKey,
} from '../bodyshopFloorWork/display'
import { isLiveOnFloorRepairCard } from '../bodyshopFloorLive'
import { resolveBodyshopFloorSinceIso } from '../bodyshopFloorAge'
import { listReceptionEntriesByJobCardNumbers } from './reception'

const JC_CHUNK = 80

function normKey(value: string): string {
  return String(value ?? '').trim().toUpperCase()
}

function mergeMeta(
  map: Record<string, FloorWorkVehicleMeta>,
  assignmentKey: string,
  patch: Partial<FloorWorkVehicleMeta>,
): void {
  const k = normKey(assignmentKey)
  if (!k) return
  const prev = map[k] ?? { reg: null, customer: null, model: null }
  map[k] = {
    reg: patch.reg ?? prev.reg,
    customer: patch.customer ?? prev.customer,
    model: patch.model ?? prev.model,
    systemJobCardNo: patch.systemJobCardNo ?? prev.systemJobCardNo,
    floorSinceAt: patch.floorSinceAt ?? prev.floorSinceAt,
    listFloorSinceAt: prev.listFloorSinceAt ?? patch.listFloorSinceAt ?? prev.floorSinceAt,
    metaFetchDone: patch.metaFetchDone ?? prev.metaFetchDone,
    bodyshopFloor: patch.bodyshopFloor ?? prev.bodyshopFloor,
    qcStatus: patch.qcStatus ?? prev.qcStatus,
    repairCardId: patch.repairCardId ?? prev.repairCardId,
  }
}

async function attachRepairCardFloorTiming(
  map: Record<string, FloorWorkVehicleMeta>,
  keys: string[],
): Promise<void> {
  for (let i = 0; i < keys.length; i += JC_CHUNK) {
    const chunk = keys.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('job_card_no, reg_number, created_at, bodyshop_floor, bodyshop_floor_since_at, survay_info_updated_at, qc_status')
      .in('job_card_no', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const jc = normKey(String(c.job_card_no ?? ''))
      if (!jc) continue
      const since = resolveBodyshopFloorSinceIso(c)
      const patch: Partial<FloorWorkVehicleMeta> = {
        reg: c.reg_number ?? null,
        bodyshopFloor: c.bodyshop_floor ?? null,
        qcStatus: c.qc_status ?? null,
        systemJobCardNo: jc,
      }
      if (since) patch.floorSinceAt = since
      mergeMeta(map, jc, patch)
    }
  }

  const regKeys = keys.filter((k) => inferRegistrationFromAssignmentKey(k))
  for (let i = 0; i < regKeys.length; i += JC_CHUNK) {
    const chunk = regKeys.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('job_card_no, reg_number, created_at, bodyshop_floor, bodyshop_floor_since_at, survay_info_updated_at, qc_status')
      .in('reg_number', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const reg = normKey(String(c.reg_number ?? ''))
      if (!reg) continue
      for (const assignmentKey of keys) {
        if (normKey(assignmentKey) !== reg && inferRegistrationFromAssignmentKey(assignmentKey) !== reg) continue
        const since = resolveBodyshopFloorSinceIso(c)
        const patch: Partial<FloorWorkVehicleMeta> = {
          reg: c.reg_number ?? map[assignmentKey]?.reg ?? null,
          bodyshopFloor: c.bodyshop_floor ?? null,
          qcStatus: c.qc_status ?? null,
          systemJobCardNo: normKey(String(c.job_card_no ?? '')) || map[assignmentKey]?.systemJobCardNo,
        }
        if (since && !String(map[assignmentKey]?.floorSinceAt ?? '').trim()) {
          patch.floorSinceAt = since
        }
        mergeMeta(map, assignmentKey, patch)
      }
    }
  }
}

export type FetchRepairCardVehicleOptions = {
  /** Skip extra query when assignment `created_at` is already known (admin load). */
  assignmentCreatedAtByJc?: Record<string, string | null | undefined>
  /** bodyshop_assignments.repair_card_id — resolves reg when job_card_number is system JC. */
  repairCardIdByJc?: Record<string, number | null | undefined>
}

/** Resolve reg/customer for each assignment key (JC or plate-shaped key). */
export async function fetchRepairCardVehicleByJcs(
  assignmentKeys: string[],
  opts?: FetchRepairCardVehicleOptions,
): Promise<Record<string, FloorWorkVehicleMeta>> {
  const keys = Array.from(new Set(assignmentKeys.map(normKey).filter(Boolean)))
  const map: Record<string, FloorWorkVehicleMeta> = {}
  if (keys.length === 0) return map

  for (const k of keys) {
    const seededSince = String(opts?.assignmentCreatedAtByJc?.[k] ?? '').trim() || null
    map[k] = {
      reg: inferRegistrationFromAssignmentKey(k),
      customer: null,
      model: null,
      floorSinceAt: seededSince,
      listFloorSinceAt: seededSince,
    }
  }

  for (let i = 0; i < keys.length; i += JC_CHUNK) {
    const chunk = keys.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('id, job_card_no, reg_number, customer_name, qc_status')
      .in('job_card_no', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const jc = normKey(String(c.job_card_no ?? ''))
      if (!jc) continue
      mergeMeta(map, jc, {
        reg: c.reg_number ?? null,
        customer: c.customer_name ?? null,
        systemJobCardNo: jc,
        qcStatus: c.qc_status ?? null,
        repairCardId: typeof c.id === 'number' ? c.id : null,
      })
    }
  }

  const regSearch = Array.from(
    new Set([
      ...keys.filter((k) => inferRegistrationFromAssignmentKey(k)),
      ...keys.filter((k) => !isSystemJobCardKey(k)),
    ].map(normKey)),
  )

  for (let i = 0; i < regSearch.length; i += JC_CHUNK) {
    const chunk = regSearch.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('id, job_card_no, reg_number, customer_name, qc_status')
      .in('reg_number', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const reg = normKey(String(c.reg_number ?? ''))
      if (!reg) continue
      for (const assignmentKey of keys) {
        if (normKey(assignmentKey) === reg || inferRegistrationFromAssignmentKey(assignmentKey) === reg) {
          mergeMeta(map, assignmentKey, {
            reg: c.reg_number ?? null,
            customer: c.customer_name ?? null,
            systemJobCardNo: normKey(String(c.job_card_no ?? '')),
            qcStatus: c.qc_status ?? null,
            repairCardId: typeof c.id === 'number' ? c.id : null,
          })
        }
      }
    }
  }

  const repairCardIdByJc = opts?.repairCardIdByJc ?? {}
  const idToJcs = new Map<number, string[]>()
  for (const assignmentKey of keys) {
    if (String(map[assignmentKey]?.reg ?? '').trim()) continue
    const rid = Number(repairCardIdByJc[assignmentKey])
    if (!Number.isFinite(rid) || rid <= 0) continue
    const list = idToJcs.get(rid) ?? []
    list.push(assignmentKey)
    idToJcs.set(rid, list)
  }
  const repairIds = [...idToJcs.keys()]
  for (let i = 0; i < repairIds.length; i += JC_CHUNK) {
    const chunk = repairIds.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('id, job_card_no, reg_number, customer_name, qc_status')
      .in('id', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const rid = typeof c.id === 'number' ? c.id : Number(c.id)
      if (!Number.isFinite(rid)) continue
      for (const assignmentKey of idToJcs.get(rid) ?? []) {
        mergeMeta(map, assignmentKey, {
          reg: c.reg_number ?? null,
          customer: c.customer_name ?? null,
          systemJobCardNo: normKey(String(c.job_card_no ?? '')),
          qcStatus: c.qc_status ?? null,
          repairCardId: rid,
        })
      }
    }
  }

  const needReception = keys.filter((k) => !String(map[k]?.reg ?? '').trim() && isSystemJobCardKey(k))
  if (needReception.length > 0) {
    const recRes = await listReceptionEntriesByJobCardNumbers(needReception)
    if (!recRes.error && recRes.data) {
      for (const row of recRes.data) {
        const jc = normKey(String(row.jc_number ?? ''))
        if (!jc) continue
        mergeMeta(map, jc, {
          reg: row.reg_number ?? null,
          customer: row.owner_name ?? null,
          model: row.model ?? null,
        })
      }
    }
  }

  for (const k of keys) {
    if (!String(map[k]?.reg ?? '').trim()) {
      const inferred = inferRegistrationFromAssignmentKey(k)
      if (inferred) mergeMeta(map, k, { reg: inferred })
    }
  }

  await attachRepairCardFloorTiming(map, keys)

  for (const k of keys) {
    mergeMeta(map, k, { metaFetchDone: true })
  }

  const seeded = opts?.assignmentCreatedAtByJc
  if (seeded) {
    for (const [jc, createdAt] of Object.entries(seeded)) {
      const iso = String(createdAt ?? '').trim()
      if (iso && !String(map[jc]?.floorSinceAt ?? '').trim()) {
        mergeMeta(map, jc, { floorSinceAt: iso })
      }
    }
  }

  return map
}

/** Job cards for vehicles currently in bodyshop floor stages (11–14). */
export async function fetchLiveOnFloorJobCardKeys(): Promise<string[]> {
  const { data, error } = await supabase
    .from('bodyshop_repair_cards')
    .select('job_card_no, current_stage, overall_status')
    .gte('current_stage', 11)
    .lte('current_stage', 14)
  if (error) throw new Error(error.message)
  return Array.from(
    new Set(
      (data ?? [])
        .filter((row) => isLiveOnFloorRepairCard(row))
        .map((row) => normKey(String(row.job_card_no ?? '')))
        .filter(Boolean),
    ),
  )
}
