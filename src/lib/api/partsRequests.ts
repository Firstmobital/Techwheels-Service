// src/lib/api/partsRequests.ts
// Parts Request & Tracking workflow between Service Advisor and Parts SPM.

import { supabase } from '../supabase'
import { fail, ok, type ApiResult } from './types'

export const PARTS_STATUS_VALUES = [
  'Pending',
  'Ordered',
  'Back Order',
  'In Transit',
  'Received',
  'Partially Received',
  'Cancelled',
  'Delivered to Workshop',
] as const

export type PartsStatus = (typeof PARTS_STATUS_VALUES)[number]

export interface PartsRequestRow {
  id: number
  dealer_code: string | null
  advisor_user_id: string
  advisor_employee_code: string | null
  advisor_name: string
  branch: string | null
  entry_date: string
  registration_number: string
  parts_required: string
  parts_description: string | null
  advisor_remarks: string | null
  parts_qty: number | null
  parts_number: string | null
  parts_order_date: string | null
  parts_status: PartsStatus
  spm_remarks: string | null
  vehicle_type: string | null
  auto_match_note: string | null
  last_matched_at: string | null
  advisor_seen: boolean
  status_updated_at: string
  created_at: string
  updated_at: string
}

export async function listMyPartsRequests(): Promise<ApiResult<PartsRequestRow[]>> {
  const { data, error } = await supabase
    .from('parts_requests')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return fail(error)
  return ok((data ?? []) as PartsRequestRow[])
}

export async function listAllPartsRequests(): Promise<ApiResult<PartsRequestRow[]>> {
  const pageSize = 1000
  let from = 0
  const rows: PartsRequestRow[] = []
  while (true) {
    const { data, error } = await supabase
      .from('parts_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) return fail(error)
    const chunk = (data ?? []) as PartsRequestRow[]
    rows.push(...chunk)
    if (chunk.length < pageSize) break
    from += pageSize
  }
  return ok(rows)
}

export async function createPartsRequest(input: {
  registrationNumber: string
  partsRequired: string
  partsDescription?: string | null
  advisorRemarks?: string | null
  entryDate?: string | null
}): Promise<ApiResult<number>> {
  const { data, error } = await supabase.rpc('parts_request_create', {
    p_registration_number: input.registrationNumber,
    p_parts_required: input.partsRequired,
    p_parts_description: input.partsDescription ?? null,
    p_advisor_remarks: input.advisorRemarks ?? null,
    p_entry_date: input.entryDate ?? null,
  })

  if (error) return fail(error)
  return ok(data as number)
}

export async function updateMyPartsRequestFields(input: {
  id: number
  registrationNumber: string
  partsRequired: string
  partsDescription?: string | null
  advisorRemarks?: string | null
  entryDate?: string | null
}): Promise<ApiResult<void>> {
  const { error } = await supabase.rpc('parts_request_update_advisor_fields', {
    p_id: input.id,
    p_registration_number: input.registrationNumber,
    p_parts_required: input.partsRequired,
    p_parts_description: input.partsDescription ?? null,
    p_advisor_remarks: input.advisorRemarks ?? null,
    p_entry_date: input.entryDate ?? null,
  })

  if (error) return fail(error)
  return ok(undefined)
}

export async function spmUpdatePartsRequest(input: {
  id: number
  partsNumber?: string | null
  partsOrderDate?: string | null
  partsStatus: PartsStatus
  spmRemarks?: string | null
  /** Manual override only — omit/undefined to leave the auto-computed Parts Qty untouched. */
  partsQty?: number | null
}): Promise<ApiResult<void>> {
  const { error } = await supabase.rpc('parts_request_spm_update', {
    p_id: input.id,
    p_parts_number: input.partsNumber ?? null,
    p_parts_order_date: input.partsOrderDate ?? null,
    p_parts_status: input.partsStatus,
    p_spm_remarks: input.spmRemarks ?? null,
    p_parts_qty: input.partsQty ?? null,
  })

  if (error) return fail(error)
  return ok(undefined)
}

export async function markPartsRequestSeen(id: number): Promise<ApiResult<void>> {
  const { error } = await supabase.rpc('parts_request_mark_seen', { p_id: id })
  if (error) return fail(error)
  return ok(undefined)
}

export async function markAllPartsRequestsSeen(): Promise<ApiResult<void>> {
  const { error } = await supabase.rpc('parts_request_mark_all_seen')
  if (error) return fail(error)
  return ok(undefined)
}

export const PARTS_STATUS_COLOR: Record<PartsStatus, { dot: string; bg: string; text: string }> = {
  'Pending':               { dot: 'bg-amber-500',   bg: 'bg-amber-50',   text: 'text-amber-700' },
  'Ordered':               { dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700' },
  'Back Order':            { dot: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700' },
  'In Transit':            { dot: 'bg-purple-500',  bg: 'bg-purple-50',  text: 'text-purple-700' },
  'Received':              { dot: 'bg-green-500',   bg: 'bg-green-50',   text: 'text-green-700' },
  'Partially Received':    { dot: 'bg-teal-500',    bg: 'bg-teal-50',    text: 'text-teal-700' },
  'Cancelled':             { dot: 'bg-gray-500',    bg: 'bg-gray-100',   text: 'text-gray-700' },
  'Delivered to Workshop': { dot: 'bg-emerald-600', bg: 'bg-emerald-50', text: 'text-emerald-700' },
}
