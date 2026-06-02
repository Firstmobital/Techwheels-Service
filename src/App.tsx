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
import FloorInchargePage from './pages/FloorInchargePage'
import TechnicianPage from './pages/TechnicianPage'
import { Icon } from './components/Icon'
import { hasSupabaseEnv, supabase } from './lib/supabase'
import { DirtyProvider, useDirty } from './context/DirtyContext'
import { useOnline } from './hooks/useOnline'
import type { User } from '@supabase/supabase-js'

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/reception', label: 'Reception', icon: 'reception' },
  { to: '/service-advisor', label: 'Service Advisor', icon: 'admin' },
  { to: '/technician', label: 'Technician', icon: 'tech' },
  { to: '/import', label: 'Imports', icon: 'import' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/autodoc', label: 'AutoDoc', icon: 'autodoc' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
  { to: '/admin', label: 'Admin', icon: 'admin' },
  { to: '/floor-incharge', label: 'Floor Incharge', icon: 'floor' },
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
  | 'technician'

type AppRoute = '/import' | '/reports' | '/settings' | '/admin' | '/autodoc' | '/reception' | '/service-advisor' | '/floor-incharge' | '/technician'

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
  '/technician': ['technician'],
}

type NavItem = {
  to: AppRoute
  label: string
  icon: string
}

const HOME_ROUTE = '/home'

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
}: {
  visibleItems: NavItem[]
  pathname: string
  onNavigate: (to: string) => void
  onSignOut: () => void
  user: User | null
  isDirty: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
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

  const dealerName = user?.user_metadata?.dealer_name || 'No dealer assigned'
  const dealerCode = user?.user_metadata?.dealer_code || 'NO-DEALER'

  const navToReportsCategory = (categoryId: string) => onNavigate(`/reports/${categoryId}`)

  function renderNavItem(item: NavItem) {
    const active = isNavItemActive(pathname, item.to)
    const hasMenu = item.to === '/reports'

    return (
      <div key={item.to} style={{ position: 'relative' }}>
        <button
          type="button"
          className={[`navitem`, active ? 'is-active' : '', open === item.to ? 'open' : ''].join(' ').trim()}
          onClick={() => {
            if (!hasMenu) {
              onNavigate(item.to)
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
          <div className="menu" style={{ left: 0 }}>
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
      <div className="util">
        <div className="util__dealer">
          <Icon name="building" size={16} strokeWidth={1.7} style={{ color: 'var(--muted)' }} />
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
        <button type="button" className="util__icon" title="Notifications">
          <Icon name="bell" size={17} strokeWidth={1.9} />
          <span className="dot" />
        </button>
        <span className="util__sep" />
        <span className="util__ver">v1.0 · Firstmobital</span>
      </div>

      <div className="nav" ref={navRef}>
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
            <div style={{ position: 'relative' }}>
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
                <div className="menu" style={{ left: 0 }}>
                  <div className="menu__label">More modules</div>
                  {overflowItems.map((item) => (
                    <button
                      key={item.to}
                      type="button"
                      className={[`menu__item`, isNavItemActive(pathname, item.to) ? 'is-active' : ''].join(' ').trim()}
                      onClick={() => {
                        onNavigate(item.to)
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

        <div style={{ position: 'relative' }}>
          <button type="button" className="userchip" onClick={() => setOpen(open === 'user' ? null : 'user')}>
            <span className="avatar">{userInitials || 'U'}</span>
            <span className="ucmeta" style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', minWidth: 0, lineHeight: 1.15 }}>
              <span className="nm" style={{ whiteSpace: 'nowrap' }}>{userName}</span>
              <span className="rl" style={{ whiteSpace: 'nowrap' }}>{dealerCode}</span>
            </span>
            <Icon name="chevron" size={14} strokeWidth={1.9} className="ucmeta" style={{ color: 'var(--faint)' }} />
          </button>

          {open === 'user' && (
            <div className="menu" style={{ right: 0, minWidth: 248 }}>
              <div style={{ padding: '8px 10px 10px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className="avatar" style={{ width: 36, height: 36 }}>{userInitials || 'U'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700 }}>{userName}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{userEmail}</div>
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
              <button type="button" className="menu__item" onClick={onSignOut} style={{ color: 'var(--danger)' }}>
                <span className="ic" style={{ color: 'var(--danger)' }}><Icon name="signout" size={16} strokeWidth={2} /></span>
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
                onNavigate(item.to)
                setMobileDrawerOpen(false)
                setOpen(null)
              }}
            >
              <span className="ic"><Icon name={item.icon} size={18} strokeWidth={1.9} /></span>
              {item.label}
              {item.to === '/autodoc' && isDirty && <span className="dirty" style={{ marginLeft: 'auto' }} />}
            </button>
          ))}
        </div>
      </div>
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
  if (pathname.startsWith('/admin')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/admin'])
  if (pathname.startsWith('/autodoc')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/autodoc'])
  if (pathname.startsWith('/reception')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/reception'])
  if (pathname.startsWith('/service-advisor')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/service-advisor'])
  if (pathname.startsWith('/floor-incharge')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/floor-incharge'])
  if (pathname.startsWith('/technician')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/technician'])
  if (pathname.startsWith('/reset-password') || pathname.startsWith('/auth/callback') || pathname.startsWith('/forgot-password')) return true
  return false
}

function getDefaultRoute(allowedModules: Set<string>): AppRoute | null {
  const preferenceOrder: AppRoute[] = ['/import', '/reception', '/service-advisor', '/floor-incharge', '/technician', '/reports', '/settings', '/autodoc', '/admin']
  return preferenceOrder.find((route) => hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP[route])) ?? null
}

function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-2xl">
        <div className="rounded-xl border border-amber-200 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <svg className="h-8 w-8 text-amber-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c.866-1.5 2.845-2.501 4.953-2.501h10.7c2.108 0 4.087 1.001 4.953 2.501M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">Module access required</h2>
              <p className="mt-2 text-sm text-gray-600">
                Your account is active, but you don't have permission to access any modules yet. Contact your administrator to request access to:
              </p>
              <ul className="mt-3 space-y-1 text-sm text-gray-600">
                <li>• <strong>Job Cards</strong> — Create and manage service jobs</li>
                <li>• <strong>Reports</strong> — View cross-module analytics and dashboards</li>
                <li>• <strong>Employees</strong> — Manage employee master data</li>
                <li>• <strong>AutoDoc</strong> — Build vehicle documentation and estimates</li>
                <li>• <strong>Reception</strong> — Capture front-desk intake entries</li>
                <li>• <strong>Service Advisor</strong> — Work only assigned intake rows</li>
                <li>• <strong>Floor Incharge</strong> — Assign technicians to open job cards</li>
                <li>• <strong>Technician</strong> — View assigned rows and day-wise income tracker</li>
              </ul>
              <p className="mt-4 text-xs text-gray-500">
                If you believe this is a mistake, ask your administrator to check your module assignments in the Admin Panel.
              </p>
            </div>
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
      if (event === 'SIGNED_IN' && nextUser) {
        navigate(HOME_ROUTE, { replace: true })
      }
    })
    return () => subscription.unsubscribe()
  }, [])

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
  const [allowedModules, setAllowedModules] = useState<Set<string>>(new Set())
  const [permissionsLoading, setPermissionsLoading] = useState(true)

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

    void loadAccess()

    return () => {
      mounted = false
    }
  }, [userId])

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
                      <AdminPage />
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
                <Route path="*" element={<Navigate to={HOME_ROUTE} replace />} />
              </Routes>
            )}
          </div>
        </main>
      </div>
    </AuthGate>
  )
}
