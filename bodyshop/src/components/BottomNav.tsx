export type TabType = 'dashboard' | 'complaint' | 'estimate' | 'invoices' | 'gatepass' | 'feedback'

interface BottomNavProps {
  currentTab: TabType
  onSelectTab: (tab: TabType) => void
}

export default function BottomNav({ currentTab, onSelectTab }: BottomNavProps) {
  const tabs: Array<{ key: TabType; label: string; icon: string }> = [
    { key: 'dashboard', label: 'Home', icon: '🏠' },
    { key: 'complaint', label: 'Problem', icon: '🚨' },
    { key: 'estimate', label: 'Estimate', icon: '📋' },
    { key: 'invoices', label: 'Bills', icon: '🧾' },
    { key: 'gatepass', label: 'Gate Pass', icon: '🎟️' },
    { key: 'feedback', label: 'Feedback', icon: '⭐' },
  ]

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`nav-item ${currentTab === tab.key ? 'active' : ''}`}
          onClick={() => onSelectTab(tab.key)}
        >
          <div className="nav-icon-wrap">
            <span style={{ fontSize: 18 }}>{tab.icon}</span>
          </div>
          <span style={{ fontSize: 10.5 }}>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
