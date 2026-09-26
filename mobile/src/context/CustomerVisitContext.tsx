import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { customerGetVisitContext } from '../lib/api/customerPortal'
import type { MechanicalCasePayload } from '../lib/customer/mechanicalCustomerUi'
import type { CustomerVisitKind } from '../lib/customer/mechanicalServiceType'
import { useCustomerSession } from './CustomerSessionContext'

type CustomerVisitContextValue = {
  /** First active-job fetch finished for current token + selectedReg. */
  ready: boolean
  loading: boolean
  kind: CustomerVisitKind
  job: Record<string, unknown> | null
  mechCase: MechanicalCasePayload | null
  repairCard: Record<string, unknown> | null
  isMechanical: boolean
  isBodyshop: boolean
  refresh: () => Promise<CustomerVisitKind>
}

const defaultValue: CustomerVisitContextValue = {
  ready: false,
  loading: true,
  kind: 'other',
  job: null,
  mechCase: null,
  repairCard: null,
  isMechanical: false,
  isBodyshop: false,
  refresh: async () => 'other' as CustomerVisitKind,
}

const CustomerVisitContext = createContext<CustomerVisitContextValue>(defaultValue)

export function CustomerVisitProvider({ children }: { children: ReactNode }) {
  const { token, selectedReg } = useCustomerSession()
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [kind, setKind] = useState<CustomerVisitKind>('other')
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [mechCase, setMechCase] = useState<MechanicalCasePayload | null>(null)
  const [repairCard, setRepairCard] = useState<Record<string, unknown> | null>(null)
  const loadSeq = useRef(0)

  const refresh = useCallback(async (): Promise<CustomerVisitKind> => {
    const seq = ++loadSeq.current
    if (!token || !selectedReg) {
      setJob(null)
      setMechCase(null)
      setRepairCard(null)
      setKind('other')
      setReady(false)
      setLoading(false)
      return 'other'
    }

    setLoading(true)
    try {
      const ctx = await customerGetVisitContext(token, selectedReg)
      if (seq !== loadSeq.current) return 'other'

      const visitKind = ctx.visit_kind
      setJob((ctx.job as Record<string, unknown> | null) ?? null)
      setKind(visitKind)
      setMechCase((ctx.mechanical_case as MechanicalCasePayload | null) ?? null)
      setRepairCard((ctx.repair_card as Record<string, unknown> | null) ?? null)
      return visitKind
    } catch {
      if (seq !== loadSeq.current) return 'other'
      setJob(null)
      setKind('other')
      setMechCase(null)
      setRepairCard(null)
      return 'other'
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false)
        setReady(true)
      }
    }
  }, [token, selectedReg])

  useEffect(() => {
    setReady(false)
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({
      ready,
      loading,
      kind,
      job,
      mechCase,
      repairCard,
      isMechanical: kind === 'mechanical',
      isBodyshop: kind === 'bodyshop',
      refresh,
    }),
    [ready, loading, kind, job, mechCase, repairCard, refresh]
  )

  return <CustomerVisitContext.Provider value={value}>{children}</CustomerVisitContext.Provider>
}

export function useCustomerVisit() {
  return useContext(CustomerVisitContext)
}
