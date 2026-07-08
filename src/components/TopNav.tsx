import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import type { User } from '@supabase/supabase-js'
import { Icon } from './Icon'

interface NavItem {
  to: string
  label: string
  key: string
  icon?: string
}

// Bodyshop group: these three routes collapse into one dropdown tab.
// Order in the dropdown: Repair Tracker → Bodyshop Floor → Bodyshop
const BODYSHOP_GROUP_ITEMS = [
  { to: '/bodyshop-repair', label: 'Repair Tracker', icon: 'floor' },
  { to: '/bodyshop-floor', label: 'Bodyshop Floor', icon: 'floor' },
  { to: '/bodyshop-tracker', label: 'Bodyshop', icon: 'floor' },
]
const BODYSHOP_ROUTES = new Set(BODYSHOP_GROUP_ITEMS.map(i => i.to))

interface TopNavProps {
  visibleItems: NavItem[]
  activeRoute: string
  onSignOut: () => void
  user: User | null
  isDirty?: boolean
  isAutodocRoute?: boolean
}

export function TopNav({
  visibleItems,
  activeRoute,
  onSignOut,
  user,
  isDirty = false,
  isAutodocRoute = false,
}: TopNavProps) {
  const navigate = useNavigate()
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  // Collapse the three Bodyshop routes into a single group slot.
  // The group slot appears where the first Bodyshop-family item would have been.
  const processedItems: (NavItem | { group: 'bodyshop' })[] = []
  let bodyshopGroupInserted = false
  for (const item of visibleItems) {
    if (BODYSHOP_ROUTES.has(item.to)) {
      if (!bodyshopGroupInserted) {
        processedItems.push({ group: 'bodyshop' })
        bodyshopGroupInserted = true
      }
      // Skip individual bodyshop items — they live inside the group dropdown.
    } else {
      processedItems.push(item)
    }
  }

  // Overflow: keep nav tidy when a user has many modules
  const MAX_INLINE = 6
  const inline = processedItems.length > MAX_INLINE ? processedItems.slice(0, MAX_INLINE - 1) : processedItems
  const overflow = processedItems.length > MAX_INLINE ? processedItems.slice(MAX_INLINE - 1) : []

  // Which bodyshop sub-routes are actually available for this user?
  const visibleBodyshopItems = BODYSHOP_GROUP_ITEMS.filter(g =>
    visibleItems.some(v => v.to === g.to)
  )
  const isBodyshopOverflowOpen = openMenu === 'bodyshop'

  // Close menus when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
        setMobileDrawerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const userInitials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name.split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
    : (user?.email?.[0].toUpperCase() ?? 'U')

  const dealerCode = user?.user_metadata?.dealer_code as string | undefined
  const dealerName = user?.user_metadata?.dealer_name as string | undefined

  function NavButton({ item, isActive }: { item: NavItem; isActive: boolean }) {
    return (
      <button
        onClick={() => {
          navigate(item.to)
          setOpenMenu(null)
        }}
        className={`navitem ${isActive ? 'is-active' : ''}`}
      >
        {item.icon && <span className="ic"><Icon name={item.icon} size={17} /></span>}
        {item.label}
        {item.key === 'autodoc' && isDirty && !isAutodocRoute && <span className="dirty" title="Unsaved changes" />}
      </button>
    )
  }

  return (
    <>
      {/* Utility strip */}
      <div className="util">
        <div className="util__dealer">
          <Icon name="building" size={16} style={{ color: 'var(--muted)' }} />
          <span className="nm">{dealerName || 'Techwheels'}</span>
          {dealerCode && <span className="code-badge"><Icon name="shield" size={12} />{dealerCode}</span>}
        </div>
        <div className="util__sp" />
        <button className="util__icon" title="Search (⌘K)"><Icon name="search" size={17} /></button>
        <button className="util__icon" title="Notifications"><Icon name="bell" size={17} /><span className="dot" /></button>
        <span className="util__sep" />
        <span className="util__ver" style={{ fontSize: '12.5px', color: 'var(--muted)', fontWeight: 600 }}>v1.0 · Firstmobital</span>
      </div>

      {/* Nav row */}
      <div className="nav" ref={navRef}>
        <div className="nav__brand">
          <span className="brand">
            <span className="brand__mark"><Icon name="truck" size={19} strokeWidth={2} /></span>
            <span className="brand__name">Techwheels<small>Service</small></span>
          </span>
        </div>

        {/* Mobile hamburger */}
        <button 
          className="nav__burger" 
          onClick={() => setMobileDrawerOpen(o => !o)}
          aria-label="Menu"
        >
          <Icon name={mobileDrawerOpen ? 'x' : 'menu'} size={20} />
        </button>

        {/* Horizontal nav items */}
        <nav className="nav__items">
          {inline.map((item, idx) => {
            if ('group' in item && item.group === 'bodyshop') {
              const isBodyshopActive = BODYSHOP_ROUTES.has(activeRoute)
              return (
                <div key="bodyshop-group" style={{ position: 'relative' }}>
                  <button
                    className={`navitem ${openMenu === 'bodyshop' ? 'open' : ''} ${isBodyshopActive ? 'is-active' : ''}`}
                    onClick={() => setOpenMenu(openMenu === 'bodyshop' ? null : 'bodyshop')}
                  >
                    <span className="ic"><Icon name="floor" size={17} /></span>
                    Bodyshop
                    <Icon name="chevron" size={14} className="caret" />
                  </button>
                  {openMenu === 'bodyshop' && (
                    <div className="menu">
                      <div className="menu__label">Bodyshop</div>
                      {visibleBodyshopItems.map(g => (
                        <button
                          key={g.to}
                          className={`menu__item ${activeRoute === g.to ? 'is-active' : ''}`}
                          onClick={() => { navigate(g.to); setOpenMenu(null) }}
                        >
                          {g.icon && <span className="ic"><Icon name={g.icon} size={16} /></span>}
                          {g.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            }
            const navItem = item as NavItem
            return (
              <NavButton
                key={navItem.key ?? idx}
                item={navItem}
                isActive={activeRoute === navItem.to}
              />
            )
          })}

          {/* More menu for overflow */}
          {overflow.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                className={`navitem ${openMenu === 'more' ? 'open' : ''} ${overflow.some((m) => !('group' in m) && activeRoute === (m as NavItem).to) ? 'is-active' : ''}`}
                onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
              >
                <span className="ic"><Icon name="dots" size={17} /></span>
                More
                <Icon name="chevron" size={14} className="caret" />
              </button>
              {openMenu === 'more' && (
                <div className="menu">
                  <div className="menu__label">More modules</div>
                  {overflow.map((item, idx) => {
                    if ('group' in item && item.group === 'bodyshop') {
                      const isBodyshopActive = BODYSHOP_ROUTES.has(activeRoute)
                      return (
                        <div key="bodyshop-group-overflow" style={{ position: 'relative' }}>
                          <button
                            className={`menu__item ${isBodyshopOverflowOpen ? 'open' : ''} ${isBodyshopActive ? 'is-active' : ''}`}
                            onClick={() => setOpenMenu(isBodyshopOverflowOpen ? null : 'bodyshop')}
                            style={{ justifyContent: 'space-between' }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className="ic"><Icon name="floor" size={16} /></span>
                              Bodyshop
                            </span>
                            <Icon name="chevron" size={13} />
                          </button>
                        </div>
                      )
                    }
                    const navItem = item as NavItem
                    return (
                      <button
                        key={navItem.key ?? idx}
                        className={`menu__item ${activeRoute === navItem.to ? 'is-active' : ''}`}
                        onClick={() => { navigate(navItem.to); setOpenMenu(null) }}
                      >
                        {navItem.icon && <span className="ic"><Icon name={navItem.icon} size={16} /></span>}
                        {navItem.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="nav__sp" />

        {/* User chip with dropdown */}
        <div style={{ position: 'relative' }}>
          <button 
            className="userchip" 
            onClick={() => setOpenMenu(openMenu === 'user' ? null : 'user')}
          >
            <span className="avatar">{userInitials}</span>
            <span className="ucmeta" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0, lineHeight: 1.15 }}>
              <span className="nm">{user?.user_metadata?.full_name || 'User'}</span>
              <span className="rl">Service Staff</span>
            </span>
            <Icon name="chevron" size={14} className="ucmeta" style={{ color: 'var(--faint)' }} />
          </button>
          {openMenu === 'user' && (
            <div className="menu" style={{ right: 0, minWidth: 248 }}>
              <div style={{ padding: '8px 10px 10px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="avatar" style={{ width: 36, height: 36 }}>{userInitials}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13.5px', fontWeight: 700 }}>{user?.user_metadata?.full_name || 'User'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
                </div>
              </div>
              <div className="menu__sep" />
              <button className="menu__item"><span className="ic"><Icon name="user" size={16} /></span>Your profile</button>
              <button className="menu__item"><span className="ic"><Icon name="building" size={16} /></span>{dealerName || 'Dealer'}</button>
              <button className="menu__item"><span className="ic"><Icon name="settings" size={16} /></span>Preferences</button>
              <div className="menu__sep" />
              <button 
                className="menu__item" 
                onClick={onSignOut}
                style={{ color: 'var(--danger)' }}
              >
                <span className="ic" style={{ color: 'var(--danger)' }}><Icon name="signout" size={16} /></span>Sign out
              </button>
            </div>
          )}
        </div>

        {/* Mobile drawer */}
        <div className={`nav__drawer${mobileDrawerOpen ? ' open' : ''}`}>
          {visibleItems.map(item => (
            <button
              key={item.key}
              className={`navdrawer__item ${activeRoute === item.to ? 'is-active' : ''}`}
              onClick={() => {
                navigate(item.to)
                setMobileDrawerOpen(false)
              }}
            >
              {item.icon && <span className="ic"><Icon name={item.icon} size={18} /></span>}
              {item.label}
              {item.key === 'autodoc' && isDirty && !isAutodocRoute && <span className="dirty" style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
