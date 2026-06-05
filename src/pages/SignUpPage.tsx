import { useState } from 'react'
import { AuthShell } from '../components/AuthShell'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

interface Props {
  onSwitchToLogin: () => void
}

const PITCH = {
  request: {
    title: "Request access to Techwheels Service.",
    body: "Create your account, then an administrator assigns the modules your role needs - Reception, Reports, AutoDoc and more.",
    features: [
      { icon: "user",      t: "Tell us your role",  m: "We pre-suggest the right module set" },
      { icon: "admin",     t: "Admin approval",     m: "Your manager grants permissions via RBAC" },
      { icon: "sparkles",  t: "Ready fast",         m: "Start working the moment access lands" },
    ],
  },
}

const ROLE_OPTS = [
  { id: 'reception',     label: 'Reception',      icon: 'reception',     desc: 'Vehicle intake & customer communication' },
  { id: 'advisor',       label: 'Service Advisor', icon: 'tech',          desc: 'Job card management & labor tracking' },
  { id: 'floor',         label: 'Floor Incharge',  icon: 'floor',         desc: 'Technician allocation & job progress' },
  { id: 'admin',         label: 'Administrator',   icon: 'shield',        desc: 'System access control & user management' },
]

const PW_RULES = [
  { id: 'len', label: 'At least 12 characters', test: (pw: string) => pw.length >= 12 },
  { id: 'case', label: 'Both uppercase & lowercase', test: (pw: string) => /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  { id: 'num', label: 'At least one number', test: (pw: string) => /[0-9]/.test(pw) },
  { id: 'sym', label: 'At least one symbol (!@#$%)', test: (pw: string) => /[!@#$%^&*]/.test(pw) },
]

export default function SignUpPage({ onSwitchToLogin }: Props) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  // Calculate password strength
  const pwScore = PW_RULES.filter(r => r.test(password)).length

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!selectedRole) {
      setError('Please select a role.')
      return
    }

    if (pwScore < 4) {
      setError('Password does not meet all requirements.')
      return
    }

    if (phone.trim() && phone.replace(/\D/g, '').length !== 10) {
      setError('Phone number must be exactly 10 digits.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { 
          full_name: fullName, 
          role: selectedRole,
          phone: phone.trim() ? phone.replace(/\D/g, '') : null,
        },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setSubmitted(true)
    }
  }

  if (submitted) {
    return (
      <AuthShell pitch={PITCH.request}>
        <div style={{ textAlign: 'center' }}>
          <div className="bigcheck"><Icon name="check" size={28} strokeWidth={2.2} /></div>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Request submitted</h1>
          <p className="authcard__sub">Confirm your email, then an administrator will assign your module permissions.</p>
        </div>

        <div className="access-note" style={{ marginTop: 22, textAlign: 'left' }}>
          <span className="ic"><Icon name="shield" size={17} /></span>
          <div><b>Next: admin grants access</b>
            <p>Until then you'll see a no-modules-assigned notice. We've flagged <b>{ROLE_OPTS.find((r) => r.id === selectedRole)?.label}</b> as your requested role.</p>
          </div>
        </div>

        <button type="button" className="btn btn--primary btn--block" onClick={onSwitchToLogin} style={{ marginTop: 6 }}>
          Back to sign in
        </button>
      </AuthShell>
    )
  }

  return (
    <AuthShell pitch={PITCH.request}>
      <div className="authcard__head">
        <button type="button" className="btn btn--quiet btn--sm" onClick={onSwitchToLogin} style={{ marginLeft: -10, marginBottom: 14 }}>
          <Icon name="back" size={16} /> Back to sign in
        </button>
        <div className="authcard__eyebrow">Create account</div>
        <h1>Request access</h1>
        <p className="authcard__sub">Set up your account - an admin assigns modules after.</p>
      </div>

      <form onSubmit={handleSignUp} className="space-y-5">
        <label className="field">
          <span className="label">Full name <span className="req">*</span></span>
          <span className="inp-wrap">
            <span className="icon-l"><Icon name="user" size={17} /></span>
            <input
              className="inp"
              type="text"
              placeholder="John Doe"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              required
            />
          </span>
        </label>

        <label className="field">
          <span className="label">Work email <span className="req">*</span></span>
          <span className="inp-wrap">
            <span className="icon-l"><Icon name="mail" size={17} /></span>
            <input
              className="inp"
              type="email"
              placeholder="john@firstmobital.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </span>
        </label>

        <label className="field">
          <span className="label">Phone (optional)</span>
          <span className="inp-wrap">
            <span className="icon-l"><Icon name="phone" size={17} /></span>
            <input
              className="inp"
              type="tel"
              placeholder="9876543210 (10 digits)"
              value={phone}
              onChange={e => {
                const digitsOnly = e.target.value.replace(/\D/g, '')
                setPhone(digitsOnly.slice(0, 10))
              }}
            />
          </span>
        </label>

        <div className="field">
          <span className="label" style={{ display: 'block', marginBottom: 9 }}>Which role do you need?</span>
          <div className="roles">
            {ROLE_OPTS.map(role => (
              <button
                key={role.id}
                type="button"
                className={`rolepick ${selectedRole === role.id ? 'sel' : ''}`}
                onClick={() => setSelectedRole(role.id)}
              >
                <span className="ic"><Icon name={role.icon} size={16} /></span>
                <span>
                  <b>{role.label}</b>
                </span>
              </button>
            ))}
          </div>
        </div>

        <label className="field" style={{ marginBottom: 8 }}>
          <span className="label">Password <span className="req">*</span></span>
          <span className="inp-wrap">
            <span className="icon-l"><Icon name="lock" size={17} /></span>
            <input
              className="inp"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••••••"
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

        <div className="pwbar">
          {[0, 1, 2, 3].map((i) => {
            const color = pwScore <= 1 ? 'var(--danger)' : pwScore === 2 ? 'var(--warn)' : pwScore === 3 ? '#3B82F6' : 'var(--success)'
            return <i key={i} style={{ background: i < pwScore ? color : undefined }} />
          })}
        </div>
        <ul className="pwreq">
          {PW_RULES.map((rule) => (
            <li key={rule.id} className={rule.test(password) ? 'ok' : ''}>
              <Icon name="checksm" size={13} strokeWidth={2.6} style={{ opacity: rule.test(password) ? 1 : 0.4 }} />
              {rule.label}
            </li>
          ))}
        </ul>

        {error && (
          <div className="alert alert--err">
            <Icon name="alert" size={17} />
            <span>{error}</span>
          </div>
        )}

        <button className="btn btn--primary btn--block" type="submit" disabled={loading || pwScore < 4 || !selectedRole}>
          {loading ? 'Submitting…' : <>Request access <Icon name="arrowr" size={17} /></>}
        </button>
      </form>

      <p className="authcard__foot">Already have an account? <button type="button" className="linkbtn" onClick={onSwitchToLogin}>Sign in</button></p>
    </AuthShell>
  )
}
