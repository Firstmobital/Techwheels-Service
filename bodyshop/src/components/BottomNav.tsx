export type TabType = 'dashboard' | 'booking' | 'invoices' | 'feedback'

interface BottomNavProps {
  currentTab: TabType
  onSelectTab: (tab: TabType) => void
}

export default function BottomNav({ currentTab, onSelectTab }: BottomNavProps) {
  const tabs: Array<{ key: TabType; label: string; icon: string }> = [
    { key: 'dashboard', label: 'Home', icon: '🏠' },
    { key: 'booking', label: 'Book Service', icon: '📅' },
    { key: 'invoices', label: 'Bills', icon: '📄' },
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
            <span style={{ fontSize: 19 }}>{tab.icon}</span>
          </div>
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
