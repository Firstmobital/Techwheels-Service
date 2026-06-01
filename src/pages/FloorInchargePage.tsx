import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { listReceptionEntries, type ReceptionEntryRow } from '../lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JobCard {
  id: number
  job_card_number: string
  branch: string
  status: string | null
  vehicle_registration_number: string | null
  sr_type: string | null
  sr_assigned_to: string | null
  created_date_time: string | null
  open_for_days: number | null
  product_line: string | null
  chassis_number: string | null
}

function calculateOpenDays(createdAt: string | null): number | null {
  if (!createdAt) return null
  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null

  const diffMs = Date.now() - created.getTime()
  if (diffMs < 0) return 0

  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

function mapReceptionRowToJobCard(row: ReceptionEntryRow): JobCard {
  return {
    id: row.id,
    job_card_number: row.jc_number?.trim() || `RECEPTION-${row.id}`,
    branch: row.branch?.trim() || '—',
    status: null,
    vehicle_registration_number: row.reg_number ?? null,
    sr_type: row.service_type ?? null,
    sr_assigned_to: row.sa_name ?? null,
    created_date_time: row.created_at ?? null,
    open_for_days: calculateOpenDays(row.created_at ?? null),
    product_line: row.model ?? null,
    chassis_number: null,
  }
}

interface Employee {
  id: number
  employee_code: string
  employee_name: string
  department: string
  location: string
}

interface TechnicianAssignment {
  id?: number
  job_card_number: string
  technician_code: string
  technician_name: string
  assigned_at: string
  assigned_by: string | null
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FloorInchargePage() {
  const [jobCards, setJobCards] = useState<JobCard[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [assignments, setAssignments] = useState<Record<string, TechnicianAssignment>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [branchFilter, setBranchFilter] = useState('All')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    try {
      const [receptionRes, empRes] = await Promise.all([
        listReceptionEntries(),
        supabase
          .from('employee_master')
          .select('id, employee_code, employee_name, department, location')
          .eq('department', 'Service')
          .order('employee_name'),
      ])

      const receptionRows = receptionRes.error || !receptionRes.data
        ? []
        : receptionRes.data.map(mapReceptionRowToJobCard)

      setJobCards(receptionRows)
      setEmployees(empRes.data ?? [])

      // Try to fetch assignments — graceful fallback if table doesn't exist yet
      const assignRes = await supabase.from('technician_assignments').select('*')
      if (!assignRes.error && assignRes.data) {
        const assignMap: Record<string, TechnicianAssignment> = {}
        for (const a of assignRes.data as TechnicianAssignment[]) {
          assignMap[a.job_card_number] = a
        }
        setAssignments(assignMap)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  async function assignTechnician(jobCardNumber: string, employeeCode: string) {
    setSaving(jobCardNumber)
    try {
      const emp = employees.find((e) => e.employee_code === employeeCode)
      if (!emp) return

      const { data: { user } } = await supabase.auth.getUser()
      const payload: Omit<TechnicianAssignment, 'id'> = {
        job_card_number: jobCardNumber,
        technician_code: emp.employee_code,
        technician_name: emp.employee_name,
        assigned_at: new Date().toISOString(),
        assigned_by: user?.email ?? null,
      }

      const existing = assignments[jobCardNumber]
      let result
      if (existing?.id) {
        result = await supabase
          .from('technician_assignments')
          .update(payload)
          .eq('id', existing.id)
          .select()
          .single()
      } else {
        result = await supabase
          .from('technician_assignments')
          .insert(payload)
          .select()
          .single()
      }

      if (result.error) throw result.error

      setAssignments((prev) => ({
        ...prev,
        [jobCardNumber]: result.data as TechnicianAssignment,
      }))

      showToast(`Technician assigned to ${jobCardNumber}`, 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assign technician'
      showToast(msg, 'error')
    } finally {
      setSaving(null)
    }
  }

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const branches = useMemo(() => {
    const b = new Set(jobCards.map((j) => j.branch).filter(Boolean))
    return ['All', ...Array.from(b).sort()]
  }, [jobCards])

  const filtered = useMemo(() => {
    return jobCards.filter((jc) => {
      const matchBranch = branchFilter === 'All' || jc.branch === branchFilter
      const q = search.toLowerCase()
      const matchSearch =
        !q ||
        jc.job_card_number?.toLowerCase().includes(q) ||
        (jc.vehicle_registration_number ?? '').toLowerCase().includes(q) ||
        (jc.chassis_number ?? '').toLowerCase().includes(q) ||
        (jc.sr_type ?? '').toLowerCase().includes(q)
      return matchBranch && matchSearch
    })
  }, [jobCards, search, branchFilter])

  const assignedCount = filtered.filter((jc) => !!assignments[jc.job_card_number]).length
  const unassignedCount = filtered.length - assignedCount

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white transition-all ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Floor Incharge</h1>
            <p className="text-sm text-gray-500 mt-0.5">Assign technicians to open job cards</p>
          </div>
          <button
            onClick={fetchAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-4">
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg">
            <span className="text-2xl font-bold text-blue-700">{filtered.length}</span>
            <span className="text-xs text-blue-600">Total Job Cards</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg">
            <span className="text-2xl font-bold text-green-700">{assignedCount}</span>
            <span className="text-xs text-green-600">Assigned</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
            <span className="text-2xl font-bold text-amber-700">{unassignedCount}</span>
            <span className="text-xs text-amber-600">Unassigned</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search job card, reg. no, chassis…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {branches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
            <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading job cards…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No job cards found.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Job Card No.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Branch</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle Reg.</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">SR Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Open Days</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Line</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-56">Assign Technician</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((jc) => {
                  const assignment = assignments[jc.job_card_number]
                  const isSaving = saving === jc.job_card_number
                  return (
                    <tr key={jc.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-blue-700 whitespace-nowrap">
                        {jc.job_card_number}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{jc.branch}</td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {jc.vehicle_registration_number || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {jc.sr_type ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                            {jc.sr_type}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {jc.open_for_days != null ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            jc.open_for_days > 5 ? 'bg-red-50 text-red-700' :
                            jc.open_for_days > 2 ? 'bg-amber-50 text-amber-700' :
                            'bg-green-50 text-green-700'
                          }`}>
                            {jc.open_for_days}d
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs max-w-[140px] truncate" title={jc.product_line ?? ''}>
                        {jc.product_line || '—'}
                      </td>
                      <td className="px-4 py-3 w-56">
                        <select
                          value={assignment?.technician_code ?? ''}
                          onChange={(e) => assignTechnician(jc.job_card_number, e.target.value)}
                          disabled={isSaving}
                          className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:opacity-50"
                        >
                          <option value="">— Select Technician —</option>
                          {employees.map((emp) => (
                            <option key={emp.employee_code} value={emp.employee_code}>
                              {emp.employee_name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        {isSaving ? (
                          <span className="text-xs text-gray-400 flex items-center gap-1">
                            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Saving…
                          </span>
                        ) : assignment ? (
                          <span className="flex items-center gap-1 text-xs text-green-700 font-medium">
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                            Assigned
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600 font-medium">Pending</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
