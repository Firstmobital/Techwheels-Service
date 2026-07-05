import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import ImportPage from './pages/ImportPage'
import DashboardPage from './pages/DashboardPage'
import ReportsPage from './pages/ReportsPage.tsx'
import { REPORT_CATEGORIES } from './pages/reports'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import AuthCallback from './pages/AuthCallback'
import PasswordUpdatePage from './pages/PasswordUpdatePage'
import AutoDocPage from './pages/AutoDocPage'
import JobCardPage from './pages/JobCardPage'
import ReceptionPage from './pages/ReceptionPage'
import ServiceAdvisorPage from './pages/ServiceAdvisorPage'
import SATrackerPage from './pages/SATrackerPage'
import BodyshopTrackerPage from './pages/BodyshopTrackerPage'
import BodyshopFloorPage from './pages/BodyshopFloorPage'
import BodyshopRepairPage from './pages/BodyshopRepairPage'
import FloorInchargePage from './pages/FloorInchargePage'
import TechnicianPage from './pages/TechnicianPage'
import CREIncentivePage from './pages/CREIncentivePage'
import { Icon } from './components/Icon'
import ComplaintsPage from './pages/ComplaintsPage'
import ComplaintPortalPage from './pages/ComplaintPortalPage'
import {
  getUnreadComplaintNotificationCount,
  listMyComplaintNotifications,
  markAllComplaintNotificationsRead,
  markComplaintNotificationRead,
  type InAppComplaintNotification,
} from './lib/api/complaints'
import EWReminderPage from './pages/EWReminderPage'
import ServiceBookingPage from './pages/ServiceBookingPage'
import WAAgentPage from './pages/WAAgentPage'
import TelecallingPage from './pages/TelecallingPage'
import WhatsAppAutomationsPage from './pages/WhatsAppAutomationsPage'
import PostServiceFeedbackCREPage from './pages/PostServiceFeedbackCREPage'
import PartsSPMDashboardPage from './pages/PartsSPMDashboardPage'
import VerifyScreenPreview from './pages/VerifyScreenPreview'
import { hasSupabaseEnv, supabase } from './lib/supabase'
import { getDealerScopeContext } from './lib/api/auth'
import { DirtyProvider, useDirty } from './context/DirtyContext'
import { useOnline } from './hooks/useOnline'
import type { User } from '@supabase/supabase-js'

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/reception', label: 'Reception', icon: 'reception' },
  { to: '/service-advisor', label: 'Service Advisor', icon: 'admin' },
  { to: '/floor-incharge', label: 'Floor Incharge', icon: 'floor' },
  { to: '/sa-tracker', label: 'SA Tracker', icon: 'user' },
  { to: '/bodyshop-tracker', label: 'Bodyshop', icon: 'floor' },
  { to: '/bodyshop-floor', label: 'Bodyshop Floor', icon: 'floor' },
  { to: '/technician', label: 'Technician', icon: 'tech' },
  { to: '/import', label: 'Imports', icon: 'import' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/autodoc', label: 'AutoDoc', icon: 'autodoc' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/admin', label: 'Admin', icon: 'admin' },

  { to: '/complaints', label: 'Complaints', icon: 'complaints' },
  { to: '/bodyshop-repair', label: 'Repair Tracker', icon: 'floor' },
  { to: '/ew-reminder', label: 'EW Reminder', icon: 'shield' },
  { to: '/service-booking', label: 'Service Booking', icon: 'calendar' },
  { to: '/wa-agent', label: 'WA AI Agent', icon: 'message-circle' },
  { to: '/telecalling', label: 'Telecalling', icon: 'phone' },
  { to: '/auto-service-reminder', label: 'WA Automations', icon: 'bell' },
  { to: '/cre-incentive', label: 'CRE Incentive', icon: 'reports' },
  { to: '/post-service-feedback', label: 'Post Service Feedback', icon: 'message-circle' },
  // Kept at the end of the list on purpose so it always lands in the "More modules"
  // overflow menu (per request) rather than the main inline nav row.
  { to: '/parts-spm', label: 'Parts SPM Dashboard', icon: 'truck' },
]
type ModuleName =
  | 'job_cards'
  | 'invoices'
  | 'parts_inventory'
  | 'parts_orders'
  | 'parts_consumption'
  | 'employees'
  | 'reports'
  | 'admin'
  | 'autodoc'
  | 'reception'
  | 'service_advisor'
  | 'floor_incharge'
  | 'sa_tracker'
  | 'bodyshop_tracker'
  | 'bodyshop_floor'
  | 'technician'
  | 'complaints'
  | 'bodyshop_repair'
  | 'ew_reminder'
  | 'service_booking'
  | 'wa_agent'
  | 'telecalling'
  | 'auto_service_reminder'
  | 'cre_incentive'
  | 'post_service_feedback_cre'
  | 'parts_spm'

