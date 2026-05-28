import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

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
        if (data.session?.refresh_token) {
          // Force token refresh so latest user_metadata/JWT claims (e.g., dealer_code) are applied.
          const refreshed = await supabase.auth.refreshSession({ refresh_token: data.session.refresh_token })
          if (refreshed.data.session) {
            if (!mounted) return
            setSession(refreshed.data.session)
            setUser(refreshed.data.session.user)
            return
          }
        }
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
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          return { error }
        }

        const refreshed = data.session?.refresh_token
          ? await supabase.auth.refreshSession({ refresh_token: data.session.refresh_token })
          : null

        const sessionToSet = refreshed?.data.session ?? data.session
        setSession(sessionToSet)
        setUser(sessionToSet?.user ?? data.user)
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
