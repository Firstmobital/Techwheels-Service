import { useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ImportPage from './pages/ImportPage'
import ReportsPage from './pages/ReportsPage.tsx'
import { REPORT_CATEGORIES } from './pages/reports'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import AuthCallback from './pages/AuthCallback'
import PasswordUpdatePage from './pages/PasswordUpdatePage'
import AutoDocPage from './pages/AutoDocPage'
import JobCardPage from './pages/JobCardPage'
import ReceptionPage from './pages/ReceptionPage'
import { hasSupabaseEnv, supabase } from './lib/supabase'
import { DirtyProvider, useDirty } from './context/DirtyContext'
import { useOnline } from './hooks/useOnline'
import type { User } from '@supabase/supabase-js'

// ─── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    to: '/import',
    label: 'Import',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
  },
  {
    to: '/reports',
    label: 'Reports',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    to: '/autodoc',
    label: 'AutoDoc',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    to: '/reception',
    label: 'Reception',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25h16.5m-16.5 0A2.25 2.25 0 001.5 7.5v9A2.25 2.25 0 003.75 18.75h16.5A2.25 2.25 0 0022.5 16.5v-9a2.25 2.25 0 00-2.25-2.25m-16.5 0V3.75A2.25 2.25 0 016 1.5h12a2.25 2.25 0 012.25 2.25v1.5M9 9.75h6m-6 3h6" />
      </svg>
    ),
  },
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

type AppRoute = '/import' | '/reports' | '/settings' | '/admin' | '/autodoc' | '/reception'

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
}

function hasAnyModuleAccess(allowedModules: Set<string>, modules: readonly ModuleName[]) {
  return modules.some((moduleName) => allowedModules.has(moduleName))
}

