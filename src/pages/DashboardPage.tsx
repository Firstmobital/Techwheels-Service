import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

type VisibleModule = {
  to: string
  label: string
  icon: string
}

type DashboardKpi = {
  icon: string
  label: string
  value: string
}

type ReceptionRow = {
  id: number
  created_at: string
  source: string | null
  reg_number: string
  model: string | null
  sa_name: string | null
  service_type: string | null
}

type ActivityRow = {
  id: string
  icon: string
  title: string
  message: string
  time: string
}

type ModuleMetaRow = {
  name: string | null
  label: string | null
  description: string | null
  route: string | null
  is_active: boolean | null
}

function normalizeRoute(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizeModuleName(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_')
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toDisplayCount(value: number | null) {
  if (value === null) return '--'
  return value.toLocaleString('en-IN')
}

async function fetchCount(tableName: string) {
  const { count, error } = await supabase.from(tableName).select('*', { count: 'exact', head: true })
  if (error) return null
  return count ?? 0
}

export default function DashboardPage({
  visibleModules,
  roleModuleCount,
  onNavigate,
}: {
  visibleModules: VisibleModule[]
  roleModuleCount: number
  onNavigate: (to: string) => void
}) {
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<DashboardKpi[]>([])
  const [receptionRows, setReceptionRows] = useState<ReceptionRow[]>([])
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([])
  const [receptionTotal, setReceptionTotal] = useState<number | null>(null)
  const [userFirstName, setUserFirstName] = useState('User')
  const [moduleMetaByRoute, setModuleMetaByRoute] = useState<Record<string, ModuleMetaRow>>({})
  const [totalModulesCount, setTotalModulesCount] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      setLoading(true)

      const [
        receptionCount,
        employeesCount,
        usersCount,
        modulesResult,
        receptionResult,
        authResult,
      ] = await Promise.all([
        fetchCount('service_reception_entries'),
        fetchCount('employee_master'),
        fetchCount('users'),
        supabase.from('modules').select('name, label, description, route, is_active'),
        supabase
          .from('service_reception_entries')
          .select('id, created_at, source, reg_number, model, sa_name, service_type')
          .order('created_at', { ascending: false })
          .limit(8),
        supabase.auth.getSession(),
      ])

      const moduleRows = (modulesResult.data ?? []) as ModuleMetaRow[]
      const activeModulesCount = moduleRows.filter((row) => row.is_active === true).length
      setTotalModulesCount(moduleRows.length)

      const routeLookup: Record<string, ModuleMetaRow> = {}
      const nameLookup: Record<string, ModuleMetaRow> = {}
      moduleRows.forEach((row) => {
        const routeKey = normalizeRoute(row.route)
        const nameKey = normalizeModuleName(row.name)
        if (routeKey) routeLookup[routeKey] = row
        if (nameKey) nameLookup[nameKey] = row
      })

      const nextMetaByRoute: Record<string, ModuleMetaRow> = {}
      visibleModules.forEach((module) => {
        const direct = routeLookup[module.to]
        const byName = nameLookup[normalizeModuleName(module.label)]
        const byRouteName = nameLookup[normalizeModuleName(module.to.replace(/^\//, ''))]
        nextMetaByRoute[module.to] = direct ?? byName ?? byRouteName ?? {
          name: null,
          label: null,
          description: null,
          route: null,
          is_active: null,
        }
      })
      setModuleMetaByRoute(nextMetaByRoute)

      if (!mounted) return

      setKpis([
        { icon: 'reception', label: 'Reception Entries', value: toDisplayCount(receptionCount) },
        { icon: 'user', label: 'Employees', value: toDisplayCount(employeesCount) },
        { icon: 'admin', label: 'Platform Users', value: toDisplayCount(usersCount) },
        { icon: 'grid', label: 'Active Modules', value: toDisplayCount(activeModulesCount) },
      ])

      const receptionData = (receptionResult.data ?? []) as ReceptionRow[]
      setReceptionTotal(receptionCount)
      setReceptionRows(receptionData)

      const fullName = String(authResult.data.session?.user?.user_metadata?.full_name ?? '').trim()
      const userId = authResult.data.session?.user?.id
      if (userId) {
        const { data: userRow } = await supabase
          .from('users')
          .select('full_name')
          .eq('id', userId)
          .maybeSingle()

        const dbFullName = String((userRow as { full_name?: string | null } | null)?.full_name ?? '').trim()
        if (dbFullName) {
          setUserFirstName(dbFullName.split(/\s+/)[0])
        } else if (fullName) {
          setUserFirstName(fullName.split(/\s+/)[0])
        } else {
          const email = String(authResult.data.session?.user?.email ?? '').trim()
          setUserFirstName(email ? email.split('@')[0] : 'User')
        }
      } else {
        setUserFirstName('User')
      }

      setActivityRows(
        receptionData.slice(0, 6).map((row) => ({
          id: `intake-${row.id}`,
          icon: 'reception',
          title: 'New intake captured',
          message: `${row.reg_number}${row.model ? ` · ${row.model}` : ''}${row.sa_name ? ` · ${row.sa_name}` : ''}`,
          time: formatDateTime(row.created_at),
        })),
      )

      setLoading(false)
    }

    void loadDashboard()

    return () => {
      mounted = false
    }
  }, [visibleModules])

  const visibleCountText = useMemo(
    () => {
      const launcherCount = visibleModules.length
      const roleCount = toDisplayCount(roleModuleCount)
      const dbActiveCount = toDisplayCount(totalModulesCount)
      return `${roleCount} available to your role · ${launcherCount} wired in launcher · ${dbActiveCount} active in DB`
    },
    [roleModuleCount, visibleModules.length, totalModulesCount],
  )

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
  }, [])

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="greet">{greeting}, {userFirstName}</p>
          <h1>Workshop overview</h1>
          <p>Here&apos;s what&apos;s happening across your modules today.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => onNavigate('/reception')}>
          <Icon name="plus" size={17} /> New intake
        </button>
      </div>

      <div className="kpis">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="kpi">
            <div className="kpi__top">
              <span className="kpi__ic"><Icon name={kpi.icon} size={19} /></span>
            </div>
            <div className="kpi__val">{loading ? '...' : kpi.value}</div>
            <div className="kpi__lab">{kpi.label}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card__head">
            <div>
              <h3>Recent reception entries</h3>
              <div className="sub">Latest front-desk intake · {toDisplayCount(receptionTotal)} total</div>
            </div>
            <button type="button" className="btn btn--soft btn--sm" onClick={() => onNavigate('/reception')}>
              Open Reception <Icon name="arrowr" size={15} />
            </button>
          </div>
          <div className="card__body card__body--table">
            <div className="tbl-wrap scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Source</th>
                    <th>Reg No</th>
                    <th>Model</th>
                    <th>SA Name</th>
                    <th>Service</th>
                  </tr>
                </thead>
                <tbody>
                  {receptionRows.slice(0, 6).map((row) => (
                    <tr key={row.id}>
                      <td>{formatDateTime(row.created_at)}</td>
                      <td><span className="pill b">{row.source || '—'}</span></td>
                      <td className="mono strong">{row.reg_number}</td>
                      <td>{row.model || '—'}</td>
                      <td className="strong">{row.sa_name || '—'}</td>
                      <td className="text-muted">{row.service_type || '—'}</td>
                    </tr>
                  ))}
                  {!loading && receptionRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-muted">No reception entries found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <div>
              <h3>Activity</h3>
              <div className="sub">Across all modules</div>
            </div>
          </div>
          <div className="card__body card__body--feed-tight">
            <div className="feed">
              {activityRows.map((activity) => (
                <div className="feed__row" key={activity.id}>
                  <span className="feed__ic"><Icon name={activity.icon} size={16} /></span>
                  <div className="feed__main">
                    <div className="feed__t">{activity.title}</div>
                    <div className="feed__m">{activity.message}</div>
                  </div>
                  <span className="feed__time">{activity.time}</span>
                </div>
              ))}
              {!loading && activityRows.length === 0 && (
                <div className="feed__row">
                  <span className="feed__ic"><Icon name="clock" size={16} /></span>
                  <div className="feed__m">No recent activity found.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card card--mt-gap">
        <div className="card__head">
          <div>
            <h3>Your modules</h3>
            <div className="sub">{visibleCountText}</div>
          </div>
          <span className="pill b"><Icon name="shield" size={12} />Role-based access</span>
        </div>
        <div className="card__body">
          <div className="launch">
            {visibleModules.map((module) => (
              <button type="button" className="modcard" key={module.to} onClick={() => onNavigate(module.to)}>
                <span className="modcard__ic"><Icon name={module.icon} size={20} /></span>
                <span className="modcard__nm">{moduleMetaByRoute[module.to]?.label || module.label}</span>
                <span className="modcard__desc">{moduleMetaByRoute[module.to]?.description || 'No description configured in modules table.'}</span>
                <span className="modcard__go">Open <Icon name="arrowr" size={14} /></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
