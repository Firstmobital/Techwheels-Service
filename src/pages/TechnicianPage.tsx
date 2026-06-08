import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { supabase } from '../lib/supabase'

type TechnicianAssignmentRow = {
  id: number
  job_card_number: string
  technician_code: string
  technician_name: string
  assigned_at: string
  assigned_by: string | null
  bay_no: string | null
  work_status: string | null
  out_ts: string | null
  time_diff: string | null
  remark: string | null
  reg_number?: string | null
  technician_income?: number
}

type RevenueRow = {
  job_card_number: string | null
  closed_date_time: string | null
  invoice_date: string | null
  final_labour_amount: number | string | null
}

type ReceptionEntryRow = {
  jc_number: string | null
  reg_number: string | null
}

type IncomeDayRow = {
  date: string
  jobsCount: number
  grossRevenue: number
  netBeforeShare: number
  technicianIncome: number
}

type TechnicianSummaryCard = {
  code: string
  name: string
  rowCount: number
  dayCount: number
  totalIncome: number
}

type DayWiseCard = {
  dateKey: string
  label: string
  rowCount: number
  completedCount: number
  totalIncome: number
}

type VehicleOnDayCard = {
  regKey: string
  label: string
  rowCount: number
  completedCount: number
  totalIncome: number
}

const QUERY_PAGE_SIZE = 1000

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

function normalizeStatus(status: string | null | undefined): string {
  const normalized = String(status ?? '').trim().toLowerCase()
  if (!normalized) return 'work_inprocess'
  if (normalized === 'work inprocess') return 'work_inprocess'
  return normalized
}

function statusLabel(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'hold') return 'Hold'
  return 'Work Inprocess'
}

function statusPill(status: string | null | undefined): string {
  const normalized = normalizeStatus(status)
  if (normalized === 'completed') return 'g'
  if (normalized === 'hold') return 'w'
  return 'b'
}

function extractFuelFromBay(bayNo: string | null | undefined): 'PV' | 'EV' | null {
  const normalized = String(bayNo ?? '').trim().toUpperCase()
  if (normalized.startsWith('PV-')) return 'PV'
  if (normalized.startsWith('EV-')) return 'EV'
  return null
}

function parseRevenueAmount(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (value == null) return 0

  const raw = String(value).trim()
  if (!raw) return 0

  const isParenthesizedNegative = raw.startsWith('(') && raw.endsWith(')')
  const cleaned = raw
    .replace(/[₹,]/g, '')
    .replace(/\bRS\.?\b/gi, '')
    .replace(/\s+/g, '')
    .replace(/[()]/g, '')

  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return 0
  return isParenthesizedNegative ? -parsed : parsed
}

function getIncomeDateKey(assignment: TechnicianAssignmentRow, revenue: RevenueRow): string | null {
  const source =
    revenue.closed_date_time ??
    revenue.invoice_date ??
    assignment.out_ts ??
    assignment.assigned_at

  if (!source) return null

  const parsedDate = new Date(source)
  if (Number.isNaN(parsedDate.getTime())) return null
  return parsedDate.toISOString().slice(0, 10)
}

