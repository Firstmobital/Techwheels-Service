import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import {
  customerEndSession,
  customerListMyVehicles,
  customerStartSession,
  type CustomerVehicle,
} from '../lib/api/customerAuth'

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

const CustomerSessionContext = createContext<CustomerSessionContextType | undefined>(undefined)

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
          SecureStore.getItemAsync(TOKEN_KEY),
          SecureStore.getItemAsync(PHONE_KEY),
          SecureStore.getItemAsync(AUDIENCE_KEY),
        ])
        if (!mounted) return
        if (savedAudience === 'customer' || savedAudience === 'staff') {
          setLastAudience(savedAudience)
        }
        if (savedToken) {
          const list = await customerListMyVehicles(savedToken)
          if (!mounted) return
          if (list.length > 0) {
            setToken(savedToken)
            setPhone(savedPhone)
            setVehicles(list)
            setSelectedReg(list[0].reg_number)
          } else {
            await SecureStore.deleteItemAsync(TOKEN_KEY)
            await SecureStore.deleteItemAsync(PHONE_KEY)
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
    await SecureStore.setItemAsync(AUDIENCE_KEY, audience)
  }, [])

  const signIn = useCallback(async (username: string, password: string) => {
    const result = await customerStartSession(username, password)
    if (!result.success || !result.data) {
      return { error: result.error || 'Invalid mobile number.' }
    }
    await SecureStore.setItemAsync(TOKEN_KEY, result.data.session_token)
    await SecureStore.setItemAsync(PHONE_KEY, result.data.phone)
    await SecureStore.setItemAsync(AUDIENCE_KEY, 'customer')
    setToken(result.data.session_token)
    setPhone(result.data.phone)
    setVehicles(result.data.vehicles)
    setSelectedReg(result.data.vehicles[0]?.reg_number ?? null)
    setLastAudience('customer')
    return {}
  }, [])

  const signOut = useCallback(async () => {
    try {
      await customerEndSession(token)
    } catch {
      // ignore
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    await SecureStore.deleteItemAsync(PHONE_KEY)
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
  if (!context) {
    throw new Error('useCustomerSession must be used within a CustomerSessionProvider')
  }
  return context
}
