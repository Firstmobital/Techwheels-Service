import { type TabType } from './BottomNav'

interface HeaderProps {
  vehicleReg?: string | null
  currentTab?: TabType
  onSelectTab?: (tab: TabType) => void
  onLogout?: () => void
}

export default function Header({ vehicleReg, currentTab, onSelectTab, onLogout }: HeaderProps) {
  const tabs: Array<{ key: TabType; label: string; icon: string }> = [
    { key: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { key: 'complaint', label: 'Report Issue', icon: '🚨' },
    { key: 'estimate', label: 'Estimates', icon: '📋' },
    { key: 'invoices', label: 'Invoices & Bills', icon: '🧾' },
    { key: 'gatepass', label: 'Gate Pass (QR)', icon: '🎟️' },
    { key: 'feedback', label: 'Feedback', icon: '⭐' },
  ]

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="header-brand">
          <div className="header-logo">🚗</div>
          <div>
            <div className="header-title">Techwheels Customer Services</div>
            <div className="header-sub">Dealership Vehicle After-Purchase Portal</div>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        {vehicleReg && onSelectTab && (
          <nav className="desktop-nav">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`desktop-nav-item ${currentTab === tab.key ? 'active' : ''}`}
                onClick={() => onSelectTab(tab.key)}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        )}

        {vehicleReg && (
          <div className="header-user-badge">
            <div className="badge-details">
              <span className="badge-caption">Active Vehicle</span>
              <span className="mono badge-vrn">{vehicleReg}</span>
            </div>
            {onLogout && (
              <button
                type="button"
                className="btn-exit"
                onClick={onLogout}
                title="Switch or exit vehicle"
              >
                Switch Vehicle
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  )
}
