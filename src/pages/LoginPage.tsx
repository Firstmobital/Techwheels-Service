import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { AuthShell } from '../components/AuthShell'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

interface Props {
  onSwitchToSignUp: () => void
  onSwitchToForgot?: () => void
}

const PITCH = {
  login: {
    title: "Run your service workshop from one dashboard.",
    body: "Reception to delivery — intake, job cards, technician assignment, parts and revenue reporting, all role-aware and in real time.",
    features: [
      { icon: "reception", t: "Front-desk intake", m: "Capture vehicles & assign advisors in seconds" },
      { icon: "shield",    t: "Role-based access", m: "Everyone sees exactly the modules they own" },
      { icon: "reports",   t: "Live analytics",    m: "Labour, parts & VAS revenue at a glance" },
    ],
  },
}

export default function LoginPage({ onSwitchToSignUp, onSwitchToForgot }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setLoading(false)
  }

  const quickAdminLogin = async (targetEmail: string) => {
    setLoading(true)
    setError(null)
    try {
      const serviceKey = import.meta.env.VITE_SUPABASE_SERVICE_KEY
      const url = import.meta.env.VITE_SUPABASE_URL
      if (!serviceKey || !url) {
        throw new Error('VITE_SUPABASE_SERVICE_KEY or VITE_SUPABASE_URL not found in .env.local')
      }
      const adminClient = createClient(url, serviceKey)
      const { data, error: linkErr } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: targetEmail,
      })
      if (linkErr) throw linkErr
      if (!data?.properties?.hashed_token) {
        throw new Error('Could not generate login token')
      }
      const { error: otpErr } = await supabase.auth.verifyOtp({
        token_hash: data.properties.hashed_token,
        type: 'magiclink',
      })
      if (otpErr) throw otpErr
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Quick login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell pitch={PITCH.login}>
      <div className="authcard__head">
        <div className="authcard__eyebrow">Welcome back</div>
        <h1>Sign in to your account</h1>
        <p className="authcard__sub">Use your Firstmobital work email to continue.</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5">
        <label className="field">
          <span className="label">Email address</span>
          <span className="inp-wrap">
            <span className="icon-l"><Icon name="mail" size={17} /></span>
            <input
              className="inp"
              type="email"
              placeholder="you@firstmobital.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </span>
        </label>

        <label className="field">
          <span className="label">Password</span>
          <span className="inp-wrap">
            <span className="icon-l"><Icon name="lock" size={17} /></span>
            <input
              className="inp"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="toggle-eye"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Toggle password visibility"
            >
              <Icon name={showPassword ? "eyeoff" : "eye"} size={17} />
            </button>
          </span>
        </label>

        {error && (
          <div className="alert alert--err">
            <Icon name="alert" size={17} />
            <span>{error}</span>
          </div>
        )}

        <div className="helprow">
          <label className="checkrow">
            <input type="checkbox" defaultChecked />
            Keep me signed in
          </label>
          <button type="button" className="linkbtn" onClick={onSwitchToForgot}>
            Forgot password?
          </button>
        </div>

        <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
          {loading ? 'Signing in…' : <>Sign in <Icon name="arrowr" size={17} /></>}
        </button>
      </form>

      {import.meta.env.DEV && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: '#f0fdf4', border: '1px solid #86efac' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#166534', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            ⚡ Local Dev · 1-Click Admin Login
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn--primary"
              style={{ flex: 1, minWidth: 140, background: '#16a34a', borderColor: '#16a34a' }}
              disabled={loading}
              onClick={() => void quickAdminLogin('cfo@techwheels.in')}
            >
              {loading ? 'Logging in…' : '1-Click Admin (CFO)'}
            </button>
            <button
              type="button"
              className="btn"
              style={{ flex: 1, minWidth: 140 }}
              disabled={loading}
              onClick={() => void quickAdminLogin('mukesh_arora2@yahoo.com')}
            >
              {loading ? 'Logging in…' : '1-Click Admin (Mukesh)'}
            </button>
          </div>
        </div>
      )}

      <div className="divider-or">New to Techwheels?</div>
      <button type="button" className="btn btn--ghost btn--block" onClick={onSwitchToSignUp}>
        Request access
      </button>

      <p className="authfine">Techwheels Service v1.0 · Firstmobital · Protected by role-based access control</p>
    </AuthShell>
  )
}
