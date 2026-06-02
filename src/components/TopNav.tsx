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

  // Overflow: keep nav tidy when a user has many modules
  const MAX_INLINE = 6
  const inline = visibleItems.length > MAX_INLINE ? visibleItems.slice(0, MAX_INLINE - 1) : visibleItems
  const overflow = visibleItems.length > MAX_INLINE ? visibleItems.slice(MAX_INLINE - 1) : []

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
          {inline.map(item => (
            <NavButton 
              key={item.key} 
              item={item} 
              isActive={activeRoute === item.to}
            />
          ))}

          {/* More menu for overflow */}
          {overflow.length > 0 && (
            <div style={{ position: 'relative' }}>
              <button
                className={`navitem ${openMenu === 'more' ? 'open' : ''} ${overflow.some((m) => activeRoute === m.to) ? 'is-active' : ''}`}
                onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
              >
                <span className="ic"><Icon name="dots" size={17} /></span>
                More
                <Icon name="chevron" size={14} className="caret" />
              </button>
              {openMenu === 'more' && (
                <div className="menu">
                  <div className="menu__label">More modules</div>
                  {overflow.map(item => (
                    <button
                      key={item.key}
                      className={`menu__item ${activeRoute === item.to ? 'is-active' : ''}`}
                      onClick={() => {
                        navigate(item.to)
                        setOpenMenu(null)
                      }}
                    >
                      {item.icon && <span className="ic"><Icon name={item.icon} size={16} /></span>}
                      {item.label}
                    </button>
                  ))}
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
