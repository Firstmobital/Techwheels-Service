import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { safeStorage } from '../lib/storageHelper'
import {
  customerAcceptTerms,
  customerEndSession,
  customerGetTermsStatus,
  customerListMyVehicles,
  customerStartSession,
  type CustomerTermsStatus,
  type CustomerVehicle,
} from '../lib/api/customerAuth'
import { CUSTOMER_TERMS_VERSION } from '../lib/customer/customerTermsContent'
import { resetCustomerDocumentsInflight } from '../lib/customer/customerDocumentsCache'
import { clearCustomerPortalCache } from '../lib/api/customerPortal'

const TOKEN_KEY = 'customer_session_token'
const PHONE_KEY = 'customer_session_phone'
const AUDIENCE_KEY = 'last_audience'

export type Audience = 'customer' | 'staff'

interface CustomerSessionContextType {
  loading: boolean
  token: string | null
  phone: string | null
  vehicles: CustomerVehicle[]
  selectedReg: string | null
  lastAudience: Audience | null
  termsNeedsAcceptance: boolean
  setSelectedReg: (reg: string) => void
  rememberAudience: (audience: Audience) => Promise<void>
  signIn: (username: string, password: string) => Promise<{ error?: string; needsTerms?: boolean }>
  acceptTerms: () => Promise<{ error?: string }>
  refreshTermsStatus: () => Promise<void>
  signOut: () => Promise<void>
}

const defaultCustomerSession: CustomerSessionContextType = {
  loading: false,
  token: null,
  phone: null,
  vehicles: [],
  selectedReg: null,
  lastAudience: null,
  termsNeedsAcceptance: false,
  setSelectedReg: () => {},
  rememberAudience: async () => {},
  signIn: async () => ({ error: 'Not initialized' }),
  acceptTerms: async () => ({ error: 'Not initialized' }),
  refreshTermsStatus: async () => {},
  signOut: async () => {},
}

function resolveNeedsTerms(terms: CustomerTermsStatus | null | undefined): boolean {
  if (!terms) return true
  return Boolean(terms.needs_acceptance)
}

const CustomerSessionContext = createContext<CustomerSessionContextType>(defaultCustomerSession)

export function CustomerSessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([])
  const [selectedReg, setSelectedReg] = useState<string | null>(null)
  const [lastAudience, setLastAudience] = useState<Audience | null>(null)
  const [termsNeedsAcceptance, setTermsNeedsAcceptance] = useState(false)

  const applyTermsStatus = useCallback((terms: CustomerTermsStatus | null | undefined) => {
    setTermsNeedsAcceptance(resolveNeedsTerms(terms))
  }, [])

  const refreshTermsStatus = useCallback(async () => {
    if (!token) {
      setTermsNeedsAcceptance(false)
      return
    }
    const terms = await customerGetTermsStatus(token)
    applyTermsStatus(terms)
  }, [token, applyTermsStatus])

  useEffect(() => {
    let mounted = true
    const bootstrap = async () => {
      try {
        const [savedToken, savedPhone, savedAudience] = await Promise.all([
          safeStorage.getItem(TOKEN_KEY),
          safeStorage.getItem(PHONE_KEY),
          safeStorage.getItem(AUDIENCE_KEY),
        ])
        if (!mounted) return
        if (savedAudience === 'customer' || savedAudience === 'staff') {
          setLastAudience(savedAudience)
        }
        if (savedToken) {
          setToken(savedToken)
          setPhone(savedPhone)
          try {
            const terms = await customerGetTermsStatus(savedToken)
            if (!mounted) return
            applyTermsStatus(terms)
            if (resolveNeedsTerms(terms)) {
              return
            }
            const list = await customerListMyVehicles(savedToken)
            if (!mounted) return
            if (list.length > 0) {
              setVehicles(list)
              setSelectedReg(list[0].reg_number)
            } else {
              setToken(null)
              setPhone(null)
              setTermsNeedsAcceptance(false)
              await safeStorage.deleteItem(TOKEN_KEY)
              await safeStorage.deleteItem(PHONE_KEY)
            }
          } catch (error) {
            console.error('Failed to refresh customer vehicles on boot:', error)
            // Keep saved token so a slow network does not bounce the user to the audience screen.
          }
        }
      } catch (error) {
        console.error('Failed to restore customer session:', error)
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void bootstrap()
    return () => {
      mounted = false
    }
  }, [applyTermsStatus])

  const rememberAudience = useCallback(async (audience: Audience) => {
    setLastAudience(audience)
    await safeStorage.setItem(AUDIENCE_KEY, audience)
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await customerStartSession(username, password)
    if (!result.success || !result.data) {
      return { error: result.error || 'Invalid mobile number.' }
    }
    await safeStorage.setItem(TOKEN_KEY, result.data.session_token)
    await safeStorage.setItem(PHONE_KEY, result.data.phone)
    await safeStorage.setItem(AUDIENCE_KEY, 'customer')
    setToken(result.data.session_token)
    setPhone(result.data.phone)
    setVehicles(result.data.vehicles)
    const primaryReg = result.data.vehicles[0]?.reg_number ?? null
    setSelectedReg(primaryReg)
    setLastAudience('customer')
    clearCustomerPortalCache()

    let terms = result.data.terms
    if (!terms) {
      terms = await customerGetTermsStatus(result.data.session_token)
    }
    const needsTerms = resolveNeedsTerms(terms ?? null)
    applyTermsStatus(terms)
    return { needsTerms }
  }, [applyTermsStatus])

  const acceptTerms = useCallback(async () => {
    if (!token) return { error: 'Session expired. Please sign in again.' }
    const result = await customerAcceptTerms(token, CUSTOMER_TERMS_VERSION)
    if (!result.success) {
      return { error: result.error || 'Unable to save acceptance.' }
    }
    applyTermsStatus(result.terms)
    if (vehicles.length === 0) {
      try {
        const list = await customerListMyVehicles(token)
        if (list.length > 0) {
          setVehicles(list)
          setSelectedReg(list[0].reg_number)
        }
      } catch {
        // Portal will retry on next refresh
      }
    }
    return {}
  }, [token, vehicles.length, applyTermsStatus])

  const signOut = useCallback(async () => {
    try {
      await customerEndSession(token)
    } catch {
      // ignore
    }
    await safeStorage.deleteItem(TOKEN_KEY)
    await safeStorage.deleteItem(PHONE_KEY)
    resetCustomerDocumentsInflight()
    clearCustomerPortalCache()
    setToken(null)
    setPhone(null)
    setVehicles([])
    setSelectedReg(null)
    setTermsNeedsAcceptance(false)
  }, [token])

  return (
    <CustomerSessionContext.Provider
      value={{
        loading,
        token,
        phone,
        vehicles,
        selectedReg,
        lastAudience,
        termsNeedsAcceptance,
        setSelectedReg,
        rememberAudience,
        signIn,
        acceptTerms,
        refreshTermsStatus,
        signOut,
      }}
    >
      {children}
    </CustomerSessionContext.Provider>
  )
}

export function useCustomerSession() {
  const context = useContext(CustomerSessionContext)
  return context || defaultCustomerSession
}


