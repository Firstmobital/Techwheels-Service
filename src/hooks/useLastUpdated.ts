import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const LAST_UPDATED_STORAGE_PREFIX = 'tw:last-updated:'
const LAST_UPDATED_EVENT = 'tw:last-updated'

function getStorageKey(tableName: string) {
  return `${LAST_UPDATED_STORAGE_PREFIX}${tableName}`
}

function readLastUpdatedFromStorage(tableName: string): Date | null {
  try {
    const raw = window.localStorage.getItem(getStorageKey(tableName))
    if (!raw) return null
    const dt = new Date(raw)
    return Number.isNaN(dt.getTime()) ? null : dt
  } catch {
    return null
  }
}

function pickLatestDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b
  if (!b) return a
  return a.getTime() >= b.getTime() ? a : b
}

export function setLastUpdatedCache(tableName: string, value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value)
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date
  try {
    window.localStorage.setItem(getStorageKey(tableName), safeDate.toISOString())
  } catch {
    // Ignore storage errors in private mode/quota limits.
  }
  return safeDate
}

export function broadcastLastUpdated(tableName: string, value: string | Date) {
  const date = setLastUpdatedCache(tableName, value)
  window.dispatchEvent(
    new CustomEvent(LAST_UPDATED_EVENT, {
      detail: { tableName, value: date.toISOString() },
    }),
  )
}

export function useLastUpdated(tableName: string): {
  lastUpdated: Date | null
  refresh: () => Promise<void>
} {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => readLastUpdatedFromStorage(tableName))

  const refresh = useCallback(async () => {
    const localCached = readLastUpdatedFromStorage(tableName)

    const { data, error } = await supabase
      .from('import_metadata')
      .select('last_updated_at')
      .eq('table_name', tableName)
      .order('last_updated_at', { ascending: false, nullsFirst: false })
      .limit(1)

    if (error) {
      setLastUpdated(localCached)
      return
    }

    const serverValue = data?.[0]?.last_updated_at
      ? new Date(data[0].last_updated_at)
      : null

    const safeServerValue = serverValue && !Number.isNaN(serverValue.getTime()) ? serverValue : null
    const next = pickLatestDate(localCached, safeServerValue)

    if (next) {
      setLastUpdatedCache(tableName, next)
    }

    setLastUpdated(next)
  }, [tableName])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    function handleLastUpdated(event: Event) {
      const customEvent = event as CustomEvent<{ tableName?: string; value?: string }>
      if (customEvent.detail?.tableName !== tableName) return
      if (!customEvent.detail.value) return
      setLastUpdated(setLastUpdatedCache(tableName, customEvent.detail.value))
    }

    window.addEventListener(LAST_UPDATED_EVENT, handleLastUpdated)
    return () => {
      window.removeEventListener(LAST_UPDATED_EVENT, handleLastUpdated)
    }
  }, [tableName])

  return { lastUpdated, refresh }
}
