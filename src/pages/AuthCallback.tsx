import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { readAuthCallbackParams } from '../lib/authCallbackSession'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const { code, accessToken, refreshToken, type, errorDescription } = readAuthCallbackParams()

    const handle = async () => {
      if (errorDescription) {
        setError(decodeURIComponent(errorDescription.replace(/\+/g, ' ')))
        return
      }

      // Admin generate_link emails redirect with hash tokens (implicit).
      // The web client uses PKCE, which ignores that hash, so set the session here.
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          setError(exchangeError.message)
          return
        }
      } else if (accessToken && refreshToken) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (sessionError) {
          setError(sessionError.message)
          return
        }
      } else {
        setError('Invalid confirmation link.')
        return
      }

      const nextPath = type === 'recovery' ? '/reset-password' : '/home'
      window.history.replaceState(window.history.state, '', nextPath)
      navigate({ pathname: nextPath, search: '', hash: '' }, { replace: true })
    }

    void handle()
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-5">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Link could not be opened</h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <Link to="/forgot-password" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Request a new reset link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">Opening password reset…</p>
      </div>
    </div>
  )
}
