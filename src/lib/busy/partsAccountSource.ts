import { supabase } from '../supabase'
import { readAuthoritativeGstin } from './insuranceMaster.ts'
import { extractPartsAccountCode } from './partsParser.ts'
import type { BusyPartsAccountMasterRow } from './types.ts'

export interface BusyPartsAccountStoredRow extends BusyPartsAccountMasterRow {
  id: number
  updatedAt: string | null
}

interface BusyPartsAccountTableRow {
  id: number
  code: string
  party_name: string
  gstin: string
  busy_group: string
  updated_at: string | null
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeBusyPartsAccountWrite(input: {
  code: string
  partyName: string
  gstin: string
  busyGroup: string
}): { ok: true; row: BusyPartsAccountMasterRow } | { ok: false; error: string } {
  const code = extractPartsAccountCode(input.code)
  const partyName = collapseSpaces(input.partyName)
  const busyGroup = collapseSpaces(input.busyGroup)
  const gstin = readAuthoritativeGstin(input.gstin)
  if (!code) return { ok: false, error: 'Dealer code is missing or invalid' }
  if (!partyName) return { ok: false, error: 'Party Name is required' }
  if (!busyGroup) return { ok: false, error: 'Group of Account is required' }
  if (!gstin) return { ok: false, error: 'GSTIN is missing or invalid' }
  return { ok: true, row: { code, partyName, gstin, busyGroup } }
}

function mapStored(row: BusyPartsAccountTableRow): BusyPartsAccountStoredRow {
  return {
    id: row.id,
    code: row.code,
    partyName: row.party_name,
    gstin: row.gstin,
    busyGroup: row.busy_group,
    updatedAt: row.updated_at,
  }
}

function writeError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return new Error('That dealer code already exists')
  }
  if (error instanceof Error) return error
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return new Error(String(error.message))
  }
  return new Error(String(error))
}

export async function fetchBusyPartsAccountMaster(): Promise<BusyPartsAccountStoredRow[]> {
  const { data, error } = await supabase
    .from('busy_parts_account_master' as never)
    .select('id, code, party_name, gstin, busy_group, updated_at')
    .order('code', { ascending: true })

  if (error) throw writeError(error)
  return ((data ?? []) as unknown as BusyPartsAccountTableRow[]).map(mapStored)
}

export function partsAccountRowsForTransform(rows: BusyPartsAccountStoredRow[]): BusyPartsAccountMasterRow[] {
  return rows.map((row) => ({
    code: row.code,
    partyName: row.partyName,
    gstin: row.gstin,
    busyGroup: row.busyGroup,
  }))
}

export async function insertBusyPartsAccountMaster(input: {
  code: string
  partyName: string
  gstin: string
  busyGroup: string
}): Promise<BusyPartsAccountStoredRow> {
  const parsed = normalizeBusyPartsAccountWrite(input)
  if (!parsed.ok) throw new Error(parsed.error)

  const { data, error } = await supabase
    .from('busy_parts_account_master' as never)
    .insert({
      code: parsed.row.code,
      party_name: parsed.row.partyName,
      gstin: parsed.row.gstin,
      busy_group: parsed.row.busyGroup,
    } as never)
    .select('id, code, party_name, gstin, busy_group, updated_at')
    .single()

  if (error) throw writeError(error)
  return mapStored(data as unknown as BusyPartsAccountTableRow)
}

export async function updateBusyPartsAccountMaster(
  id: number,
  input: { code: string; partyName: string; gstin: string; busyGroup: string },
): Promise<BusyPartsAccountStoredRow> {
  const parsed = normalizeBusyPartsAccountWrite(input)
  if (!parsed.ok) throw new Error(parsed.error)

  const { data, error } = await supabase
    .from('busy_parts_account_master' as never)
    .update({
      code: parsed.row.code,
      party_name: parsed.row.partyName,
      gstin: parsed.row.gstin,
      busy_group: parsed.row.busyGroup,
    } as never)
    .eq('id', id)
    .select('id, code, party_name, gstin, busy_group, updated_at')
    .single()

  if (error) throw writeError(error)
  return mapStored(data as unknown as BusyPartsAccountTableRow)
}
