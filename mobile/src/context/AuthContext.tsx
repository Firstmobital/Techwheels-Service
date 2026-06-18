import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { hasSupabaseEnv, supabase } from '../lib/supabase'

const SIGN_IN_TIMEOUT_MS = 20000

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error?: Error }>
  signUp: (email: string, password: string) => Promise<{ error?: Error }>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

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
        const signInRequest = supabase.auth.signInWithPassword({ email, password })
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timer = setTimeout(() => {
            clearTimeout(timer)
            reject(new Error('Sign in timed out. Please check internet and try again.'))
          }, SIGN_IN_TIMEOUT_MS)
        })

        const { data, error } = await Promise.race([signInRequest, timeoutPromise])
        if (error) {
          return { error }
        }

        setSession(data.session)
        setUser(data.user)
        return { error: undefined }
      } catch (error) {
        return { error: error as Error }
      }
    },
    []
  )

  const signUp = useCallback(
    async (email: string, password: string) => {
      try {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) {
          return { error }
        }

        return { error: undefined }
      } catch (error) {
        return { error: error as Error }
      }
    },
    []
  )

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
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
