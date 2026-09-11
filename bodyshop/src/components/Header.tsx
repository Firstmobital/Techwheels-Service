interface HeaderProps {
  vehicleReg?: string | null
  onLogout?: () => void
}

export default function Header({ vehicleReg, onLogout }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-logo">🚗</div>
        <div>
          <div className="header-title">Bodyshop & Services</div>
          <div className="header-sub">Techwheels Customer Portal</div>
        </div>
      </div>
      {vehicleReg && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="mono"
            style={{
              fontSize: 12,
              fontWeight: 700,
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              padding: '3px 8px',
              borderRadius: 6,
            }}
          >
            {vehicleReg}
          </span>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}
              title="Change vehicle"
            >
              Exit
            </button>
          )}
        </div>
      )}
    </header>
  )
}
