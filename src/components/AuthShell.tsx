import { Icon } from './Icon'

interface Feature {
  icon: string
  t: string // title
  m: string // message/description
}

interface Pitch {
  title: string
  body: string
  features: Feature[]
}

interface AuthShellProps {
  pitch: Pitch
  children: React.ReactNode
}

export function AuthShell({ pitch, children }: AuthShellProps) {
  return (
    <div className="auth">
      {/* Left sidebar with pitch and features */}
      <aside className="auth__aside">
        <div className="auth__brandrow">
          <span className="brand">
            <span className="brand__mark"><Icon name="truck" size={24} strokeWidth={2} /></span>
            <span className="brand__name">Techwheels<small>Service</small></span>
          </span>
        </div>

        <div className="auth__pitch">
          <h2>{pitch.title}</h2>
          <p>{pitch.body}</p>
        </div>

        <div className="auth__features">
          {pitch.features.map((f, i) => (
            <div className="auth__feature" key={i}>
              <span className="tick"><Icon name={f.icon} size={15} strokeWidth={2} /></span>
              <div>
                <b>{f.t}</b>
                <span>{f.m}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Right side with scrollable card */}
      <main className="auth__main scroll">
        <div className="authcard">
          {children}
        </div>
      </main>
    </div>
  )
}
