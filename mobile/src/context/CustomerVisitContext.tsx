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
import { AppState, type AppStateStatus } from 'react-native'
import { CUSTOMER_VISIT_BACKGROUND_POLL_MS } from '../lib/customer/customerAdvisorPoll'
import { customerGetVisitContext, customerSetCustomerType } from '../lib/api/customerPortal'
import type { MechanicalCasePayload } from '../lib/customer/mechanicalCustomerUi'
import { type CustomerVisitKind, resolveCustomerVisitKind } from '../lib/customer/mechanicalServiceType'
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
  customerType: string
  setCustomerType: (type: string) => Promise<void>
  refresh: (opts?: { bypassCache?: boolean }) => Promise<CustomerVisitKind>
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
  customerType: 'individual',
  setCustomerType: async () => {},
  refresh: async (_opts?: { bypassCache?: boolean }) => 'other' as CustomerVisitKind,
}

const CustomerVisitContext = createContext<CustomerVisitContextValue>(defaultValue)

// In-memory persistent map of customer selected types keyed by reg
const customerTypeMap: Record<string, string> = {}

export function CustomerVisitProvider({ children }: { children: ReactNode }) {
  const { token, selectedReg } = useCustomerSession()
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [kind, setKind] = useState<CustomerVisitKind>('other')
  const [job, setJob] = useState<Record<string, unknown> | null>(null)
  const [mechCase, setMechCase] = useState<MechanicalCasePayload | null>(null)
  const [repairCard, setRepairCard] = useState<Record<string, unknown> | null>(null)
  const [customerType, setCustomerTypeState] = useState<string>('individual')
  const loadSeq = useRef(0)

  const normReg = useMemo(() => {
    return (selectedReg || '').trim().toUpperCase().replace(/[\s-]/g, '')
  }, [selectedReg])

  // Sync customerType from memory or repairCard
  useEffect(() => {
    if (!normReg) {
      setCustomerTypeState('individual')
      return
    }
    const saved = customerTypeMap[normReg]
    if (saved) {
      setCustomerTypeState(saved)
    } else if (repairCard?.customer_type) {
      const ct = String(repairCard.customer_type).trim().toLowerCase()
      if (ct) {
        customerTypeMap[normReg] = ct
        setCustomerTypeState(ct)
      }
    }
  }, [normReg, repairCard?.customer_type])

  const setCustomerType = useCallback(
    async (newType: string) => {
      const norm = newType.trim().toLowerCase() || 'individual'
      if (normReg) {
        customerTypeMap[normReg] = norm
      }
      setCustomerTypeState(norm)
      setRepairCard((prev) => {
        if (!prev) return { customer_type: norm }
        return { ...prev, customer_type: norm }
      })

      if (token && selectedReg) {
        try {
          const cardId = Number(repairCard?.id) || undefined
          await customerSetCustomerType(token, selectedReg, norm, cardId)
        } catch (err) {
          console.warn('CustomerVisitContext: Failed to persist customer type to backend:', err)
        }
      }
    },
    [normReg, token, selectedReg, repairCard?.id]
  )

  const refresh = useCallback(async (opts?: { bypassCache?: boolean }): Promise<CustomerVisitKind> => {
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

    // Only show full loading spinner if not yet ready
    if (!ready) {
      setLoading(true)
    }

    try {
      const ctx = await customerGetVisitContext(token, selectedReg, { bypassCache: opts?.bypassCache ?? true })
      if (seq !== loadSeq.current) return 'other'

      const rawCard = (ctx.repair_card as Record<string, unknown> | null) ?? null
      const jobObj = (ctx.job as Record<string, unknown> | null) ?? null

      // Ensure customer_type is preserved from local memory if backend has not yet updated it
      let finalCard = rawCard
      if (normReg) {
        const savedType = customerTypeMap[normReg]
        const serverType = String(rawCard?.customer_type || '').trim().toLowerCase()
        if (serverType) {
          customerTypeMap[normReg] = serverType
          setCustomerTypeState(serverType)
        } else if (savedType && rawCard) {
          finalCard = { ...rawCard, customer_type: savedType }
          setCustomerTypeState(savedType)
        }
      }

      const resolvedKind = resolveCustomerVisitKind(jobObj, ctx.visit_kind, finalCard)

      setJob(jobObj)
      setKind(resolvedKind)
      setMechCase((ctx.mechanical_case as MechanicalCasePayload | null) ?? null)
      setRepairCard(finalCard)
      return resolvedKind
    } catch (err) {
      if (seq !== loadSeq.current) return 'other'
      console.warn('CustomerVisitContext: refresh error (retaining cached visit state):', err)
      // Do NOT wipe out existing state on background fetch failure
      return kind
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false)
        setReady(true)
      }
    }
  }, [token, selectedReg, ready, normReg, kind])

  useEffect(() => {
    setReady(false)
    void refresh()
  }, [token, selectedReg]) // re-run only when session / selected reg changes

  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  // Keep advisor doc approvals / rejections in sync without force-killing the app.
  useEffect(() => {
    if (!token || !selectedReg) return

    let cancelled = false
    const tick = () => {
      if (!cancelled && AppState.currentState === 'active') {
        void refreshRef.current({ bypassCache: false })
      }
    }

    const interval = setInterval(tick, CUSTOMER_VISIT_BACKGROUND_POLL_MS)
    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void refreshRef.current({ bypassCache: true })
    }
    const sub = AppState.addEventListener('change', onAppState)

    return () => {
      cancelled = true
      clearInterval(interval)
      sub.remove()
    }
  }, [token, selectedReg])

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
      customerType,
      setCustomerType,
      refresh,
    }),
    [ready, loading, kind, job, mechCase, repairCard, customerType, setCustomerType, refresh]
  )

  return <CustomerVisitContext.Provider value={value}>{children}</CustomerVisitContext.Provider>
}

export function useCustomerVisit() {
  return useContext(CustomerVisitContext)
}
