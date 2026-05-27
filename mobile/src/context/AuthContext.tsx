import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { secureStorage } from '@/lib/secureStorage'

interface AuthContextType {
  session: Session | null
  user: Session['user'] | null
  loading: boolean
  signOut: () => Promise<void>
  signIn: (email: string, password: string) => Promise<{ error?: Error }>
  signUp: (email: string, password: string) => Promise<{ error?: Error }>
  refreshSession: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<Session['user'] | null>(null)
  const [loading, setLoading] = useState(true)

  // Token refresh logic
  const refreshSession = useCallback(async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        console.error('Session refresh failed:', error.message)
        // If refresh fails, clear session
        await supabase.auth.signOut()
        setSession(null)
        setUser(null)
      } else if (data.session) {
        setSession(data.session)
        setUser(data.session.user)
        // Save the new token securely
        if (data.session.access_token) {
          await secureStorage.saveAuthToken(data.session.access_token)
        }
      }
    } catch (error) {
      console.error('Token refresh error:', error)
    }
  }, [])

  useEffect(() => {
    // Check initial session
    const initSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          setSession(session)
          setUser(session.user)
          // Save token for recovery
          if (session.access_token) {
            await secureStorage.saveAuthToken(session.access_token)
          }
          if (session.user.id) {
            await secureStorage.saveUserId(session.user.id)
          }
        }
      } catch (error) {
        console.error('Failed to retrieve initial session:', error)
      } finally {
        setLoading(false)
      }
    }

    initSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)

        // Save/clear tokens based on auth state
        if (session?.access_token) {
          await secureStorage.saveAuthToken(session.access_token)
          if (session.user.id) {
            await secureStorage.saveUserId(session.user.id)
          }
        } else {
          await secureStorage.clearAuthData()
        }

        setLoading(false)
      }
    )

    return () => subscription?.unsubscribe()
  }, [])

  // Auto-refresh token every 5 minutes
  useEffect(() => {
    if (!session) return

    const interval = setInterval(async () => {
      await refreshSession()
    }, 5 * 60 * 1000) // 5 minutes

    return () => clearInterval(interval)
  }, [session, refreshSession])

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        console.error('Sign out error:', error.message)
      }
      await secureStorage.clearAuthData()
      setSession(null)
      setUser(null)
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) {
          return { error }
        }
        if (data.session) {
          setSession(data.session)
          setUser(data.session.user)
          if (data.session.access_token) {
            await secureStorage.saveAuthToken(data.session.access_token)
          }
          if (data.session.user.id) {
            await secureStorage.saveUserId(data.session.user.id)
          }
        }
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
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) {
          return { error }
        }
        // Note: User won't be logged in until email is confirmed
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
