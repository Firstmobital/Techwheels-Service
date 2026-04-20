import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useLastUpdated(tableName: string): {
  lastUpdated: Date | null
  refresh: () => void
} {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const refresh = useCallback(() => {
    supabase
      .from('import_metadata')
      .select('last_updated_at')
      .eq('table_name', tableName)
      .maybeSingle()
      .then(({ data }) => {
        setLastUpdated(data?.last_updated_at ? new Date(data.last_updated_at) : null)
      })
  }, [tableName])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { lastUpdated, refresh }
}
