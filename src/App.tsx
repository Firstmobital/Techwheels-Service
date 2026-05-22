import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ImportPage from './pages/ImportPage'
import ReportsPage from './pages/ReportsPage.tsx'
import { REPORT_CATEGORIES } from './pages/reports'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import AuthCallback from './pages/AuthCallback'
import AutoDocPage from './pages/AutoDocPage'
import { hasSupabaseEnv, supabase } from './lib/supabase'
import type { User } from '@supabase/supabase-js'

const NAV_ITEMS = [
  {
    to: '/import',
    label: 'Import Data',
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
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 1115 0 7.5 7.5 0 01-15 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9.75v4.5m2.25-2.25h-4.5" />
      </svg>
    ),
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
]

// ─── Auth wrapper ────────────────────────────────────────────────────────────
function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [authView, setAuthView] = useState<'login' | 'signup'>('login')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Still loading
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

  return <>{children}</>
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const location = useLocation()
  const [isReportsOpen, setIsReportsOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

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

  useEffect(() => {
    if (location.pathname.startsWith('/reports')) {
      setIsReportsOpen(true)
    }
  }, [location.pathname])

  const isReportsRoute = location.pathname.startsWith('/reports')

  const handleSignOut = async () => {
    await supabase.auth.signOut()
  }

  // Public route — handle before AuthGate
  if (window.location.pathname === '/auth/callback') {
    return <AuthCallback />
  }

  return (
    <AuthGate>
      <div className="flex h-screen overflow-hidden bg-gray-100 text-gray-900">
        {/* Sidebar */}
        <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
          {/* Logo / brand */}
          <div className="flex h-16 items-center gap-2.5 border-b border-gray-100 px-5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
            <span className="text-sm font-semibold text-gray-800 leading-tight">Techwheels</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 space-y-0.5 px-3 py-4">
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Menu</p>

            <NavLink
              to="/import"
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>{NAV_ITEMS[0].icon}</span>
                  {NAV_ITEMS[0].label}
                </>
              )}
            </NavLink>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => setIsReportsOpen((prev) => !prev)}
                className={[
                  'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isReportsRoute
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')}
              >
                <span className="flex items-center gap-3">
                  <span className={isReportsRoute ? 'text-blue-600' : 'text-gray-400'}>{NAV_ITEMS[1].icon}</span>
                  {NAV_ITEMS[1].label}
                </span>
                <svg
                  className={[
                    'h-4 w-4 transition-transform',
                    isReportsOpen ? 'rotate-180' : '',
                    isReportsRoute ? 'text-blue-600' : 'text-gray-400',
                  ].join(' ')}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {isReportsOpen && (
                <div className="space-y-1 pl-11">
                  {REPORT_CATEGORIES.map((category, index) => (
                    <NavLink
                      key={category.id}
                      to={`/reports/${category.id}`}
                      className={({ isActive }) =>
                        [
                          'block rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
                          isActive
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                        ].join(' ')
                      }
                    >
                      {`${index + 1}. ${category.label}`}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>

            <NavLink
              to="/settings"
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>{NAV_ITEMS[2].icon}</span>
                  {NAV_ITEMS[2].label}
                </>
              )}
            </NavLink>

            <NavLink
              to="/admin"
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>{NAV_ITEMS[3].icon}</span>
                  {NAV_ITEMS[3].label}
                </>
              )}
            </NavLink>

            <NavLink
              to="/autodoc"
              className={({ isActive }) =>
                [
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={isActive ? 'text-blue-600' : 'text-gray-400'}>{NAV_ITEMS[4].icon}</span>
                  {NAV_ITEMS[4].label}
                </>
              )}
            </NavLink>
          </nav>

          {/* Footer with user info + sign out */}
          <div className="border-t border-gray-100 px-4 py-3">
            {user && (
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
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
            <button
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
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
          <header className="flex h-16 shrink-0 items-center border-b border-gray-200 bg-white px-6">
            <h1 className="text-base font-semibold text-gray-800 tracking-tight">
              Techwheels Service Dashboard
            </h1>
          </header>

          {/* Page content */}
          <main className="flex-1 overflow-y-auto">
            <Routes>
              <Route index element={<Navigate to="/import" replace />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/reports" element={<Navigate to="/reports/labour-revenue" replace />} />
              <Route path="/reports/:categoryId" element={<ReportsPage />} />
              <Route path="/reports/:categoryId/:reportId" element={<ReportsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/autodoc" element={<AutoDocPage />} />
              <Route path="*" element={<Navigate to="/import" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </AuthGate>
  )
}