type AppRoute = '/import' | '/reports' | '/settings' | '/admin' | '/autodoc' | '/reception' | '/service-advisor' | '/floor-incharge' | '/sa-tracker' | '/bodyshop-tracker' | '/bodyshop-floor' | '/technician' | '/complaints' | '/bodyshop-repair' | '/ew-reminder' | '/service-booking' | '/wa-agent' | '/telecalling' | '/auto-service-reminder' | '/cre-incentive' | '/post-service-feedback' | '/parts-spm'

interface PermissionRow {
  module_name: string
}

const ROUTE_MODULE_MAP: Record<AppRoute, ModuleName[]> = {
  '/import': ['job_cards'],
  '/reports': ['reports'],
  '/settings': ['employees'],
  '/admin': ['admin'],
  '/autodoc': ['autodoc'],
  '/reception': ['reception'],
  '/service-advisor': ['service_advisor'],
  '/floor-incharge': ['floor_incharge'],
  '/sa-tracker': ['sa_tracker'],
  '/bodyshop-tracker': ['bodyshop_tracker'],
  '/bodyshop-floor': ['bodyshop_floor'],
  '/technician': ['technician'],
  '/complaints': ['complaints'],
  '/bodyshop-repair': ['bodyshop_repair'],
  '/ew-reminder': ['ew_reminder'],
  '/service-booking': ['service_booking'],
  '/wa-agent': ['wa_agent'],
  '/telecalling': ['telecalling'],
  '/auto-service-reminder': ['auto_service_reminder'],
  '/cre-incentive': ['cre_incentive'],
  '/post-service-feedback': ['post_service_feedback_cre'],
  '/parts-spm': ['parts_spm'],
}

type NavItem = {
  to: AppRoute
  label: string
  icon: string
}

const HOME_ROUTE = '/home'

function isPublicAuthPath(pathname: string): boolean {
  return pathname === '/' || pathname === '/signup' || pathname === '/forgot-password' || pathname === '/auth/callback' || pathname.startsWith('/c/')
}

function isNavItemActive(pathname: string, route: AppRoute) {
  if (route === '/reports') return pathname.startsWith('/reports')
  return pathname === route || pathname.startsWith(`${route}/`)
}

