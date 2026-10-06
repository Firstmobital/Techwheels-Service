import { supabase } from '../supabase'
import {
  clampPageSize,
  DEFAULT_LIST_PAGE_SIZE,
  type ListPageResult,
  pageResultFromRows,
} from '../pagination/listPage'

export type DriverBookingCursor = {
  appointmentDate: string
  id: number
}

export async function fetchDriverServiceBookingsPage(options: {
  cursor?: DriverBookingCursor | null
  pageSize?: number
}): Promise<ListPageResult<Record<string, unknown>, DriverBookingCursor>> {
  const pageSize = clampPageSize(options.pageSize ?? DEFAULT_LIST_PAGE_SIZE)
  const { data, error } = await supabase.rpc('list_service_bookings_driver_page', {
    p_page_size: pageSize,
    p_cursor_appointment_date: options.cursor?.appointmentDate ?? null,
    p_cursor_id: options.cursor?.id ?? null,
  })
  if (error) throw new Error(error.message)
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Record<string, unknown>[]
  return pageResultFromRows(rows, pageSize, (last) => {
    const appointmentRaw = last.appointment_date
    const appointmentDate =
      typeof appointmentRaw === 'string' && appointmentRaw.trim()
        ? appointmentRaw.slice(0, 10)
        : '9999-12-31'
    const id = Number.isFinite(last.id) ? Number(last.id) : null
    if (id === null) return null
    return { appointmentDate, id }
  })
}
