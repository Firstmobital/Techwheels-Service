import { supabase } from '../supabase'
import type { FloorWorkVehicleMeta } from '../bodyshopFloorWork/display'
import {
  inferRegistrationFromAssignmentKey,
  isSystemJobCardKey,
} from '../bodyshopFloorWork/display'
import { isLiveOnFloorRepairCard } from '../bodyshopFloorLive'
import { resolveBodyshopFloorSinceIso } from '../bodyshopFloorAge'
import { BODYSHOP_FLOOR_WORK_ON_FLOOR_FROM_IST } from '../bodyshopFloorWork/eligibility'

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
      .select('job_card_no, reg_number, created_at, bodyshop_floor, bodyshop_floor_since_at, survay_info_updated_at')
      .in('job_card_no', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const jc = normKey(String(c.job_card_no ?? ''))
      if (!jc) continue
      const since = resolveBodyshopFloorSinceIso(c)
      const patch: Partial<FloorWorkVehicleMeta> = { bodyshopFloor: c.bodyshop_floor ?? null }
      if (since) patch.floorSinceAt = since
      mergeMeta(map, jc, patch)
    }
  }

  const regKeys = keys.filter((k) => inferRegistrationFromAssignmentKey(k))
  for (let i = 0; i < regKeys.length; i += JC_CHUNK) {
    const chunk = regKeys.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('job_card_no, reg_number, created_at, bodyshop_floor, bodyshop_floor_since_at, survay_info_updated_at')
      .in('reg_number', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const reg = normKey(String(c.reg_number ?? ''))
      if (!reg) continue
      for (const assignmentKey of keys) {
        if (normKey(assignmentKey) !== reg && inferRegistrationFromAssignmentKey(assignmentKey) !== reg) continue
        const since = resolveBodyshopFloorSinceIso(c)
        const patch: Partial<FloorWorkVehicleMeta> = { bodyshopFloor: c.bodyshop_floor ?? null }
        if (since && !String(map[assignmentKey]?.floorSinceAt ?? '').trim()) {
          patch.floorSinceAt = since
        }
        mergeMeta(map, assignmentKey, patch)
      }
    }
  }
}

export async function fetchRepairCardVehicleByJcs(
  assignmentKeys: string[],
): Promise<Record<string, FloorWorkVehicleMeta>> {
  const keys = Array.from(new Set(assignmentKeys.map(normKey).filter(Boolean)))
  const map: Record<string, FloorWorkVehicleMeta> = {}
  if (keys.length === 0) return map

  for (const k of keys) {
    map[k] = { reg: inferRegistrationFromAssignmentKey(k), customer: null, model: null }
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

  const needModel = keys.filter((k) => !String(map[k]?.model ?? '').trim())
  for (let i = 0; i < needModel.length; i += 100) {
    const batch = needModel.slice(i, i + 100)
    const { data, error } = await supabase.rpc('list_floor_work_vehicle_labels', { p_keys: batch })
    if (error) continue
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
      lookup_key?: string | null
      model?: string | null
      customer_name?: string | null
      reg_number?: string | null
    }>
    for (const row of rows) {
      const key = normKey(String(row.lookup_key ?? ''))
      if (!key) continue
      mergeMeta(map, key, {
        model: row.model ?? null,
        customer: row.customer_name ?? null,
        reg: row.reg_number ?? null,
      })
    }
  }

  const needReception = keys.filter((k) => !String(map[k]?.reg ?? '').trim() && isSystemJobCardKey(k))
  for (let i = 0; i < needReception.length; i += 100) {
    const batch = needReception.slice(i, i + 100)
    const { data, error } = await supabase.rpc('list_reception_entries_by_jc_numbers', {
      p_jc_numbers: batch,
    })
    if (error) continue
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<{
      jc_number?: string | null
      reg_number?: string | null
      owner_name?: string | null
      model?: string | null
    }>
    for (const row of rows) {
      const jc = normKey(String(row.jc_number ?? ''))
      if (!jc) continue
      mergeMeta(map, jc, {
        reg: row.reg_number ?? null,
        customer: row.owner_name ?? null,
        model: row.model ?? null,
      })
    }
  }

  for (const k of keys) {
    if (!String(map[k]?.reg ?? '').trim()) {
      const inferred = inferRegistrationFromAssignmentKey(k)
      if (inferred) mergeMeta(map, k, { reg: inferred })
    }
  }

  await attachRepairCardFloorTiming(map, keys)

  return map
}

/** Merge repair-card QC + id into minimal meta (all JC chunks — for worker list filtering). */
export async function attachQcStatusToVehicleMeta(
  map: Record<string, FloorWorkVehicleMeta>,
  keys: string[],
): Promise<Record<string, FloorWorkVehicleMeta>> {
  const out = { ...map }
  const uniq = Array.from(new Set(keys.map(normKey).filter(Boolean)))
  for (let i = 0; i < uniq.length; i += JC_CHUNK) {
    const chunk = uniq.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('id, job_card_no, qc_status')
      .in('job_card_no', chunk)
    if (error) {
      console.warn('attachQcStatusToVehicleMeta:', error.message)
      continue
    }
    for (const c of data ?? []) {
      const jc = normKey(String(c.job_card_no ?? ''))
      if (!jc) continue
      mergeMeta(out, jc, {
        qcStatus: c.qc_status ?? null,
        repairCardId: typeof c.id === 'number' ? c.id : null,
      })
    }
  }
  return out
}

export async function fetchLiveOnFloorJobCardKeys(): Promise<string[]> {
  return fetchLiveOnFloorJobCardKeysSince(BODYSHOP_FLOOR_WORK_ON_FLOOR_FROM_IST)
}

/** Live stage 11–14 (for vehicle meta). Task visibility still uses assignment floor date from Oct go-live. */
export async function fetchLiveOnFloorJobCardKeysSince(_eligibleFromIst: string): Promise<string[]> {
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