function canAccessPath(pathname: string, allowedModules: Set<string>) {
  if (pathname === '/') return true
  if (pathname.startsWith('/reports')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/reports'])
  if (pathname.startsWith('/import')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/import'])
  if (pathname.startsWith('/settings')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/settings'])
  if (pathname.startsWith('/admin')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/admin'])
  if (pathname.startsWith('/autodoc')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/autodoc'])
  if (pathname.startsWith('/reception')) return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/reception'])
  if (pathname.startsWith('/reset-password') || pathname.startsWith('/auth/callback')) return true
  return false
}

function getDefaultRoute(allowedModules: Set<string>): AppRoute | null {
  const preferenceOrder: AppRoute[] = ['/import', '/reception', '/reports', '/settings', '/autodoc', '/admin']
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
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [authView, setAuthView] = useState<'login' | 'signup'>('login')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      const nextUser = session?.user ?? null
      setUser((prev) => (prev?.id === nextUser?.id ? prev : nextUser))
    })
    return () => subscription.unsubscribe()
  }, [])

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    )
  }
  if (!user) {
    return authView === 'login'
      ? <LoginPage onSwitchToSignUp={() => setAuthView('signup')} />
      : <SignUpPage onSwitchToLogin={() => setAuthView('login')} />
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
  const online         = useOnline()
  const { isDirty }    = useDirty()
  const [isReportsOpen, setIsReportsOpen] = useState(false)
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

  useEffect(() => {
    if (location.pathname.startsWith('/reports')) setIsReportsOpen(true)
  }, [location.pathname])

  const isReportsRoute  = location.pathname.startsWith('/reports')
  const isAutodocRoute  = location.pathname.startsWith('/autodoc')
  const handleSignOut   = () => supabase.auth.signOut()
  const defaultRoute    = useMemo(() => getDefaultRoute(allowedModules), [allowedModules])
  const canSeeCurrentPath = useMemo(
    () => canAccessPath(location.pathname, allowedModules),
    [allowedModules, location.pathname],
  )

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => {
      if (item.to === '/import') return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/import'])
      if (item.to === '/reports') return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/reports'])
      if (item.to === '/settings') return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/settings'])
      if (item.to === '/admin') return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/admin'])
      if (item.to === '/autodoc') return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/autodoc'])
      if (item.to === '/reception') return hasAnyModuleAccess(allowedModules, ROUTE_MODULE_MAP['/reception'])
      return false
    }),
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
      <div className="flex h-screen flex-col overflow-hidden bg-gray-100 text-gray-900">

        {/* Offline banner */}
        {!online && (
          <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-xs font-semibold text-white">
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
            </svg>
            You're offline — changes will sync when reconnected
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar — hidden on mobile */}
          <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
            {/* Logo */}
            <div className="flex h-16 items-center gap-2.5 border-b border-gray-100 px-5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
              </div>
              <span className="text-sm font-semibold leading-tight text-gray-800">Techwheels</span>
            </div>

            {/* Nav */}
            <nav className="flex-1 space-y-0.5 px-3 py-4">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Menu</p>

              {visibleNavItems.some((item) => item.to === '/import') && (
                <SideNavLink to="/import" icon={NAV_ITEMS[0].icon} label={NAV_ITEMS[0].label} />
              )}

              {/* Reports accordion */}
              {visibleNavItems.some((item) => item.to === '/reports') && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setIsReportsOpen(p => !p)}
                  className={[
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isReportsRoute ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-3">
                    <span className={isReportsRoute ? 'text-blue-600' : 'text-gray-400'}>{NAV_ITEMS[1].icon}</span>
                    {NAV_ITEMS[1].label}
                  </span>
                  <svg
                    className={['h-4 w-4 transition-transform', isReportsOpen ? 'rotate-180' : '', isReportsRoute ? 'text-blue-600' : 'text-gray-400'].join(' ')}
                    fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {isReportsOpen && (
                  <div className="space-y-1 pl-11">
                    {REPORT_CATEGORIES.map((cat, i) => (
                      <NavLink
                        key={cat.id}
                        to={`/reports/${cat.id}`}
                        className={({ isActive }) => [
                          'block rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                          isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                        ].join(' ')}
                      >
                        {`${i + 1}. ${cat.label}`}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
              )}

              {visibleNavItems.some((item) => item.to === '/settings') && (
                <SideNavLink to="/settings" icon={NAV_ITEMS[2].icon} label={NAV_ITEMS[2].label} />
              )}
              {visibleNavItems.some((item) => item.to === '/admin') && (
                <SideNavLink to="/admin" icon={NAV_ITEMS[3].icon} label={NAV_ITEMS[3].label} />
              )}

              {/* AutoDoc with dirty dot */}
              {visibleNavItems.some((item) => item.to === '/autodoc') && <NavLink
                to="/autodoc"
                className={({ isActive }) => [
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')}
              >
                {({ isActive }) => (
                  <>
                    <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>{NAV_ITEMS[4].icon}</span>
                    <span className="flex-1">{NAV_ITEMS[4].label}</span>
                    {isDirty && !isAutodocRoute && (
                      <span className="h-2 w-2 rounded-full bg-amber-400" title="Unsaved changes" />
                    )}
                  </>
                )}
              </NavLink>}

              {visibleNavItems.some((item) => item.to === '/reception') && (
                <SideNavLink to="/reception" icon={NAV_ITEMS[5].icon} label={NAV_ITEMS[5].label} />
              )}
            </nav>

            {/* Sidebar footer */}
            <div className="border-t border-gray-100 px-4 py-3">
              {user && (
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                    {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-gray-800">
                      {user.user_metadata?.full_name || 'User'}
                    </p>
                    <p className="truncate text-[10px] text-gray-400">{user.email}</p>
                  </div>
                </div>
              )}
              {user?.user_metadata?.dealer_code && (
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
                    {user.user_metadata.dealer_code}
                  </span>
                  {user.user_metadata.dealer_name && (
                    <span className="truncate text-[10px] text-gray-500">{user.user_metadata.dealer_name}</span>
                  )}
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
                Sign out
              </button>
              <p className="mt-2 text-[10px] text-gray-400">Techwheels Service v1.0</p>
            </div>
          </aside>

          {/* Main area */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Top header */}
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
              <h1 className="text-sm font-semibold tracking-tight text-gray-800 md:text-base">
                Techwheels Service Dashboard
              </h1>

              {user && (
                <div className="flex items-center gap-3 text-sm">
                  {user.user_metadata?.dealer_code ? (
                    <div className="hidden items-center gap-2 border-r border-gray-200 pr-3 sm:flex">
                      {user.user_metadata?.dealer_name && (
                        <span className="hidden font-medium text-gray-700 lg:block">{user.user_metadata.dealer_name}</span>
                      )}
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-600/20">
                        {user.user_metadata.dealer_code}
                      </span>
                    </div>
                  ) : (
                    <span className="hidden border-r border-gray-200 pr-3 text-xs text-amber-600 sm:block">
                      No dealer assigned
                    </span>
                  )}
                  <span className="hidden max-w-[160px] truncate text-xs text-gray-400 sm:block">{user.email}</span>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                    </svg>
                    <span className="hidden sm:block">Sign out</span>
                  </button>
                </div>
              )}
            </header>

            {/* Page content */}
            <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
              {!defaultRoute ? (
                <AccessDenied />
              ) : !canSeeCurrentPath ? (
                <AccessDenied />
              ) : (
              <Routes>
                <Route index element={<Navigate to={defaultRoute} replace />} />
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
                <Route path="*" element={<Navigate to={defaultRoute} replace />} />
              </Routes>
              )}
            </main>
          </div>
        </div>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 flex items-center justify-around border-t border-gray-200 bg-white px-2 py-1 safe-bottom">
          {visibleNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => [
                'relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors min-w-0',
                isActive ? 'text-blue-600' : 'text-gray-500',
              ].join(' ')}
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>{item.icon}</span>
                  {item.label}
                  {item.to === '/autodoc' && isDirty && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </AuthGate>
  )
}

// ─── Reusable sidebar link ────────────────────────────────────────────────────

function SideNavLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => [
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
      ].join(' ')}
    >
      {({ isActive }) => (
        <>
          <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>{icon}</span>
          {label}
        </>
      )}
    </NavLink>
  )
}
