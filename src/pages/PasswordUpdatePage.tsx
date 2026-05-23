import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function PasswordUpdatePage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '')
    })
  }, [])

  function isStrongPassword(value: string): boolean {
    if (value.length < 12) return false
    if (!/[A-Z]/.test(value)) return false
    if (!/[a-z]/.test(value)) return false
    if (!/[0-9]/.test(value)) return false
    if (!/[^A-Za-z0-9]/.test(value)) return false
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    if (!isStrongPassword(password)) {
      setError('Password must be at least 12 chars with upper/lower/number/special.')
      return
    }

    setLoading(true)

    const { data: userData } = await supabase.auth.getUser()
    const existingMeta = (userData.user?.user_metadata ?? {}) as Record<string, unknown>
    const nextMeta = {
      ...existingMeta,
      force_password_change: false,
      temp_password_issued_at: null,
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password,
      data: nextMeta,
    })

    setLoading(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess('Password updated successfully. You can continue to the dashboard.')
    setPassword('')
    setConfirm('')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Update your password</h1>
        <p className="mt-1 text-sm text-gray-500">
          {email ? `Signed in as ${email}.` : 'Signed in user detected.'} Set a new password to continue.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">New password</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 12 chars with upper/lower/number/special"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm password</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Re-enter your new password"
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3.5 py-2.5 text-sm text-green-700">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>

          <button
            type="button"
            onClick={() => navigate('/import', { replace: true })}
            className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Continue to dashboard
          </button>

          <button
            type="button"
            onClick={() => supabase.auth.signOut()}
            className="w-full rounded-lg px-4 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}