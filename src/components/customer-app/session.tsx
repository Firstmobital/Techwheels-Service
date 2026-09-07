/* eslint-disable react-refresh/only-export-components -- provider and useCustomerSession hook share one session module */
// ============================================================================
// BODY SHOP CUSTOMER APP — SESSION LAYER
// ============================================================================
//
// Every screen consumes CustomerSession from this context, never a raw
// mobile number or reception_entry_id. This keeps the auth *method* (OTP
// today) swappable behind one boundary: verifyCustomerOtp() is the only
// function that knows how a session gets minted; everything downstream just
// holds an opaque session token in localStorage, scoped per link/dealer.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { CustomerSession } from './types'

const STORAGE_KEY = 'bodyshop_customer_session'

interface StoredSession extends CustomerSession {
  savedAt: number
}

function loadStoredSession(): CustomerSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    if (new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return { sessionToken: parsed.sessionToken, expiresAt: parsed.expiresAt }
  } catch {
    return null
  }
}

interface CustomerSessionContextValue {
  session: CustomerSession | null
  setSession: (session: CustomerSession | null) => void
  clearSession: () => void
}

const CustomerSessionContext = createContext<CustomerSessionContextValue | null>(null)

export function CustomerSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<CustomerSession | null>(() => loadStoredSession())

  const setSession = useCallback((next: CustomerSession | null) => {
    setSessionState(next)
    try {
      if (next) {
        const stored: StoredSession = { ...next, savedAt: Date.now() }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
      } else {
        localStorage.removeItem(STORAGE_KEY)
      }
    } catch {
      // localStorage may be unavailable (private browsing); session still
      // works for the current in-memory render.
    }
  }, [])

  const clearSession = useCallback(() => setSession(null), [setSession])

  useEffect(() => {
    if (!session) return
    const msUntilExpiry = Math.max(0, new Date(session.expiresAt).getTime() - Date.now())
    const timer = setTimeout(clearSession, msUntilExpiry)
    return () => clearTimeout(timer)
  }, [session, clearSession])

  return (
    <CustomerSessionContext.Provider value={{ session, setSession, clearSession }}>
      {children}
    </CustomerSessionContext.Provider>
  )
}

export function useCustomerSession(): CustomerSessionContextValue {
  const ctx = useContext(CustomerSessionContext)
  if (!ctx) throw new Error('useCustomerSession must be used within CustomerSessionProvider')
  return ctx
}
