import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import NetInfo from '@react-native-community/netinfo'
import { getStaffAuthRedirectUrl } from '../lib/authRedirect'
import { humanizeStaffAuthError } from '../lib/staffAuthErrors'
import { hasSupabaseEnv, supabase } from '../lib/supabase'

export type StaffSignUpInput = {
  email: string
  password: string
  fullName: string
  requestedRole: string
  phone?: string | null
}

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error?: Error }>
  signUp: (input: StaffSignUpInput) => Promise<{ error?: Error }>
  refreshSession: () => Promise<void>
}

const defaultAuthContext: AuthContextType = {
  session: null,
  user: null,
  loading: false,
  signOut: async () => {},
  signIn: async () => ({ error: new Error('Not initialized') }),
  signUp: async () => ({ error: new Error('Not initialized') }) as { error?: Error },
  refreshSession: async () => {},
}

const AuthContext = createContext<AuthContextType>(defaultAuthContext)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshSession = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      throw error
    }

    setSession(data.session)
    setUser(data.session?.user ?? null)
  }, [])

  useEffect(() => {
    let mounted = true

    const bootstrap = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (!mounted) {
          return
        }
        setSession(data.session)
        setUser(data.session?.user ?? null)
      } catch (error) {
        console.error('Failed to restore session:', error)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    bootstrap()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return
      }
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signOut = async () => {
    try {
      const { deactivateStaffPush } = await import('../lib/notifications/pushRegistration')
      await deactivateStaffPush()
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw error
      }
      setSession(null)
      setUser(null)
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!hasSupabaseEnv) {
        return { error: new Error('App configuration missing. Please contact support and retry after next update.') }
      }

      try {
        const net = await NetInfo.fetch()
        if (net.isConnected === false) {
          return {
            error: new Error(
              humanizeStaffAuthError('Network request failed'),
            ),
          }
        }

        const normalizedEmail = email.trim().toLowerCase()
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        })
        if (error) {
          return { error: new Error(humanizeStaffAuthError(error.message)) }
        }

        setSession(data.session)
        setUser(data.user)
        return { error: undefined }
      } catch (error) {
        const err = error as Error
        const msg = err?.message ?? String(error)
        if (err?.name === 'AbortError' || msg.includes('auth_fetch_timeout')) {
          return {
            error: new Error(
              humanizeStaffAuthError('Sign in timed out. Please check internet and try again.'),
            ),
          }
        }
        return { error: new Error(humanizeStaffAuthError(msg)) }
      }
    },
    []
  )

  const signUp = useCallback(async (input: StaffSignUpInput) => {
    if (!hasSupabaseEnv) {
      return { error: new Error('App configuration missing. Please contact support and retry after next update.') }
    }
    try {
      const phoneDigits = String(input.phone ?? '').replace(/\D/g, '')
      const { error } = await supabase.auth.signUp({
        email: input.email.trim().toLowerCase(),
        password: input.password,
        options: {
          data: {
            full_name: input.fullName.trim(),
            role: input.requestedRole,
            phone: phoneDigits.length === 10 ? phoneDigits : null,
          },
          emailRedirectTo: getStaffAuthRedirectUrl(),
        },
      })
      if (error) return { error }
      return { error: undefined }
    } catch (error) {
      return { error: error as Error }
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        signOut,
        signIn,
        signUp,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  return context || defaultAuthContext
}