function TopNav({
  visibleItems,
  pathname,
  onNavigate,
  onSignOut,
  user,
  isDirty,
  effectiveDealerCode,
  effectiveDealerName,
  impersonating,
  onStopImpersonating,
}: {
  visibleItems: NavItem[]
  pathname: string
  onNavigate: (to: string) => void
  onSignOut: () => void
  user: User | null
  isDirty: boolean
  effectiveDealerCode: string | null
  effectiveDealerName: string | null
  impersonating?: { id: string; email: string; name: string } | null
  onStopImpersonating?: () => void
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [notificationRows, setNotificationRows] = useState<InAppComplaintNotification[]>([])
  const [notificationLoading, setNotificationLoading] = useState(false)
  const [notificationUnread, setNotificationUnread] = useState(0)
  const [windowWidth, setWindowWidth] = useState<number>(
    typeof window !== 'undefined' ? window.innerWidth : 1440,
  )
  const navRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpen(null)
        setMobileDrawerOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const refreshNotificationCount = async () => {
    if (!user) {
      setNotificationUnread(0)
      return
    }
    try {
      const count = await getUnreadComplaintNotificationCount()
      setNotificationUnread(count)
    } catch {
      // Keep header resilient even if notifications endpoint is unavailable.
      setNotificationUnread(0)
    }
  }

  const loadNotifications = async () => {
    if (!user) {
      setNotificationRows([])
      return
    }
    setNotificationLoading(true)
    try {
      const rows = await listMyComplaintNotifications(8, 0, false)
      setNotificationRows(rows)
    } catch {
      setNotificationRows([])
    } finally {
      setNotificationLoading(false)
    }
  }

  useEffect(() => {
    void refreshNotificationCount()

    const intervalId = window.setInterval(() => {
      void refreshNotificationCount()
    }, 30000)

    return () => window.clearInterval(intervalId)
  }, [user?.id])

  useEffect(() => {
    if (open !== 'notifications') return
    void loadNotifications()
    void refreshNotificationCount()
  }, [open, user?.id])

  const notificationEventLabel = (eventType: string): string => {
    const map: Record<string, string> = {
      raised: 'Complaint raised',
      acknowledged: 'Complaint acknowledged',
      in_progress: 'Complaint in progress',
      resolved: 'Complaint resolved',
      closed: 'Complaint closed',
      escalated: 'Complaint escalated',
      reopened: 'Complaint reopened',
      reassigned: 'Complaint reassigned',
    }
    return map[eventType] || eventType.replaceAll('_', ' ')
  }

  const openNotification = async (row: InAppComplaintNotification) => {
    try {
      if (!row.read_at) {
        await markComplaintNotificationRead(Number(row.id))
      }
    } catch {
      // Navigation should still proceed even if mark-read fails.
    }

    setNotificationRows((prev) => prev.map((item) => (
      item.id === row.id
        ? { ...item, read_at: item.read_at || new Date().toISOString(), seen_at: item.seen_at || new Date().toISOString() }
        : item
    )))
    setNotificationUnread((prev) => Math.max(0, prev - (row.read_at ? 0 : 1)))
    onNavigate('/complaints')
    setOpen(null)
  }

  const markAllNotificationsRead = async () => {
    try {
      await markAllComplaintNotificationsRead()
      setNotificationRows((prev) => prev.map((item) => ({
        ...item,
        read_at: item.read_at || new Date().toISOString(),
        seen_at: item.seen_at || new Date().toISOString(),
      })))
      setNotificationUnread(0)
    } catch {
      // no-op
    }
  }

  useEffect(() => {
    function handleResize() {
      setWindowWidth(window.innerWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const maxInlineItems = useMemo(() => {
    if (windowWidth >= 1700) return 8
    if (windowWidth >= 1520) return 7
    if (windowWidth >= 1360) return 6
    if (windowWidth >= 1240) return 5
    return 4
  }, [windowWidth])

  const inlineItems = visibleItems.slice(0, maxInlineItems)
  const overflowItems = visibleItems.slice(maxInlineItems)

  const userName = user?.user_metadata?.full_name || user?.email || 'User'
  const userEmail = user?.email || ''
  const userInitials = userName
    .split(/\s+/)
    .map((part: string) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const dealerName = effectiveDealerName || 'No dealer assigned'
  const dealerCode = effectiveDealerCode || 'NO-DEALER'

  const resolveNavTarget = (to: string) => {
    if (to === '/reports') return '/reports/labour-revenue/service-type-labour-revenue'
    return to
  }

  const navToReportsCategory = (categoryId: string) => onNavigate(`/reports/${categoryId}`)

  function renderNavItem(item: NavItem) {
    const active = isNavItemActive(pathname, item.to)
    const hasMenu = item.to === '/reports'

    return (
      <div key={item.to} className="navrel">
        <button
          type="button"
          className={[`navitem`, active ? 'is-active' : '', open === item.to ? 'open' : ''].join(' ').trim()}
          onClick={() => {
            if (!hasMenu) {
              onNavigate(resolveNavTarget(item.to))
              setOpen(null)
              return
            }
            setOpen(open === item.to ? null : item.to)
          }}
        >
          <span className="ic"><Icon name={item.icon} size={17} strokeWidth={1.7} /></span>
          {item.label}
          {item.to === '/autodoc' && isDirty && <span className="dirty" title="Unsaved changes" />}
          {hasMenu && <Icon name="chevron" size={14} strokeWidth={1.9} className="caret" />}
        </button>

        {hasMenu && open === item.to && (
          <div className="menu menu--left">
            <div className="menu__label">Reports categories</div>
            {REPORT_CATEGORIES.map((category, idx) => (
              <button
                key={category.id}
                type="button"
                className={[`menu__item`, pathname.startsWith(`/reports/${category.id}`) ? 'is-active' : ''].join(' ').trim()}
                onClick={() => {
                  navToReportsCategory(category.id)
                  setOpen(null)
                }}
              >
                <span className="num">{idx + 1}</span>
                {category.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const overflowActive = overflowItems.some((item) => isNavItemActive(pathname, item.to))
  const homeActive = pathname === '/' || pathname.startsWith('/home')

  return (
    <>
    <div ref={navRef}>
      <div className="util">
        <div className="util__dealer">
          <Icon name="building" size={16} strokeWidth={1.7} className="util__ic-muted" />
          <span className="nm">{dealerName}</span>
          <span className="code-badge">
            <Icon name="shield" size={12} strokeWidth={2} />
            {dealerCode}
          </span>
        </div>
        <div className="util__sp" />
        <button type="button" className="util__icon" title="Search">
          <Icon name="search" size={17} strokeWidth={1.9} />
        </button>
        <div className="navrel">
          <button
            type="button"
            className="util__icon"
            title="Notifications"
            onClick={() => setOpen(open === 'notifications' ? null : 'notifications')}
          >
            <Icon name="bell" size={17} strokeWidth={1.9} />
            {notificationUnread > 0 && (
              <>
                <span className="dot" />
                <span className="dot-count">{notificationUnread > 9 ? '9+' : notificationUnread}</span>
              </>
            )}
          </button>

          {open === 'notifications' && (
            <div className="menu menu--right-wide util__menu">
              <div className="menu__label">Notifications</div>

              {notificationLoading && (
                <div className="menu__notif-empty">Loading notifications...</div>
              )}

              {!notificationLoading && notificationRows.length === 0 && (
                <div className="menu__notif-empty">No new notifications</div>
              )}

              {!notificationLoading && notificationRows.map((row) => {
                const payloadTicket = String((row.payload as Record<string, unknown> | null)?.ticket_number ?? '').trim()
                const when = new Date(row.created_at).toLocaleString()

                return (
                  <button
                    key={row.id}
                    type="button"
                    className={[`menu__item`, `menu__notif-item`, !row.read_at ? 'is-active' : ''].join(' ').trim()}
                    onClick={() => void openNotification(row)}
                  >
                    <span className="ic"><Icon name="bell" size={15} strokeWidth={1.9} /></span>
                    <span className="menu__notif-main">
                      <span className="menu__notif-title">{notificationEventLabel(row.event_type)}</span>
                      <span className="menu__notif-sub">{payloadTicket || 'Complaint update'}</span>
                      <span className="menu__notif-time">{when}</span>
                    </span>
                  </button>
                )
              })}

              {notificationRows.length > 0 && (
                <>
                  <div className="menu__sep" />
                  <button type="button" className="menu__item" onClick={() => void markAllNotificationsRead()}>
                    <span className="ic"><Icon name="check" size={15} strokeWidth={2} /></span>
                    Mark all as read
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <span className="util__sep" />
        <span className="util__ver">v1.0 · Firstmobital</span>
      </div>

      <div className="nav">
        <div className="nav__brand">
          <span className="brand">
            <span className="brand__mark"><Icon name="truck" size={19} strokeWidth={2} /></span>
            <span className="brand__name">Techwheels<small>Service</small></span>
          </span>
        </div>

        <button
          type="button"
          className="nav__burger"
          onClick={() => setMobileDrawerOpen((prev) => !prev)}
          aria-label="Toggle menu"
        >
          <Icon name={mobileDrawerOpen ? 'x' : 'menu'} size={20} strokeWidth={2} />
        </button>

        <nav className="nav__items">
          <button
            type="button"
            className={[`navitem`, homeActive ? 'is-active' : ''].join(' ').trim()}
            onClick={() => {
              onNavigate(HOME_ROUTE)
              setOpen(null)
            }}
          >
            <span className="ic"><Icon name="grid" size={17} strokeWidth={1.7} /></span>
            Home
          </button>

          {inlineItems.map((item) => renderNavItem(item))}

          {overflowItems.length > 0 && (
            <div className="navrel">
              <button
                type="button"
                className={[`navitem`, open === 'more' ? 'open' : '', overflowActive ? 'is-active' : ''].join(' ').trim()}
                onClick={() => setOpen(open === 'more' ? null : 'more')}
              >
                <span className="ic"><Icon name="dots" size={17} strokeWidth={1.9} /></span>
                More
                <Icon name="chevron" size={14} strokeWidth={1.9} className="caret" />
              </button>
              {open === 'more' && (
                <div className="menu menu--left">
                  <div className="menu__label">More modules</div>
                  {overflowItems.map((item) => (
                    <button
                      key={item.to}
                      type="button"
                      className={[`menu__item`, isNavItemActive(pathname, item.to) ? 'is-active' : ''].join(' ').trim()}
                      onClick={() => {
                        onNavigate(resolveNavTarget(item.to))
                        setOpen(null)
                      }}
                    >
                      <span className="ic"><Icon name={item.icon} size={16} strokeWidth={1.9} /></span>
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="nav__sp" />

        <div className="navrel">
          <button type="button" className="userchip" onClick={() => setOpen(open === 'user' ? null : 'user')}>
            <span className="avatar">{userInitials || 'U'}</span>
            <span className="ucmeta userchip__meta">
              <span className="nm userchip__nm-nowrap">{userName}</span>
              <span className="rl userchip__rl-nowrap">{dealerCode}</span>
            </span>
            <Icon name="chevron" size={14} strokeWidth={1.9} className="ucmeta userchip__caret" />
          </button>

          {open === 'user' && (
            <div className="menu menu--right-wide">
              <div className="menu__user-head">
                <span className="avatar avatar--lg">{userInitials || 'U'}</span>
                <div className="menu__user-meta">
                  <div className="menu__user-name">{userName}</div>
                  <div className="menu__user-email">{userEmail}</div>
                </div>
              </div>
              <div className="menu__sep" />
              <button type="button" className="menu__item">
                <span className="ic"><Icon name="user" size={16} strokeWidth={1.9} /></span>
                Your profile
              </button>
              <button type="button" className="menu__item">
                <span className="ic"><Icon name="building" size={16} strokeWidth={1.9} /></span>
                {dealerName}
              </button>
              <button type="button" className="menu__item">
                <span className="ic"><Icon name="settings" size={16} strokeWidth={1.9} /></span>
                Preferences
              </button>
              <div className="menu__sep" />
              <button type="button" className="menu__item menu__item--danger" onClick={onSignOut}>
                <span className="ic"><Icon name="signout" size={16} strokeWidth={2} /></span>
                Sign out
              </button>
            </div>
          )}
        </div>

        <div className={['nav__drawer', mobileDrawerOpen ? 'open' : ''].join(' ').trim()}>
          <button
            type="button"
            className={[`navdrawer__item`, homeActive ? 'is-active' : ''].join(' ').trim()}
            onClick={() => {
              onNavigate(HOME_ROUTE)
              setMobileDrawerOpen(false)
              setOpen(null)
            }}
          >
            <span className="ic"><Icon name="grid" size={18} strokeWidth={1.9} /></span>
            Home
          </button>

          {visibleItems.map((item) => (
            <button
              key={item.to}
              type="button"
              className={[`navdrawer__item`, isNavItemActive(pathname, item.to) ? 'is-active' : ''].join(' ').trim()}
              onClick={() => {
                onNavigate(resolveNavTarget(item.to))
                setMobileDrawerOpen(false)
                setOpen(null)
              }}
            >
              <span className="ic"><Icon name={item.icon} size={18} strokeWidth={1.9} /></span>
              {item.label}
              {item.to === '/autodoc' && isDirty && <span className="dirty dirty--end" />}
            </button>
          ))}
        </div>
      </div>
    </div>

    {/* ── Impersonation Banner ── */}
    {impersonating && (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: 'linear-gradient(90deg, #b45309 0%, #d97706 100%)',
        color: '#fff', display: 'flex', alignItems: 'center',
        gap: '0.75rem', padding: '0.45rem 1.25rem',
        fontSize: '0.8rem', fontWeight: 600, boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
      }}>
        <span style={{ fontSize: '1rem' }}>👁</span>
        <span>
          Viewing as&nbsp;<strong>{impersonating.name || impersonating.email}</strong>
          <span style={{ marginLeft: 8, opacity: 0.8, fontWeight: 400 }}>({impersonating.email})</span>
          <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 400 }}>— you see exactly what this user sees</span>
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onStopImpersonating}
          style={{
            background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.4)',
            color: '#fff', borderRadius: 6, padding: '0.28rem 0.9rem',
            fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          ✕ Exit · Back to Admin
        </button>
      </div>
    )}
    </>
  )
}

function hasAnyModuleAccess(allowedModules: Set<string>, modules: readonly ModuleName[]) {
  return modules.some((moduleName) => allowedModules.has(moduleName))
}

function canAccessPath(pathname: string, allowedModules: Set<string>) {
  if (pathname === '/') return true
  if (pathname.startsWith('/home')) return true
  if (pathname.startsWith('/reports')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/reports'])
  if (pathname.startsWith('/import')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/import'])
  if (pathname.startsWith('/settings')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/settings'])
  if (pathname.startsWith('/admin')) return true // Admin always reachable (incl. during impersonation)
  if (pathname.startsWith('/autodoc')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/autodoc'])
  if (pathname.startsWith('/reception')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/reception'])
  if (pathname.startsWith('/service-advisor')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/service-advisor'])
  if (pathname.startsWith('/floor-incharge')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/floor-incharge'])
  if (pathname.startsWith('/sa-tracker')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/sa-tracker'])
  if (pathname.startsWith('/bodyshop-tracker')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/bodyshop-tracker'])
  if (pathname.startsWith('/bodyshop-floor')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/bodyshop-floor'])
  if (pathname.startsWith('/technician')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/technician'])
  if (pathname.startsWith('/complaints')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/complaints'])
  if (pathname.startsWith('/bodyshop-repair')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/bodyshop-repair'])
  if (pathname.startsWith('/ew-reminder')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/ew-reminder'])
  if (pathname.startsWith('/service-booking')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/service-booking'])
  if (pathname.startsWith('/wa-agent')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/wa-agent'])
  if (pathname.startsWith('/telecalling')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/telecalling'])
  if (pathname.startsWith('/auto-service-reminder')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/auto-service-reminder'])
  if (pathname.startsWith('/cre-incentive')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/cre-incentive'])
  if (pathname.startsWith('/post-service-feedback')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/post-service-feedback'])
  if (pathname.startsWith('/c/')) return true
  if (pathname.startsWith('/reset-password') || pathname.startsWith('/auth/callback') || pathname.startsWith('/forgot-password')) return true
  return false
}

function getDefaultRoute(allowedModules: Set<string>): AppRoute | null {
  const preferenceOrder: AppRoute[] = ['/import', '/reception', '/service-advisor', '/floor-incharge', '/technician', '/reports', '/telecalling', '/settings', '/autodoc', '/admin']
  return preferenceOrder.find((route) => hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP[route]))
    ?? (NAV_ITEMS as NavItem[]).find((item) => hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP[item.to]))?.to
    ?? null
}

const ALL_ROUTE_MODULES: ModuleName[] = Array.from(
  new Set(
    (Object.values(ROUTE_MODULE_MAP) as ModuleName[][]).flat(),
  ),
)

function AccessDenied() {
  return (
    <div className="page access-denied">
      <div className="card access-denied__card">
        <div className="card__head">
          <div className="access-denied__head">
            <span className="access-denied__icon"><Icon name="alert" size={20} strokeWidth={1.7} /></span>
            <div>
              <h3>Module access required</h3>
              <div className="sub">Your account is active, but no modules are currently assigned to your role.</div>
            </div>
          </div>
        </div>
        <div className="card__body">
          <p className="access-denied__copy">Contact your administrator to request access to:</p>
          <ul className="access-denied__list">
            <li><strong>Job Cards</strong> - Create and manage service jobs</li>
            <li><strong>Reports</strong> - View cross-module analytics and dashboards</li>
            <li><strong>Employees</strong> - Manage employee master data</li>
            <li><strong>AutoDoc</strong> - Build vehicle documentation and estimates</li>
            <li><strong>Reception</strong> - Capture front-desk intake entries</li>
            <li><strong>Service Advisor</strong> - Work only assigned intake rows</li>
            <li><strong>Floor Incharge</strong> - Assign technicians to open job cards</li>
            <li><strong>Technician</strong> - View assigned rows and day-wise income tracker</li>
          </ul>
          <div className="note note--info access-denied__note">
            <span className="ic"><Icon name="alert" size={16} /></span>
            <div>If you believe this is a mistake, ask your administrator to verify module assignments in Admin.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RequireAccess({
  allowedModules,
  modules,
  children,
}: {
  allowedModules: Set<string>
  modules: readonly ModuleName[]
  children: React.ReactNode
}) {
  if (!hasAnyModuleAccess(allowedModules, modules)) {
    return <AccessDenied />
  }
  return <>{children}</>
}

// ─── Auth wrapper ─────────────────────────────────────────────────────────────

function AuthGate({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [authView, setAuthView] = useState<'login' | 'signup' | 'forgot'>('login')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user ?? null
      setUser((prev) => (prev?.id === nextUser?.id ? prev : nextUser))
      // Keep current module route on tab focus/session refresh.
      if (event === 'SIGNED_IN' && nextUser && isPublicAuthPath(location.pathname)) {
        navigate(HOME_ROUTE, { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [location.pathname, navigate])

  useEffect(() => {
    if (user) return
    if (location.pathname === '/forgot-password') {
      setAuthView('forgot')
      return
    }
    if (location.pathname === '/signup') {
      setAuthView('signup')
      return
    }
    setAuthView('login')
  }, [location.pathname, user])

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    )
  }
  if (!user) {
    if (authView === 'forgot') {
      return (
        <ForgotPasswordPage
          onSwitchToLogin={() => {
            setAuthView('login')
            navigate('/', { replace: true })
          }}
        />
      )
    }

    if (authView === 'signup') {
      return (
        <SignUpPage
          onSwitchToLogin={() => {
            setAuthView('login')
            navigate('/', { replace: true })
          }}
        />
      )
    }

    return (
      <LoginPage
        onSwitchToSignUp={() => {
          setAuthView('signup')
          navigate('/signup', { replace: true })
        }}
        onSwitchToForgot={() => {
          setAuthView('forgot')
          navigate('/forgot-password', { replace: true })
        }}
      />
    )
  }

  const mustChangePassword = Boolean(user.user_metadata?.force_password_change)
  const onResetPasswordPage = location.pathname === '/reset-password'

  if (mustChangePassword && !onResetPasswordPage) {
    return <Navigate to="/reset-password" replace />
  }

  return <>{children}</>
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <DirtyProvider>
      <AppInner />
    </DirtyProvider>
  )
}

function AppInner() {
  const location       = useLocation()
  const navigate       = useNavigate()
  const online         = useOnline()
  const { isDirty }    = useDirty()
  const [user,          setUser]          = useState<User | null>(null)
  const [effectiveDealerCode, setEffectiveDealerCode] = useState<string | null>(null)
  const [effectiveDealerName, setEffectiveDealerName] = useState<string | null>(null)
  const [allowedModules, setAllowedModules] = useState<Set<string>>(new Set())
  const [permissionsLoading, setPermissionsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  // ── Impersonation (View-as-user) ─────────────────────────────────────────
  const [impersonating, setImpersonating] = useState<{ id: string; email: string; name: string } | null>(() => {
    try { return JSON.parse(localStorage.getItem('tw_impersonate') || 'null') } catch { return null }
  })

  const startImpersonating = (id: string, email: string, name: string) => {
    const data = { id, email, name }
    localStorage.setItem('tw_impersonate', JSON.stringify(data))
    setImpersonating(data)
  }

  const stopImpersonating = () => {
    localStorage.removeItem('tw_impersonate')
    setImpersonating(null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const nextUser = session?.user ?? null
      setUser((prev) => (prev?.id === nextUser?.id ? prev : nextUser))
    })
    return () => subscription.unsubscribe()
  }, [])

  const userId = user?.id ?? null

  useEffect(() => {
    let mounted = true

    async function loadDealerContext() {
      if (!userId) {
        if (mounted) {
          setEffectiveDealerCode(null)
          setEffectiveDealerName(null)
        }
        return
      }

      const resolved = await getDealerScopeContext()
      if (!mounted) return

      if (resolved.data) {
        setEffectiveDealerCode(resolved.data.dealerCode)
        setEffectiveDealerName(resolved.data.dealerName)
      } else {
        setEffectiveDealerCode(null)
        setEffectiveDealerName(null)
      }
    }

    void loadDealerContext()

    return () => {
      mounted = false
    }
  }, [userId])

  useEffect(() => {
    let mounted = true

    async function loadAccess() {
      if (!userId) {
        if (mounted) {
          setAllowedModules(new Set())
          setPermissionsLoading(false)
        }
        return
      }

      setPermissionsLoading(true)

      const [{ data: profile }, { data: permissionRows }] = await Promise.all([
        supabase.from('users').select('role').eq('id', userId).maybeSingle(),
        supabase.rpc('get_all_my_permissions'),
      ])

      const nextModules = new Set<string>(((permissionRows ?? []) as PermissionRow[]).map((row) => row.module_name))

      if (profile?.role === 'admin') {
        if (mounted) setIsAdmin(true)
        ALL_ROUTE_MODULES.forEach((moduleName) => nextModules.add(moduleName))

        const { data: activeModules } = await supabase
          .from('modules')
          .select('name')
          .eq('is_active', true)
        ;(activeModules ?? []).forEach((moduleRow) => {
          if (moduleRow.name) {
            nextModules.add(moduleRow.name)
          }
        })
      }

      if (mounted) {
        setAllowedModules(nextModules)
        setPermissionsLoading(false)
      }
    }

    // When impersonating: fetch that user's permissions via service role
    async function loadImpersonatedAccess() {
      if (!userId || !impersonating) return
      setPermissionsLoading(true)
      try {
        const { data: rows } = await supabase
          .rpc('get_permissions_for_user', { target_user_id: impersonating.id })
        const modules = new Set<string>(((rows ?? []) as PermissionRow[]).map((r) => r.module_name))
        if (mounted) {
          setAllowedModules(modules)
          setPermissionsLoading(false)
        }
      } catch {
        if (mounted) setPermissionsLoading(false)
      }
    }

    if (impersonating) {
      void loadImpersonatedAccess()
    } else {
      void loadAccess()
    }

    return () => {
      mounted = false
    }
  }, [userId, impersonating])

  const handleSignOut   = () => supabase.auth.signOut()
  const defaultRoute    = useMemo(() => getDefaultRoute(allowedModules), [allowedModules])
  const canSeeCurrentPath = useMemo(
    () => canAccessPath(location.pathname, allowedModules),
    [allowedModules, location.pathname],
  )

  const visibleNavItems = useMemo(
    () => (NAV_ITEMS as NavItem[]).filter((item) => hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP[item.to])),
    [allowedModules],
  )

  if (!hasSupabaseEnv) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 px-6 py-10">
        <div className="w-full max-w-2xl rounded-xl border border-amber-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">Supabase config missing</h1>
          <p className="mt-2 text-sm text-gray-600">
            Create a <span className="font-mono">.env.local</span> file in the project root with:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
          </pre>
          <p className="mt-3 text-xs text-gray-500">After saving, restart the dev server.</p>
        </div>
      </div>
    )
  }

  if (location.pathname === '/auth/callback') return <AuthCallback />

  if (location.pathname.startsWith('/c/')) {
    return (
      <Routes>
        <Route path="/verify-preview" element={<VerifyScreenPreview />} />
        <Route path="/c/:token" element={<ComplaintPortalPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  if (permissionsLoading) {
    return (
      <AuthGate>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
        </div>
      </AuthGate>
    )
  }

  return (
    <AuthGate>
      <div className="app">
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-xs font-semibold text-white">
            <Icon name="alert" size={15} strokeWidth={2.2} />
            You're offline - changes will sync when reconnected
          </div>
        )}

        <TopNav
          visibleItems={visibleNavItems}
          pathname={location.pathname}
          onNavigate={(to) => navigate(to)}
          onSignOut={handleSignOut}
          user={user}
          isDirty={isDirty}
          effectiveDealerCode={effectiveDealerCode}
          effectiveDealerName={effectiveDealerName}
          impersonating={impersonating}
          onStopImpersonating={stopImpersonating}
        />

        <main className="main">
          <div className="page">
            {!defaultRoute ? (
              <AccessDenied />
            ) : !canSeeCurrentPath ? (
              <AccessDenied />
            ) : (
              <Routes>
                <Route index element={<Navigate to={HOME_ROUTE} replace />} />
                <Route
                  path="/home"
                  element={(
                    <DashboardPage
                      visibleModules={visibleNavItems}
                      roleModuleCount={allowedModules.size}
                      onNavigate={(to) => navigate(to)}
                    />
                  )}
                />
                <Route
                  path="/import"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/import']}>
                      <ImportPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/reports"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/reports']}>
                      <Navigate to="/reports/labour-revenue" replace />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/reports/:categoryId"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/reports']}>
                      <ReportsPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/reports/:categoryId/:reportId"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/reports']}>
                      <ReportsPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/settings"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/settings']}>
                      <SettingsPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/admin"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/admin']}>
                      <AdminPage onViewAsUser={isAdmin ? startImpersonating : undefined} />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/reception"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/reception']}>
                      <ReceptionPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/service-advisor"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/service-advisor']}>
                      <ServiceAdvisorPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/floor-incharge"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/floor-incharge']}>
                      <FloorInchargePage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/sa-tracker"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/sa-tracker']}>
                      <SATrackerPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/bodyshop-tracker"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/bodyshop-tracker']}>
                      <BodyshopTrackerPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/bodyshop-floor"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/bodyshop-floor']}>
                      <BodyshopFloorPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/technician"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/technician']}>
                      <TechnicianPage />
                    </RequireAccess>
                  )}
                />
                <Route path="/reset-password" element={<PasswordUpdatePage />} />
                <Route
                  path="/autodoc"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/autodoc']}>
                      <AutoDocPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/autodoc/:id"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/autodoc']}>
                      <JobCardPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/complaints"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/complaints']}>
                      <ComplaintsPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/bodyshop-repair"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/bodyshop-repair']}>
                      <BodyshopRepairPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/ew-reminder"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/ew-reminder']}>
                      <EWReminderPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/service-booking"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/service-booking']}>
                      <ServiceBookingPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/wa-agent"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/wa-agent']}>
                      <WAAgentPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/telecalling"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/telecalling']}>
                      <TelecallingPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/auto-service-reminder"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/auto-service-reminder']}>
                      <WhatsAppAutomationsPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/cre-incentive"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/cre-incentive']}>
                      <CREIncentivePage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/post-service-feedback"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/post-service-feedback']}>
                      <PostServiceFeedbackCREPage />
                    </RequireAccess>
                  )}
                />
                <Route
                  path="/parts-spm"
                  element={(
                    <RequireAccess allowedModules={allowedModules} modules={ROUTE_MODULE_MAP['/parts-spm']}>
                      <PartsSPMDashboardPage />
                    </RequireAccess>
                  )}
                />
                <Route path="*" element={<Navigate to={HOME_ROUTE} replace />} />
              </Routes>
            )}
          </div>
        </main>

      </div>
    </AuthGate>
  )
}
