import { useState } from 'react'
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

      <div className="divider-or">New to Techwheels?</div>
      <button type="button" className="btn btn--ghost btn--block" onClick={onSwitchToSignUp}>
        Request access
      </button>

      <p className="authfine">Techwheels Service v1.0 · Firstmobital · Protected by role-based access control</p>
    </AuthShell>
  )
}
