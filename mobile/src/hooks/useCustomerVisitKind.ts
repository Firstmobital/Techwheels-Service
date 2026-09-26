import { useCustomerVisit } from '../context/CustomerVisitContext'

/** @deprecated Prefer useCustomerVisit() — kept for existing imports. */
export function useCustomerVisitKind(_token: string | null, _regNumber?: string | null) {
  const visit = useCustomerVisit()
  return {
    kind: visit.kind,
    job: visit.job,
    loading: visit.loading || !visit.ready,
    refresh: visit.refresh,
    isMechanical: visit.isMechanical,
    isBodyshop: visit.isBodyshop,
    visitReady: visit.ready,
  }
}
