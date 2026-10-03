import { supabase } from '../supabase'
import type { FloorWorkVehicleMeta } from '../bodyshopFloorWork/display'
import {
  inferRegistrationFromAssignmentKey,
  isSystemJobCardKey,
} from '../bodyshopFloorWork/display'

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
    floorSinceAt: patch.floorSinceAt ?? prev.floorSinceAt,
    bodyshopFloor: patch.bodyshopFloor ?? prev.bodyshopFloor,
  }
}

async function attachAssignmentFloorTiming(
  map: Record<string, FloorWorkVehicleMeta>,
  keys: string[],
): Promise<void> {
  for (let i = 0; i < keys.length; i += JC_CHUNK) {
    const chunk = keys.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_assignments')
      .select('job_card_number, created_at')
      .eq('is_active', true)
      .in('job_card_number', chunk)
    if (error) throw new Error(error.message)
    for (const row of data ?? []) {
      const k = normKey(String(row.job_card_number ?? ''))
      if (!k) continue
      mergeMeta(map, k, { floorSinceAt: String(row.created_at ?? '') || null })
    }
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
      .select('job_card_no, reg_number, created_at, bodyshop_floor')
      .in('job_card_no', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const jc = normKey(String(c.job_card_no ?? ''))
      if (!jc) continue
      const patch: Partial<FloorWorkVehicleMeta> = { bodyshopFloor: c.bodyshop_floor ?? null }
      if (!String(map[jc]?.floorSinceAt ?? '').trim()) {
        patch.floorSinceAt = String(c.created_at ?? '') || null
      }
      mergeMeta(map, jc, patch)
    }
  }

  const regKeys = keys.filter((k) => inferRegistrationFromAssignmentKey(k))
  for (let i = 0; i < regKeys.length; i += JC_CHUNK) {
    const chunk = regKeys.slice(i, i + JC_CHUNK)
    const { data, error } = await supabase
      .from('bodyshop_repair_cards')
      .select('job_card_no, reg_number, created_at, bodyshop_floor')
      .in('reg_number', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const reg = normKey(String(c.reg_number ?? ''))
      if (!reg) continue
      for (const assignmentKey of keys) {
        if (normKey(assignmentKey) !== reg && inferRegistrationFromAssignmentKey(assignmentKey) !== reg) continue
        const patch: Partial<FloorWorkVehicleMeta> = { bodyshopFloor: c.bodyshop_floor ?? null }
        if (!String(map[assignmentKey]?.floorSinceAt ?? '').trim()) {
          patch.floorSinceAt = String(c.created_at ?? '') || null
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
      .select('job_card_no, reg_number, customer_name')
      .in('job_card_no', chunk)
    if (error) throw new Error(error.message)
    for (const c of data ?? []) {
      const jc = normKey(String(c.job_card_no ?? ''))
      if (!jc) continue
      mergeMeta(map, jc, {
        reg: c.reg_number ?? null,
        customer: c.customer_name ?? null,
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
      .select('job_card_no, reg_number, customer_name')
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
          })
        }
      }
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

  await attachAssignmentFloorTiming(map, keys)
  await attachRepairCardFloorTiming(map, keys)

  return map
}
