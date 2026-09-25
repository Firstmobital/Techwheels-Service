import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { safeStorage } from '../lib/storageHelper'
import {
  customerEndSession,
  customerListMyVehicles,
  customerStartSession,
  type CustomerVehicle,
} from '../lib/api/customerAuth'
import {
  clearAllCustomerDocumentsCaches,
  syncCustomerDocumentsFromServer,
  warmCustomerDocumentsMemoryForRegs,
} from '../lib/customer/customerDocumentsCache'

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
  setSelectedReg: (reg: string) => void
  rememberAudience: (audience: Audience) => Promise<void>
  signIn: (username: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const defaultCustomerSession: CustomerSessionContextType = {
  loading: false,
  token: null,
  phone: null,
  vehicles: [],
  selectedReg: null,
  lastAudience: null,
  setSelectedReg: () => {},
  rememberAudience: async () => {},
  signIn: async () => ({ error: 'Not initialized' }),
  signOut: async () => {},
}

const CustomerSessionContext = createContext<CustomerSessionContextType>(defaultCustomerSession)

export function CustomerSessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([])
  const [selectedReg, setSelectedReg] = useState<string | null>(null)
  const [lastAudience, setLastAudience] = useState<Audience | null>(null)

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
            const list = await customerListMyVehicles(savedToken)
            if (!mounted) return
            if (list.length > 0) {
              setVehicles(list)
              setSelectedReg(list[0].reg_number)
              const regs = list.map((v) => v.reg_number).filter(Boolean)
              void warmCustomerDocumentsMemoryForRegs(regs)
              void syncCustomerDocumentsFromServer(savedToken, list[0].reg_number).catch(() => {})
            } else {
              setToken(null)
              setPhone(null)
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
  }, [])

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
    if (primaryReg) {
      const regs = result.data.vehicles.map((v) => v.reg_number).filter(Boolean)
      void warmCustomerDocumentsMemoryForRegs(regs)
      void syncCustomerDocumentsFromServer(result.data.session_token, primaryReg).catch(() => {})
    }
    return {}
  }, [])

  const signOut = useCallback(async () => {
    try {
      await customerEndSession(token)
    } catch {
      // ignore
    }
    await safeStorage.deleteItem(TOKEN_KEY)
    await safeStorage.deleteItem(PHONE_KEY)
    await clearAllCustomerDocumentsCaches()
    setToken(null)
    setPhone(null)
    setVehicles([])
    setSelectedReg(null)
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
        setSelectedReg,
        rememberAudience,
        signIn,
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