export default function TechnicianPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<TechnicianAssignmentRow[]>([])
  const [technicianCodes, setTechnicianCodes] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [selectedTechnicianCode, setSelectedTechnicianCode] = useState('')
  const [selectedDayKey, setSelectedDayKey] = useState('')
  const [selectedVehicleOnDayKey, setSelectedVehicleOnDayKey] = useState('')

  async function loadData() {
    setLoading(true)
    setError(null)

    try {
      const authRes = await supabase.auth.getUser()
      const userId = authRes.data.user?.id
      if (!userId) {
        setAssignments([])
        setTechnicianCodes([])
        setSelectedTechnicianCode('')
        setSelectedDayKey('')
        setSelectedVehicleOnDayKey('')
        setIsAdmin(false)
        setLoading(false)
        return
      }

      const profileRes = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      const userIsAdmin = String((profileRes.data as { role?: string | null } | null)?.role ?? '').trim().toLowerCase() === 'admin'
      setIsAdmin(userIsAdmin)

      const assignmentRows: TechnicianAssignmentRow[] = []
      let from = 0

      while (true) {
        let assignQuery = supabase
          .from('technician_assignments')
          .select('*')
          .order('assigned_at', { ascending: false })
          .range(from, from + QUERY_PAGE_SIZE - 1)

        const assignRes = await assignQuery

        if (assignRes.error) {
          setError(assignRes.error.message)
          setAssignments([])
          setLoading(false)
          return
        }

        const batch = (assignRes.data ?? []) as TechnicianAssignmentRow[]
        assignmentRows.push(...batch)

        if (batch.length < QUERY_PAGE_SIZE) {
          break
        }

        from += QUERY_PAGE_SIZE
      }

      const visibleTechnicianCodes = Array.from(new Set(
        assignmentRows
          .map((row) => String(row.technician_code ?? '').trim().toUpperCase())
          .filter(Boolean),
      ))
      setTechnicianCodes(visibleTechnicianCodes)

      const assignmentJcNumbers = Array.from(new Set(
        assignmentRows
          .map((row) => String(row.job_card_number ?? '').trim().toUpperCase())
          .filter(Boolean),
      ))

      // Get completed assignments to query revenue data
      const completedMap = new Map<string, TechnicianAssignmentRow>()
      assignmentRows
        .filter((row) => normalizeStatus(row.work_status) === 'completed')
        .forEach((row) => {
          const jc = String(row.job_card_number ?? '').trim().toUpperCase()
          if (!jc) return

          const existing = completedMap.get(jc)
          if (!existing) {
            completedMap.set(jc, row)
            return
          }

          const existingTs = new Date(existing.out_ts ?? existing.assigned_at ?? 0).getTime()
          const candidateTs = new Date(row.out_ts ?? row.assigned_at ?? 0).getTime()
          if (candidateTs > existingTs) {
            completedMap.set(jc, row)
          }
        })

      const completed = Array.from(completedMap.values())
      const completedJcNumbers = Array.from(new Set(
        completed
          .map((row) => String(row.job_card_number ?? '').trim().toUpperCase())
          .filter(Boolean),
      ))

      // Fetch from service_reception_entries (same source as Floor Incharge page)
      let regNumberMap = new Map<string, string>()
      let revenueMap = new Map<string, RevenueRow>()

      if (assignmentJcNumbers.length > 0) {
        const receptionRes = await supabase
          .from('service_reception_entries')
          .select('jc_number, reg_number')
          .in('jc_number', assignmentJcNumbers)

        if (!receptionRes.error && receptionRes.data) {
          ;(receptionRes.data ?? []).forEach((row: any) => {
            const key = String((row as { jc_number?: string | null }).jc_number ?? '').trim().toUpperCase()
            if (!key) return

            const regNum = String((row as ReceptionEntryRow).reg_number ?? '').trim()
            if (regNum && !regNumberMap.has(key)) {
              regNumberMap.set(key, regNum)
            }
          })
        }
      }

      if (completedJcNumbers.length > 0) {
        const revenueRes = await supabase
          .from('job_card_closed_data')
          .select('job_card_number, closed_date_time, invoice_date, final_labour_amount')
          .in('job_card_number', completedJcNumbers)

        if (revenueRes.error) {
          setError(revenueRes.error.message)
          setLoading(false)
          return
        }

        ;(revenueRes.data ?? []).forEach((row: any) => {
          const key = String((row as { job_card_number?: string | null }).job_card_number ?? '').trim().toUpperCase()
          if (!key) return

          const existing = revenueMap.get(key)
          const candidate = row as RevenueRow
          if (!existing) {
            revenueMap.set(key, candidate)
          } else {
            const existingTs = new Date(existing.closed_date_time ?? existing.invoice_date ?? 0).getTime()
            const candidateTs = new Date(candidate.closed_date_time ?? candidate.invoice_date ?? 0).getTime()
            if (candidateTs > existingTs) {
              revenueMap.set(key, candidate)
            }
          }
        })

      }

      // Add reg_number to assignment rows
      const incomeByJc = new Map<string, number>()

      completed.forEach((assignment) => {
        const jc = String(assignment.job_card_number ?? '').trim().toUpperCase()
        if (!jc) return
        const revenue = revenueMap.get(jc)
        if (!revenue) return

        const gross = parseRevenueAmount(revenue.final_labour_amount)
        if (!Number.isFinite(gross) || gross <= 0) return

        const dateKey = getIncomeDateKey(assignment, revenue)
        if (!dateKey) return

        const fuel = extractFuelFromBay(assignment.bay_no)
        const shareRate = fuel === 'EV' ? 0.25 : 0.2
        const netBeforeShare = gross / 1.18
        const technicianIncome = netBeforeShare * shareRate

        incomeByJc.set(jc, technicianIncome)
      })

      const enrichedAssignmentRows = assignmentRows.map((row) => {
        const jc = String(row.job_card_number ?? '').trim().toUpperCase()
        return {
          ...row,
          reg_number: regNumberMap.get(jc) ?? null,
          technician_income: incomeByJc.get(jc) ?? 0,
        }
      })
      setAssignments(enrichedAssignmentRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load technician data')
      setAssignments([])
      setTechnicianCodes([])
      setSelectedTechnicianCode('')
      setSelectedDayKey('')
      setSelectedVehicleOnDayKey('')
      setIsAdmin(false)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const technicianCards = useMemo<TechnicianSummaryCard[]>(() => {
    const byTechnician = new Map<string, TechnicianSummaryCard & { days: Set<string> }>()

    assignments.forEach((row) => {
      const code = String(row.technician_code ?? '').trim().toUpperCase()
      if (!code) return

      const name = String(row.technician_name ?? '').trim() || code
      const dateSource = row.out_ts ?? row.assigned_at ?? ''
      const dateKey = dateSource ? new Date(dateSource).toISOString().slice(0, 10) : 'unknown'
      
      const existing = byTechnician.get(code) ?? {
        code,
        name,
        rowCount: 0,
        dayCount: 0,
        totalIncome: 0,
        days: new Set<string>(),
      }

      existing.rowCount += 1
      existing.totalIncome += Number(row.technician_income ?? 0)
      existing.days.add(dateKey)
      existing.dayCount = existing.days.size
      byTechnician.set(code, existing)
    })

    return Array.from(byTechnician.values())
      .map(({ days: _days, ...card }) => card)
      .sort((a, b) => {
        if (b.totalIncome !== a.totalIncome) return b.totalIncome - a.totalIncome
        return b.rowCount - a.rowCount
      })
  }, [assignments])

  useEffect(() => {
    if (technicianCards.length === 0) {
      if (selectedTechnicianCode) setSelectedTechnicianCode('')
      return
    }

    const hasSelected = technicianCards.some((card) => card.code === selectedTechnicianCode)
    if (!hasSelected && selectedTechnicianCode) {
      setSelectedTechnicianCode('')
      setSelectedDayKey('')
    }
  }, [selectedTechnicianCode, technicianCards])

  const selectedTechnicianName = useMemo(() => {
    const selected = technicianCards.find((card) => card.code === selectedTechnicianCode)
    return selected?.name ?? ''
  }, [selectedTechnicianCode, technicianCards])

  const selectedTechnicianRows = useMemo(() => {
    const code = String(selectedTechnicianCode ?? '').trim().toUpperCase()
    if (!code) return []
    return assignments.filter((row) => String(row.technician_code ?? '').trim().toUpperCase() === code)
  }, [assignments, selectedTechnicianCode])

  const dayCards = useMemo<DayWiseCard[]>(() => {
    const byDay = new Map<string, DayWiseCard>()

    selectedTechnicianRows.forEach((row) => {
      const dateSource = row.out_ts ?? row.assigned_at ?? ''
      const dateKey = dateSource ? new Date(dateSource).toISOString().slice(0, 10) : 'unknown'
      const label = dateKey === 'unknown' ? 'No date' : new Date(dateKey).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: '2-digit' })

      const existing = byDay.get(dateKey) ?? {
        dateKey,
        label,
        rowCount: 0,
        completedCount: 0,
        totalIncome: 0,
      }

      existing.rowCount += 1
      existing.totalIncome += Number(row.technician_income ?? 0)
      if (normalizeStatus(row.work_status) === 'completed') {
        existing.completedCount += 1
      }

      byDay.set(dateKey, existing)
    })

    return Array.from(byDay.values()).sort((a, b) => {
      if (a.dateKey === 'unknown') return 1
      if (b.dateKey === 'unknown') return -1
      return b.dateKey.localeCompare(a.dateKey)
    })
  }, [selectedTechnicianRows])

  useEffect(() => {
    if (dayCards.length === 0) {
      if (selectedDayKey) setSelectedDayKey('')
      return
    }

    const hasSelected = dayCards.some((card) => card.dateKey === selectedDayKey)
    if (!hasSelected && selectedDayKey) {
      setSelectedDayKey('')
    }
  }, [selectedDayKey, dayCards])

  const dayRowsForSelectedDay = useMemo(() => {
    if (!selectedDayKey) return []
    return selectedTechnicianRows.filter((row) => {
      const dateSource = row.out_ts ?? row.assigned_at ?? ''
      const dateKey = dateSource ? new Date(dateSource).toISOString().slice(0, 10) : 'unknown'
      return dateKey === selectedDayKey
    })
  }, [selectedTechnicianRows, selectedDayKey])

  const vehicleOnDayCards = useMemo<VehicleOnDayCard[]>(() => {
    const byVehicle = new Map<string, VehicleOnDayCard>()

    dayRowsForSelectedDay.forEach((row) => {
      const reg = String(row.reg_number ?? '').trim().toUpperCase()
      const jc = String(row.job_card_number ?? '').trim().toUpperCase()
      const regKey = reg || `UNREG-${jc}`
      const label = reg || `No Reg (${jc})`

      const existing = byVehicle.get(regKey) ?? {
        regKey,
        label,
        rowCount: 0,
        completedCount: 0,
        totalIncome: 0,
      }

      existing.rowCount += 1
      existing.totalIncome += Number(row.technician_income ?? 0)
      if (normalizeStatus(row.work_status) === 'completed') {
        existing.completedCount += 1
      }

      byVehicle.set(regKey, existing)
    })

    return Array.from(byVehicle.values()).sort((a, b) => {
      if (b.totalIncome !== a.totalIncome) return b.totalIncome - a.totalIncome
      return b.rowCount - a.rowCount
    })
  }, [dayRowsForSelectedDay])

  useEffect(() => {
    if (vehicleOnDayCards.length === 0) {
      if (selectedVehicleOnDayKey) setSelectedVehicleOnDayKey('')
      return
    }

    const hasSelected = vehicleOnDayCards.some((card) => card.regKey === selectedVehicleOnDayKey)
    if (!hasSelected && selectedVehicleOnDayKey) {
      setSelectedVehicleOnDayKey('')
    }
  }, [selectedVehicleOnDayKey, vehicleOnDayCards])

  const finalRows = useMemo(() => {
    let rows = dayRowsForSelectedDay

    if (selectedVehicleOnDayKey) {
      rows = rows.filter((row) => {
        const reg = String(row.reg_number ?? '').trim().toUpperCase()
        const jc = String(row.job_card_number ?? '').trim().toUpperCase()
        const regKey = reg || `UNREG-${jc}`
        return regKey === selectedVehicleOnDayKey
      })
    }

    return rows.sort((a, b) => {
      const aTs = new Date(a.assigned_at ?? 0).getTime()
      const bTs = new Date(b.assigned_at ?? 0).getTime()
      return bTs - aTs
    })
  }, [dayRowsForSelectedDay, selectedVehicleOnDayKey])

  const totalIncome = useMemo(
    () => technicianCards.reduce((sum, row) => sum + row.totalIncome, 0),
    [technicianCards],
  )

  return (
    <div>
      <div className="pagehead">
        <div>
          <p className="greet">
            <Icon name="tech" size={13} className="icon-align-text" />
            Technician
          </p>
          <h1>Technician earnings tracker</h1>
          <p>Drill down: technician → vehicle → job card details (JC #, Reg, Bay, Status, IN/OUT TS, Time Diff, Remark).</p>
        </div>
      </div>

      {error && (
        <div className="toast error">
          <Icon name="alert" size={14} />
          {error}
        </div>
      )}

      {/* Summary chips */}
      <div className="summary">
        <div className="schip">
          <span className="ic">
            <Icon name="tech" size={16} />
          </span>
          <div>
            <div className="n">{technicianCards.length}</div>
            <div className="l">Technicians</div>
          </div>
        </div>
        <div className="schip">
          <span className="ic" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
            <Icon name="checksm" size={16} />
          </span>
          <div>
            <div className="n">{formatCurrency(totalIncome)}</div>
            <div className="l">Total earnings</div>
          </div>
        </div>
      </div>

      {/* Technician cards */}
      {!loading && technicianCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>Earnings by technician</h3>
              <div className="sub">Sorted highest to lowest. Income = (Labour ÷ 1.18) × 20% (PV) or 25% (EV).</div>
            </div>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid">
              {technicianCards.map((card) => (
                <button
                  key={card.code}
                  type="button"
                  className={`tech-drill-btn ${selectedTechnicianCode === card.code ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedTechnicianCode === card.code) {
                      setSelectedTechnicianCode('')
                      setSelectedDayKey('')
                    } else {
                      setSelectedTechnicianCode(card.code)
                      setSelectedDayKey('')
                    }
                  }}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.name}</div>
                    <div className="tech-drill-btn__code">{card.code}</div>
                  </div>
                  <div className="tech-drill-btn__value">{formatCurrency(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta">{card.dayCount} days • {card.rowCount} rows</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Day-wise cards */}
      {!loading && selectedTechnicianCode && dayCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>{selectedTechnicianName} — day-wise earnings</h3>
              <div className="sub">Select a day to view job card details.</div>
            </div>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid tech-drill-grid--sm">
              {dayCards.map((card) => (
                <button
                  key={card.dateKey}
                  type="button"
                  className={`tech-drill-btn ${selectedDayKey === card.dateKey ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedDayKey === card.dateKey) {
                      setSelectedDayKey('')
                    } else {
                      setSelectedDayKey(card.dateKey)
                    }
                  }}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.label}</div>
                  </div>
                  <div className="tech-drill-btn__value">{formatCurrency(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta">{card.rowCount} rows • {card.completedCount} done</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Vehicle-on-day cards */}
      {!loading && selectedDayKey && vehicleOnDayCards.length > 0 && (
        <div className="card mb-gap">
          <div className="card__head">
            <div>
              <h3>Vehicle-wise earnings for {dayCards.find((d) => d.dateKey === selectedDayKey)?.label}</h3>
              <div className="sub">Select a vehicle to view its job cards on this day.</div>
            </div>
          </div>
          <div className="card__body dense">
            <div className="tech-drill-grid tech-drill-grid--sm">
              {vehicleOnDayCards.map((card) => (
                <button
                  key={card.regKey}
                  type="button"
                  className={`tech-drill-btn ${selectedVehicleOnDayKey === card.regKey ? 'is-active' : ''}`}
                  onClick={() => {
                    if (selectedVehicleOnDayKey === card.regKey) {
                      setSelectedVehicleOnDayKey('')
                    } else {
                      setSelectedVehicleOnDayKey(card.regKey)
                    }
                  }}
                >
                  <div className="tech-drill-btn__hd">
                    <div className="tech-drill-btn__title">{card.label}</div>
                  </div>
                  <div className="tech-drill-btn__value">{formatCurrency(card.totalIncome)}</div>
                  <div className="tech-drill-btn__meta">{card.rowCount} rows • {card.completedCount} done</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Final JC rows */}
      {!loading && selectedTechnicianCode && (
        <div className="card">
          <div className="card__head">
            <div>
              <h3>Job card details</h3>
              <div className="sub">
                JC #, Reg #, Bay, Status, IN TS, OUT TS, Time Diff, Remark
                {selectedDayKey && ` — ${dayCards.find((d) => d.dateKey === selectedDayKey)?.label || 'selected day'}`}
                {selectedVehicleOnDayKey && ` — ${vehicleOnDayCards.find((v) => v.regKey === selectedVehicleOnDayKey)?.label || 'selected vehicle'}`}
              </div>
            </div>
          </div>
          <div className="card__body dense">
            {!selectedDayKey ? (
              <div className="empty-state">Select a day card above to view rows.</div>
            ) : finalRows.length === 0 ? (
              <div className="empty-state">{selectedVehicleOnDayKey ? 'No job card rows for this vehicle on this day.' : 'No job card rows for this day.'}</div>
            ) : (
              <div className="tbl-wrap scroll">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th className="mono">JC Number</th>
                      <th className="mono">Reg No</th>
                      <th>Bay No</th>
                      <th className="ctr">Status</th>
                      <th className="ts-cell">IN TS</th>
                      <th className="ts-cell">OUT TS</th>
                      <th className="ctr">Time Diff</th>
                      <th>Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    {finalRows.map((row) => (
                      <tr key={row.id}>
                        <td className="mono ts-cell">{row.job_card_number}</td>
                        <td className="mono ts-cell">{row.reg_number ?? '—'}</td>
                        <td className="type-cell">{row.bay_no ?? '—'}</td>
                        <td className="ctr">
                          <span className={`pill ${statusPill(row.work_status)}`}>
                            {statusLabel(row.work_status)}
                          </span>
                        </td>
                        <td className="ts-cell">{formatDateTime(row.assigned_at)}</td>
                        <td className="ts-cell">{formatDateTime(row.out_ts)}</td>
                        <td className="ctr ts-cell">{row.time_diff ?? '—'}</td>
                        <td className="remark-cell">{row.remark ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
