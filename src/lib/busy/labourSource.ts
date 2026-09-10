import { supabase } from '../supabase'
import type { BusyLabourRow } from './types.ts'
import type { VehiclePortal } from './types.ts'

const PAGE_SIZE = 1000

const LABOUR_COLUMNS = [
  'id',
  'invoice_number',
  'invoice_date',
  'account',
  'first_name',
  'last_name',
  'job_card_number',
  'vehicle_registration_number',
  'sr_type',
  'sr_assigned_to',
  'final_labour_amount',
  'invoice_status',
  'portal',
].join(', ')

export interface BusyLabourSourceStatus {
  pvAvailable: boolean
  evAvailable: boolean
  pvCount: number
  evCount: number
  latestPvDate: string | null
  latestEvDate: string | null
  error: string | null
}

async function countPortal(portal: VehiclePortal): Promise<{ count: number; latest: string | null }> {
  const { count, error: countError } = await supabase
    .from('psf_revenue_dms' as never)
    .select('id', { count: 'exact', head: true })
    .eq('portal', portal)

  if (countError) throw countError

  const { data, error } = await supabase
    .from('psf_revenue_dms' as never)
    .select('invoice_date')
    .eq('portal', portal)
    .not('invoice_date', 'is', null)
    .order('invoice_date', { ascending: false })
    .limit(1)

  if (error) throw error
  const latestRow = (data ?? []) as Array<{ invoice_date: string | null }>

  return {
    count: count ?? 0,
    latest: latestRow[0]?.invoice_date ? String(latestRow[0].invoice_date).slice(0, 10) : null,
  }
}

export async function loadBusyLabourSourceStatus(): Promise<BusyLabourSourceStatus> {
  try {
    const [pv, ev] = await Promise.all([countPortal('PV'), countPortal('EV')])
    return {
      pvAvailable: pv.count > 0,
      evAvailable: ev.count > 0,
      pvCount: pv.count,
      evCount: ev.count,
      latestPvDate: pv.latest,
      latestEvDate: ev.latest,
      error: null,
    }
  } catch (error) {
    return {
      pvAvailable: false,
      evAvailable: false,
      pvCount: 0,
      evCount: 0,
      latestPvDate: null,
      latestEvDate: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function fetchBusyLabourRows(fromDate: string, toDate: string): Promise<BusyLabourRow[]> {
  const rows: BusyLabourRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('psf_revenue_dms' as never)
      .select(LABOUR_COLUMNS)
      .gte('invoice_date', fromDate)
      .lte('invoice_date', toDate)
      .order('invoice_date', { ascending: true })
      .order('invoice_number', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw error
    const batch = ((data ?? []) as unknown) as BusyLabourRow[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}
