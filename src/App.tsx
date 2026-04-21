import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ImportPage from './pages/ImportPage'
import ReportsPage from './pages/ReportsPage.tsx'
import { REPORT_CATEGORIES } from './pages/reports'
import SettingsPage from './pages/SettingsPage'

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
]

export default function App() {
  const location = useLocation()
  const [isReportsOpen, setIsReportsOpen] = useState(false)

  useEffect(() => {
    if (location.pathname.startsWith('/reports')) {
      setIsReportsOpen(true)
    }
  }, [location.pathname])

  const isReportsRoute = location.pathname.startsWith('/reports')

  return (
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
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-xs text-gray-400">Techwheels Service v1.0</p>
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
            <Route path="*" element={<Navigate to="/import" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}
