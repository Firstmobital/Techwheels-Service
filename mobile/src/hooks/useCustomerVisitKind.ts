import { useCallback, useEffect, useState } from 'react'
import { customerGetActiveJob } from '../lib/api/customerPortal'
import {
  resolveCustomerVisitKind,
  type CustomerVisitKind,
} from '../lib/customer/mechanicalServiceType'

export function useCustomerVisitKind(token: string | null, regNumber?: string | null) {
  const [kind, setKind] = useState<CustomerVisitKind>('other')
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!token) {
      setKind('other')
      setJob(null)
      setLoading(false)
      return
    }
    try {
      const res = await customerGetActiveJob(token, regNumber)
      const activeJob = (res.job as Record<string, unknown> | null) ?? null
      setJob(activeJob)
      setKind(resolveCustomerVisitKind(activeJob))
    } catch {
      setJob(null)
      setKind('other')
    } finally {
      setLoading(false)
    }
  }, [token, regNumber])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { kind, job, loading, refresh, isMechanical: kind === 'mechanical', isBodyshop: kind === 'bodyshop' }
}
