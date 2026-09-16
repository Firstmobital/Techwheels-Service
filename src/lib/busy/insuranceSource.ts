import { supabase } from '../supabase'
import {
  BUSY_INSURANCE_MASTER,
  readAuthoritativeGstin,
  type BusyInsuranceMasterRow,
} from './insuranceMaster.ts'

export interface BusyInsuranceStoredRow extends BusyInsuranceMasterRow {
  id: number
  updatedAt: string | null
}

interface BusyInsuranceTableRow {
  id: number
  company_name: string
  gstin: string
  busy_group: string
  updated_at: string | null
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function normalizeBusyInsuranceWrite(input: {
  companyName: string
  gstin: string
  busyGroup: string
}): { ok: true; row: BusyInsuranceMasterRow } | { ok: false; error: string } {
  const companyName = collapseSpaces(input.companyName)
  const busyGroup = collapseSpaces(input.busyGroup)
  const gstin = readAuthoritativeGstin(input.gstin)
  if (!companyName) return { ok: false, error: 'Insurance company name is required' }
  if (!busyGroup) return { ok: false, error: 'Group of Account is required' }
  if (!gstin) return { ok: false, error: 'GSTIN is missing or invalid' }
  return { ok: true, row: { companyName, gstin, busyGroup } }
}

function mapStored(row: BusyInsuranceTableRow): BusyInsuranceStoredRow {
  return {
    id: row.id,
    companyName: row.company_name,
    gstin: row.gstin,
    busyGroup: row.busy_group,
    updatedAt: row.updated_at,
  }
}

function writeError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    return new Error('That insurance company already exists')
  }
  if (error instanceof Error) return error
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return new Error(String(error.message))
  }
  return new Error(String(error))
}

export async function isBusyAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) return false
  return Boolean(data)
}

export async function fetchBusyInsuranceMaster(): Promise<BusyInsuranceStoredRow[]> {
  const { data, error } = await supabase
    .from('busy_insurance_master' as never)
    .select('id, company_name, gstin, busy_group, updated_at')
    .order('company_name', { ascending: true })

  if (error) throw writeError(error)
  return ((data ?? []) as unknown as BusyInsuranceTableRow[]).map(mapStored)
}

export function masterRowsForTransform(rows: BusyInsuranceStoredRow[]): BusyInsuranceMasterRow[] {
  if (rows.length === 0) return [...BUSY_INSURANCE_MASTER]
  return rows.map((row) => ({
    companyName: row.companyName,
    gstin: row.gstin,
    busyGroup: row.busyGroup,
  }))
}

export async function insertBusyInsuranceMaster(input: {
  companyName: string
  gstin: string
  busyGroup: string
}): Promise<BusyInsuranceStoredRow> {
  const parsed = normalizeBusyInsuranceWrite(input)
  if (!parsed.ok) throw new Error(parsed.error)

  const { data, error } = await supabase
    .from('busy_insurance_master' as never)
    .insert({
      company_name: parsed.row.companyName,
      gstin: parsed.row.gstin,
      busy_group: parsed.row.busyGroup,
    } as never)
    .select('id, company_name, gstin, busy_group, updated_at')
    .single()

  if (error) throw writeError(error)
  return mapStored(data as unknown as BusyInsuranceTableRow)
}

export async function updateBusyInsuranceMaster(
  id: number,
  input: { companyName: string; gstin: string; busyGroup: string },
): Promise<BusyInsuranceStoredRow> {
  const parsed = normalizeBusyInsuranceWrite(input)
  if (!parsed.ok) throw new Error(parsed.error)

  const { data, error } = await supabase
    .from('busy_insurance_master' as never)
    .update({
      company_name: parsed.row.companyName,
      gstin: parsed.row.gstin,
      busy_group: parsed.row.busyGroup,
    } as never)
    .eq('id', id)
    .select('id, company_name, gstin, busy_group, updated_at')
    .single()

  if (error) throw writeError(error)
  return mapStored(data as unknown as BusyInsuranceTableRow)
}
