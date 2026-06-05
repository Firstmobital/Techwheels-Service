import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'
import { listFloorInchargeEntries, listReceptionEntries, listServiceAdvisorEntries, type ReceptionEntryRow } from '../lib/api'

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

const UNKNOWN_FUEL_TYPE = 'Unknown'

function normalizeRoute(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  if (!trimmed) return ''
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

function normalizeModuleName(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_')
}

function getStatusFuelTypeLabel(value: string | null | undefined) {
  const trimmed = String(value ?? '').trim()
  return trimmed || UNKNOWN_FUEL_TYPE
}

function normalizeWorkStatus(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase()
  return normalized || 'work_inprocess'
}

function getFloorAssignmentKey(row: ReceptionEntryRow) {
  const jc = String(row.jc_number ?? '').trim()
  return jc || `RECEPTION-${row.id}`
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
  const [statusRows, setStatusRows] = useState<ReceptionEntryRow[]>([])
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusBranchFilter, setStatusBranchFilter] = useState<string | 'all'>('all')
  const [statusFuelTypeFilter, setStatusFuelTypeFilter] = useState<string | 'all'>('all')
  const [floorStatusRows, setFloorStatusRows] = useState<ReceptionEntryRow[]>([])
  const [floorStatusBranchFilter, setFloorStatusBranchFilter] = useState<string | 'all'>('all')
  const [assignmentStatusByJobCard, setAssignmentStatusByJobCard] = useState<Record<string, string>>({})
  const [statusCompletedJobCards, setStatusCompletedJobCards] = useState<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true

    async function loadDashboard() {
      setLoading(true)
      setStatusLoading(true)

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

      const userId = authResult.data.session?.user?.id ?? null
      let isAdminUser = false
      if (userId) {
        const { data: profile } = await supabase
          .from('users')
          .select('role, is_active')
          .eq('id', userId)
          .maybeSingle()

        const role = String((profile as { role?: string | null } | null)?.role ?? '').trim().toLowerCase()
        isAdminUser = role === 'admin' && (profile as { is_active?: boolean | null } | null)?.is_active === true
      }

      const hasServiceAdvisorModule = visibleModules.some((module) => module.to === '/service-advisor')
      const hasFloorInchargeModule = visibleModules.some((module) => module.to === '/floor-incharge')

      const statusRowsResult = isAdminUser
        ? await listReceptionEntries()
        : await listServiceAdvisorEntries()
      const nextStatusRows = statusRowsResult.error ? [] : (statusRowsResult.data ?? [])

      const floorRowsResult = hasFloorInchargeModule
        ? await listFloorInchargeEntries()
        : { error: null, data: [] as ReceptionEntryRow[] }
      const nextFloorStatusRows = floorRowsResult.error ? [] : (floorRowsResult.data ?? [])

      const { data: assignmentRows } = await supabase
        .from('technician_assignments')
        .select('job_card_number, work_status')

      const nextCompleted = new Set<string>()
      const nextAssignmentStatus: Record<string, string> = {}
      ;(assignmentRows ?? []).forEach((row: { job_card_number?: string | null; work_status?: string | null }) => {
        const jobCard = String(row.job_card_number ?? '').trim().toUpperCase()
        if (!jobCard) return

        const normalizedStatus = normalizeWorkStatus(row.work_status)
        nextAssignmentStatus[jobCard] = normalizedStatus
        if (normalizedStatus === 'completed') nextCompleted.add(jobCard)
      })

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

      setStatusRows(nextStatusRows)
      setFloorStatusRows(nextFloorStatusRows)
      setAssignmentStatusByJobCard(nextAssignmentStatus)
      setStatusCompletedJobCards(nextCompleted)

      setLoading(false)
      setStatusLoading(false)
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

  const canSeeServiceAdvisorStatus = useMemo(
    () => visibleModules.some((module) => module.to === '/service-advisor'),
    [visibleModules],
  )

  const canSeeFloorInchargeStatus = useMemo(
    () => visibleModules.some((module) => module.to === '/floor-incharge'),
    [visibleModules],
  )

  const canSeeStatusSection = canSeeServiceAdvisorStatus || canSeeFloorInchargeStatus

  const statusBranches = useMemo(
    () => Array.from(new Set(statusRows.map((row) => String(row.branch ?? '').trim()).filter(Boolean))).sort(),
    [statusRows],
  )

  const statusBranchFilteredRows = useMemo(() => {
    if (statusBranchFilter === 'all') return statusRows
    return statusRows.filter((row) => String(row.branch ?? '').trim() === statusBranchFilter)
  }, [statusRows, statusBranchFilter])

  const statusFuelTypes = useMemo(
    () => Array.from(new Set(statusBranchFilteredRows.map((row) => getStatusFuelTypeLabel(row.fuel_type)))).sort(),
    [statusBranchFilteredRows],
  )

  const statusFilteredRows = useMemo(() => {
    if (statusFuelTypeFilter === 'all') return statusBranchFilteredRows
    return statusBranchFilteredRows.filter(
      (row) => getStatusFuelTypeLabel(row.fuel_type) === statusFuelTypeFilter,
    )
  }, [statusBranchFilteredRows, statusFuelTypeFilter])

  const statusSummary = useMemo(() => {
    const filteredEntries = statusFilteredRows.length
    const srType = statusFilteredRows.filter((row) => !String(row.service_type ?? '').trim()).length
    const jobCard = statusFilteredRows.filter((row) => !String(row.jc_number ?? '').trim()).length
    const estimate = statusFilteredRows.filter((row) => !row.estimate_storage_path).length
    const invoice = statusFilteredRows.filter((row) => {
      const jc = String(row.jc_number ?? '').trim().toUpperCase()
      return Boolean(jc) && statusCompletedJobCards.has(jc) && !row.invoice_storage_path
    }).length
    const completedCards = statusFilteredRows.filter((row) => {
      const jc = String(row.jc_number ?? '').trim().toUpperCase()
      return Boolean(jc) && statusCompletedJobCards.has(jc) && Boolean(row.invoice_storage_path)
    }).length

    return {
      filteredEntries,
      srType,
      jobCard,
      estimate,
      invoice,
      completedCards,
    }
  }, [statusFilteredRows, statusCompletedJobCards])

  const statusBranchCounts = useMemo(() => {
    const next: Record<string, number> = {}
    statusBranches.forEach((branch) => {
      next[branch] = statusRows.filter((row) => String(row.branch ?? '').trim() === branch).length
    })
    return next
  }, [statusRows, statusBranches])

  const statusFuelCounts = useMemo(() => {
    const next: Record<string, number> = {}
    statusFuelTypes.forEach((fuelType) => {
      next[fuelType] = statusBranchFilteredRows.filter(
        (row) => getStatusFuelTypeLabel(row.fuel_type) === fuelType,
      ).length
    })
    return next
  }, [statusBranchFilteredRows, statusFuelTypes])

  useEffect(() => {
    if (statusBranchFilter === 'all') return
    if (!statusBranches.includes(statusBranchFilter)) {
      setStatusBranchFilter('all')
    }
  }, [statusBranchFilter, statusBranches])

  useEffect(() => {
    if (statusFuelTypeFilter === 'all') return
    if (!statusFuelTypes.includes(statusFuelTypeFilter)) {
      setStatusFuelTypeFilter('all')
    }
  }, [statusFuelTypeFilter, statusFuelTypes])

  const floorStatusBranches = useMemo(
    () => Array.from(new Set(floorStatusRows.map((row) => String(row.branch ?? '').trim()).filter(Boolean))).sort(),
    [floorStatusRows],
  )

  const floorStatusScopedRows = useMemo(() => {
    if (floorStatusBranchFilter === 'all') return floorStatusRows
    return floorStatusRows.filter((row) => String(row.branch ?? '').trim() === floorStatusBranchFilter)
  }, [floorStatusRows, floorStatusBranchFilter])

  const floorStatusBranchCounts = useMemo(() => {
    const next: Record<string, number> = {}
    floorStatusBranches.forEach((branch) => {
      next[branch] = floorStatusRows.filter((row) => String(row.branch ?? '').trim() === branch).length
    })
    return next
  }, [floorStatusRows, floorStatusBranches])

  const floorStatusSummary = useMemo(() => {
    const jobCards = floorStatusScopedRows.length
    const assigned = floorStatusScopedRows.filter((row) => {
      const key = getFloorAssignmentKey(row).toUpperCase()
      return Boolean(assignmentStatusByJobCard[key])
    }).length
    const unassigned = jobCards - assigned
    const hold = floorStatusScopedRows.filter((row) => {
      const key = getFloorAssignmentKey(row).toUpperCase()
      return assignmentStatusByJobCard[key] === 'hold'
    }).length
    const inProcess = floorStatusScopedRows.filter((row) => {
      const key = getFloorAssignmentKey(row).toUpperCase()
      return assignmentStatusByJobCard[key] === 'work_inprocess'
    }).length
    const completed = floorStatusScopedRows.filter((row) => {
      const key = getFloorAssignmentKey(row).toUpperCase()
      return assignmentStatusByJobCard[key] === 'completed'
    }).length

    return {
      jobCards,
      unassigned,
      assigned,
      hold,
      inProcess,
      completed,
    }
  }, [floorStatusScopedRows, assignmentStatusByJobCard])

  useEffect(() => {
    if (floorStatusBranchFilter === 'all') return
    if (!floorStatusBranches.includes(floorStatusBranchFilter)) {
      setFloorStatusBranchFilter('all')
    }
  }, [floorStatusBranchFilter, floorStatusBranches])

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

      {canSeeStatusSection && (
        <div className="card card--mt-gap">
          <div className="card__head">
            <div>
              <h3>Status</h3>
            </div>
          </div>
          <div className="card__body">
            {canSeeServiceAdvisorStatus && (
              <>
                <div className="sub" style={{ marginBottom: 10 }}>Service Advisor</div>
                <div className="toolbar toolbar--tight">
                  <span className="toolbar__label">Filter by location:</span>
                  <button
                    type="button"
                    onClick={() => setStatusBranchFilter('all')}
                    className={`btn btn--sm ${statusBranchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
                  >
                    All ({toDisplayCount(statusRows.length)})
                  </button>
                  {statusBranches.map((branch) => (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => setStatusBranchFilter(branch)}
                      className={`btn btn--sm ${statusBranchFilter === branch ? 'btn--primary' : 'btn--ghost'}`}
                    >
                      {branch} ({toDisplayCount(statusBranchCounts[branch] ?? 0)})
                    </button>
                  ))}
                </div>

                {statusFuelTypes.length > 0 && (
                  <div className="toolbar toolbar--tight">
                    <span className="toolbar__label">Filter by fuel type:</span>
                    <button
                      type="button"
                      onClick={() => setStatusFuelTypeFilter('all')}
                      className={`btn btn--sm ${statusFuelTypeFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
                    >
                      All ({toDisplayCount(statusBranchFilteredRows.length)})
                    </button>
                    {statusFuelTypes.map((fuelType) => (
                      <button
                        key={fuelType}
                        type="button"
                        onClick={() => setStatusFuelTypeFilter(fuelType)}
                        className={`btn btn--sm ${statusFuelTypeFilter === fuelType ? 'btn--primary' : 'btn--ghost'}`}
                      >
                        {fuelType} ({toDisplayCount(statusFuelCounts[fuelType] ?? 0)})
                      </button>
                    ))}
                  </div>
                )}

                <div className="summary">
                  <div className="schip">
                    <span className="ic"><Icon name="admin" size={16} strokeWidth={2} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(statusSummary.filteredEntries)}</div>
                      <div className="l">Filtered entries</div>
                    </div>
                  </div>

                  <div className="schip">
                    <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(statusSummary.srType)}</div>
                      <div className="l">SR Type</div>
                    </div>
                  </div>

                  <div className="schip">
                    <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(statusSummary.jobCard)}</div>
                      <div className="l">Job Card</div>
                    </div>
                  </div>

                  <div className="schip">
                    <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(statusSummary.estimate)}</div>
                      <div className="l">Estimate</div>
                    </div>
                  </div>

                  <div className="schip">
                    <span className="ic schip__ic--warn"><Icon name="doc" size={16} strokeWidth={2} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(statusSummary.invoice)}</div>
                      <div className="l">Invoice</div>
                    </div>
                  </div>

                  <div className="schip">
                    <span className="ic"><Icon name="checksm" size={16} strokeWidth={2.4} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(statusSummary.completedCards)}</div>
                      <div className="l">Completed cards</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {canSeeFloorInchargeStatus && (
              <>
                {canSeeServiceAdvisorStatus && <div style={{ borderTop: '1px solid var(--border)', margin: '10px 0 14px' }} />}
                <div className="sub" style={{ marginBottom: 10 }}>Floor Incharge</div>

                <div className="toolbar toolbar--tight">
                  <span className="toolbar__label">Filter by location:</span>
                  <button
                    type="button"
                    onClick={() => setFloorStatusBranchFilter('all')}
                    className={`btn btn--sm ${floorStatusBranchFilter === 'all' ? 'btn--primary' : 'btn--ghost'}`}
                  >
                    All ({toDisplayCount(floorStatusRows.length)})
                  </button>
                  {floorStatusBranches.map((branch) => (
                    <button
                      key={branch}
                      type="button"
                      onClick={() => setFloorStatusBranchFilter(branch)}
                      className={`btn btn--sm ${floorStatusBranchFilter === branch ? 'btn--primary' : 'btn--ghost'}`}
                    >
                      {branch} ({toDisplayCount(floorStatusBranchCounts[branch] ?? 0)})
                    </button>
                  ))}
                </div>

                <div className="summary" style={{ marginBottom: 0 }}>
                  <div className="schip">
                    <span className="ic"><Icon name="floor" size={16} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(floorStatusSummary.jobCards)}</div>
                      <div className="l">Job cards</div>
                    </div>
                  </div>

                  <div className="schip warn">
                    <span className="ic"><Icon name="clock" size={16} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(floorStatusSummary.unassigned)}</div>
                      <div className="l">Unassigned</div>
                    </div>
                  </div>

                  <div className="schip">
                    <span className="ic"><Icon name="checksm" size={16} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(floorStatusSummary.assigned)}</div>
                      <div className="l">Assigned</div>
                    </div>
                  </div>

                  <div className="schip warn">
                    <span className="ic"><Icon name="clock" size={16} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(floorStatusSummary.hold)}</div>
                      <div className="l">Hold</div>
                    </div>
                  </div>

                  <div className="schip">
                    <span className="ic"><Icon name="checksm" size={16} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(floorStatusSummary.inProcess)}</div>
                      <div className="l">In-Process</div>
                    </div>
                  </div>

                  <div className="schip">
                    <span className="ic"><Icon name="checksm" size={16} /></span>
                    <div>
                      <div className="n">{statusLoading ? '...' : toDisplayCount(floorStatusSummary.completed)}</div>
                      <div className="l">Completed</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className={canSeeStatusSection ? 'grid-2 card--mt-gap' : 'grid-2'}>
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
