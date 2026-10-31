import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
import { safeStorage } from '../lib/storageHelper'
import {
  customerAcceptTerms,
  customerEndSession,
  customerGetTermsStatus,
  customerListMyVehicles,
  customerStartSession,
  customerTouchSession,
  type CustomerTermsStatus,
  type CustomerVehicle,
} from '../lib/api/customerAuth'
import { CUSTOMER_TERMS_VERSION } from '../lib/customer/customerTermsContent'
import { resetCustomerDocumentsInflight } from '../lib/customer/customerDocumentsCache'
import { clearCustomerPortalCache } from '../lib/api/customerPortal'

const TOKEN_KEY = 'customer_session_token'
const PHONE_KEY = 'customer_session_phone'
const AUDIENCE_KEY = 'last_audience'
const SESSION_TOUCH_DEBOUNCE_MS = 60_000

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
  signIn: (username: string, password: string) => Promise<{ error?: string; needsTerms?: boolean; isNewUser?: boolean }>
  addVehicle: (vehicle: CustomerVehicle) => void
  acceptTerms: () => Promise<{ error?: string }>
  refreshTermsStatus: () => Promise<void>
  ensureActiveSession: () => Promise<boolean>
  touchSession: () => Promise<boolean>
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
  addVehicle: () => {},
  acceptTerms: async () => ({ error: 'Not initialized' }),
  refreshTermsStatus: async () => {},
  ensureActiveSession: async () => false,
  touchSession: async () => false,
  signOut: async () => {},
}

function resolveNeedsTerms(terms: CustomerTermsStatus | null | undefined): boolean {
  return Boolean(terms?.needs_acceptance)
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
  const lastTouchAtRef = useRef(0)

  const applyTermsStatus = useCallback((terms: CustomerTermsStatus | null | undefined) => {
    setTermsNeedsAcceptance(resolveNeedsTerms(terms))
  }, [])

  const clearCustomerSessionState = useCallback(async () => {
    setToken(null)
    setPhone(null)
    setVehicles([])
    setSelectedReg(null)
    setTermsNeedsAcceptance(false)
    await safeStorage.deleteItem(TOKEN_KEY)
    await safeStorage.deleteItem(PHONE_KEY)
  }, [])

  const touchSession = useCallback(async (): Promise<boolean> => {
    if (!token) return false
    const touched = await customerTouchSession(token)
    if (touched.expired) {
      await clearCustomerSessionState()
      return false
    }
    return touched.ok
  }, [token, clearCustomerSessionState])

  const ensureActiveSession = useCallback(async (): Promise<boolean> => {
    if (!token) return false
    const looked = await customerGetTermsStatus(token)
    if (looked.expired) {
      await clearCustomerSessionState()
      return false
    }
    if (looked.terms) applyTermsStatus(looked.terms)
    const touched = await customerTouchSession(token)
    if (touched.expired) {
      await clearCustomerSessionState()
      return false
    }
    return true
  }, [token, applyTermsStatus, clearCustomerSessionState])

  const refreshTermsStatus = useCallback(async () => {
    if (!token) {
      setTermsNeedsAcceptance(false)
      return
    }
    const looked = await customerGetTermsStatus(token)
    if (looked.expired) {
      await clearCustomerSessionState()
      return
    }
    if (looked.terms) applyTermsStatus(looked.terms)
  }, [token, applyTermsStatus, clearCustomerSessionState])

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
            const looked = await customerGetTermsStatus(savedToken)
            if (!mounted) return
            if (looked.expired) {
              await clearCustomerSessionState()
              return
            }
            if (!looked.terms) return
            applyTermsStatus(looked.terms)
            void customerTouchSession(savedToken).catch(() => {})
            if (looked.terms.needs_acceptance) {
              return
            }
            const list = await customerListMyVehicles(savedToken)
            if (!mounted) return
            if (list.length > 0) {
              setVehicles(list)
              setSelectedReg(list[0].reg_number)
            }
          } catch (error) {
            console.error('Failed to refresh customer vehicles on boot:', error)
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
  }, [applyTermsStatus, clearCustomerSessionState])

  useEffect(() => {
    if (!token) return

    const onAppState = (state: AppStateStatus) => {
      if (state !== 'active') return
      const now = Date.now()
      if (now - lastTouchAtRef.current < SESSION_TOUCH_DEBOUNCE_MS) return
      lastTouchAtRef.current = now
      void touchSession()
    }

    const sub = AppState.addEventListener('change', onAppState)
    return () => sub.remove()
  }, [token, touchSession])

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

    let terms = result.data.terms ?? null
    if (!terms) {
      const looked = await customerGetTermsStatus(result.data.session_token)
      terms = looked.terms
    }
    const needsTerms = resolveNeedsTerms(terms)
    applyTermsStatus(terms)
    const isNewUser = result.data.vehicles.length === 0
    return { needsTerms, isNewUser }
  }, [applyTermsStatus])

  const addVehicle = useCallback((vehicle: CustomerVehicle) => {
    setVehicles((prev) => [...prev, vehicle])
    setSelectedReg(vehicle.reg_number)
  }, [])

  const acceptTerms = useCallback(async () => {
    if (!token) return { error: 'Session expired. Please sign in again.' }
    const touched = await customerTouchSession(token)
    if (touched.expired) {
      await clearCustomerSessionState()
      return { error: 'Session expired.' }
    }
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
  }, [token, vehicles.length, applyTermsStatus, clearCustomerSessionState])

  const signOut = useCallback(async () => {
    try {
      await customerEndSession(token)
    } catch {
      // ignore
    }
    resetCustomerDocumentsInflight()
    clearCustomerPortalCache()
    await clearCustomerSessionState()
  }, [token, clearCustomerSessionState])

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
        addVehicle,
        acceptTerms,
        refreshTermsStatus,
        ensureActiveSession,
        touchSession,
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
