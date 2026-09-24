import { useState } from 'react'
import { AuthShell } from '../components/AuthShell'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

interface Props {
  onSwitchToSignUp: () => void
  onSwitchToForgot?: () => void
  onCustomerLogin?: (vehicle: any, allVehicles: any[], sessionToken: string) => void
}

const PITCH = {
  title: "Run your service workshop from one dashboard.",
  body: "Reception to delivery — intake, job cards, technician assignment, parts and revenue reporting, all role-aware and in real time.",
  features: [
    { icon: "reception", t: "Front-desk intake", m: "Capture vehicles & assign advisors in seconds" },
    { icon: "shield",    t: "Role-based access", m: "Everyone sees exactly the modules they own" },
    { icon: "reports",   t: "Live analytics",    m: "Labour, parts & VAS revenue at a glance" },
  ],
}

export default function LoginPage({ onSwitchToSignUp, onSwitchToForgot }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const inputIdentifier = email.trim()

    const { error: staffErr } = await supabase.auth.signInWithPassword({
      email: inputIdentifier,
      password,
    })

    if (!staffErr) {
      setLoading(false)
      return
    }

    setError(staffErr.message || 'Staff authentication failed. Please check your credentials.')
    setLoading(false)
  }

  return (
    <AuthShell pitch={PITCH}>
      <div className="authcard__head">
        <div className="authcard__eyebrow">Workshop Portal</div>
        <h1>Staff Sign In</h1>
        <p className="authcard__sub">Sign in with your dealership or workshop email address.</p>
      </div>

      <form onSubmit={handleStaffLogin} className="space-y-5">
        <label className="field">
          <span className="label">Work Email</span>
          <span className="inp-wrap">
            <span className="icon-l"><Icon name="mail" size={17} /></span>
            <input
              className="inp"
              type="text"
              placeholder="you@firstmobital.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
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
          {loading ? 'Signing in…' : <>Sign in as Staff <Icon name="arrowr" size={17} /></>}
        </button>
      </form>

      <div className="divider-or">Customer App & Themes</div>
      <a
        href="/customer-preview"
        className="btn btn--block"
        style={{
          background: 'linear-gradient(135deg, #002B49 0%, #061A2D 100%)',
          color: '#00D2C4',
          border: '1px solid rgba(0, 210, 196, 0.4)',
          fontWeight: 700,
          textDecoration: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: '0 4px 16px rgba(0, 43, 73, 0.3)'
        }}
      >
        <span>🚘</span>
        <span>View Tata.cars Theme Preview</span>
      </a>

      <div className="divider-or" style={{ marginTop: '16px' }}>New to Techwheels?</div>
      <button type="button" className="btn btn--ghost btn--block" onClick={onSwitchToSignUp}>
        Request staff access
      </button>

      <p className="authfine" style={{ marginTop: 24 }}>
        Techwheels Service v1.0 · Firstmobital · Tata.cars Inspired Theme
      </p>
    </AuthShell>
  )
}
