import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Supabase puts the tokens in the URL hash (#access_token=...&type=signup)
    // or as query params (?code=... for PKCE). Handle both.
    const hash = window.location.hash
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
    const flowType = hashParams.get('type')

    const handle = async () => {
      if (code) {
        // PKCE flow
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) { setError(error.message); return }
      } else if (hash.includes('access_token')) {
        // Implicit flow — Supabase JS picks this up automatically via onAuthStateChange
        // Just wait for the session to populate
        const { data, error } = await supabase.auth.getSession()
        if (error || !data.session) { setError('Could not verify your email. Link may have expired.'); return }
      } else {
        setError('Invalid confirmation link.')
        return
      }

      if (flowType === 'recovery') {
        navigate('/reset-password', { replace: true })
        return
      }

      // Success — go to dashboard
      navigate('/import', { replace: true })
    }

    handle()
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
          <h2 className="text-xl font-bold text-gray-900 mb-2">Confirmation failed</h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <Link to="/" className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition">
            Back to Sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 rounded-full border-2 border-blue-600 border-t-transparent animate-spin mx-auto mb-4" />
        <p className="text-sm text-gray-500">Verifying your email…</p>
      </div>
    </div>
  )
}
