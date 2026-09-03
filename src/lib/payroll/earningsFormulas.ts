/** Shared SA/Technician income formulas — same authority as tracker pages. */

export function parseAmount(value: unknown): number {
  if (value == null) return 0
  const raw = String(value).trim()
  if (!raw) return 0
  const neg = raw.startsWith('(') && raw.endsWith(')')
  const cleaned = raw.replace(/[₹,\s()]/g, '').replace(/RS\.?/gi, '')
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return 0
  return neg ? -n : n
}

export function calculateSAIncome(labourAmount: number, saSharePercent: number): number {
  if (!Number.isFinite(labourAmount) || labourAmount <= 0) return 0
  const netBeforeShare = labourAmount / 1.18
  return netBeforeShare * (saSharePercent / 100)
}

export function calculateTechnicianIncome(
  grossLabourAmount: number,
  bayNo: string | null | undefined,
  pvSharePercent: number,
  evSharePercent: number,
  splitCount = 1,
): number {
  if (!Number.isFinite(grossLabourAmount) || grossLabourAmount <= 0) return 0
  const fuel = extractFuelFromBay(bayNo)
  const sharePercent = fuel === 'EV' ? evSharePercent : pvSharePercent
  const netBeforeShare = grossLabourAmount / 1.18
  const income = netBeforeShare * (sharePercent / 100)
  const safeSplitCount = Number.isFinite(splitCount) && splitCount > 0 ? splitCount : 1
  return income / safeSplitCount
}

export function extractFuelFromBay(bayNo: string | null | undefined): 'EV' | 'PV' {
  const normalized = String(bayNo ?? '').trim().toUpperCase()
  if (normalized.includes('EV')) return 'EV'
  return 'PV'
}

export function normFuelBucket(v: string | null | undefined): 'EV' | 'PV' {
  return String(v ?? '').trim().toUpperCase().includes('EV') ? 'EV' : 'PV'
}

export function normalizeJobCardNumber(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

export function normalizeEmployeeCode(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

export function normalizeStatusValue(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase() || 'work_inprocess'
}

import { supabase } from '../supabase'

export async function fetchSharePercents(
  table: 'sa_earnings_settings' | 'technician_earnings_settings',
): Promise<{ pvPercent: number; evPercent: number }> {
  let pvPercent = 10
  let evPercent = 10
  const res = await supabase.from(table).select('key, value')
  if (!res.error && res.data) {
    for (const row of res.data as { key: string; value: string }[]) {
      const parsed = parseFloat(row.value)
      if (!Number.isFinite(parsed) || parsed <= 0) continue
      if (row.key === 'pv_share_percent' || row.key === 'sa_share_percent') pvPercent = parsed
      if (row.key === 'ev_share_percent') evPercent = parsed
    }
  }
  return { pvPercent, evPercent }
}
