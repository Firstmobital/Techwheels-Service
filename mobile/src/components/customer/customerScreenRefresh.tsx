import { createContext, useContext, useEffect } from 'react'

export type CustomerScreenRefreshFn = () => void | Promise<void>

type CustomerScreenRefreshContextValue = {
  addHandler: (fn: CustomerScreenRefreshFn) => () => void
}

export const CustomerScreenRefreshContext = createContext<CustomerScreenRefreshContextValue | null>(null)

/** Register pull-to-refresh handler for the current customer screen (CustomerScreen ScrollView). */
export function useCustomerScreenRefresh(onRefresh: CustomerScreenRefreshFn) {
  const ctx = useContext(CustomerScreenRefreshContext)
  useEffect(() => {
    if (!ctx) return
    return ctx.addHandler(onRefresh)
  }, [ctx, onRefresh])
}
