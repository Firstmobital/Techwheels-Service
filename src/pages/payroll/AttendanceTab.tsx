import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchAttendanceForMonth,
  fetchCompensationMap,
  fetchPayrollEmployees,
  fetchPayrollMonth,
  saveAttendance,
} from '../../lib/api/payroll'
import { calcEarnedBaseSalary, formatCurrency } from '../../lib/payroll/calculations'
import { exportWorkbook, previewAttendanceImport, readWorkbookRows } from '../../lib/payroll/excelUtils'
import { SALARY_TYPE_LABELS } from '../../lib/payroll/types'
import type { ImportPreviewResult } from '../../lib/payroll/types'

interface Props {
  payrollMonth: string
  monthInput: string
  onMonthChange: (value: string) => void
  canModify: boolean
}

export default function AttendanceTab({ payrollMonth, monthInput, onMonthChange, canModify }: Props) {
  const [employees, setEmployees] = useState<Awaited<ReturnType<typeof fetchPayrollEmployees>>>([])
  const [compMap, setCompMap] = useState<Awaited<ReturnType<typeof fetchCompensationMap>>>(new Map())
  const [attendanceMap, setAttendanceMap] = useState<Awaited<ReturnType<typeof fetchAttendanceForMonth>>>(new Map())
  const [locked, setLocked] = useState(false)
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [salaryTypeFilter, setSalaryTypeFilter] = useState('all')
  const [draftDays, setDraftDays] = useState<Record<string, string>>({})
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({})
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [emps, comp, att, monthState] = await Promise.all([
        fetchPayrollEmployees(),
        fetchCompensationMap(),
        fetchAttendanceForMonth(payrollMonth),
        fetchPayrollMonth(payrollMonth),
      ])
      setEmployees(emps.filter((e) => comp.has(e.employee_code.trim().toUpperCase())))
      setCompMap(comp)
      setAttendanceMap(att)
      setLocked(monthState?.status === 'finalized')
      const days: Record<string, string> = {}
      const notes: Record<string, string> = {}
      emps.forEach((e) => {
        const code = e.employee_code.trim().toUpperCase()
        const row = att.get(code)
        days[code] = row ? String(row.payable_days) : ''
        notes[code] = row?.notes ?? ''
      })
      setDraftDays(days)
      setDraftNotes(notes)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance')
    }
  }, [payrollMonth])

  useEffect(() => { void reload() }, [reload])

  const depts = useMemo(() => Array.from(new Set(employees.map((e) => e.department?.trim()).filter(Boolean))).sort(), [employees])
  const branches = useMemo(() => Array.from(new Set(employees.map((e) => e.location?.trim()).filter(Boolean))).sort(), [employees])

  const filtered = useMemo(() => employees.filter((e) => {
    const code = e.employee_code.trim().toUpperCase()
    const comp = compMap.get(code)
    if (!comp) return false
    if (search && !`${e.employee_name} ${e.employee_code}`.toLowerCase().includes(search.toLowerCase())) return false
    if (deptFilter !== 'all' && (e.department?.trim() ?? '') !== deptFilter) return false
    if (branchFilter !== 'all' && (e.location?.trim() ?? '') !== branchFilter) return false
    if (salaryTypeFilter !== 'all' && comp.salary_type !== salaryTypeFilter) return false
    return true
  }), [employees, compMap, search, deptFilter, branchFilter, salaryTypeFilter])

  async function handleSave(code: string) {
    if (!canModify || locked) return
    setSavingCode(code)
    setError(null)
    try {
      const payableDays = Number(draftDays[code])
      await saveAttendance(code, payrollMonth, payableDays, draftNotes[code]?.trim() || null)
      await reload()
      setMessage(`Saved attendance for ${code}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSavingCode(null)
    }
  }

  function handleExport() {
    const headers = ['Payroll Month', 'Employee Code', 'Employee Name', 'Department', 'Branch', 'Salary Type', 'Base Salary', 'Payable Days', 'Notes']
    const rows = filtered.map((e) => {
      const code = e.employee_code.trim().toUpperCase()
      const comp = compMap.get(code)!
      const att = attendanceMap.get(code)
      return [
        payrollMonth.slice(0, 7),
        code,
        e.employee_name,
        e.department ?? '',
        e.location ?? '',
        SALARY_TYPE_LABELS[comp.salary_type],
        comp.base_salary,
        att?.payable_days ?? '',
        att?.notes ?? '',
      ]
    })
    exportWorkbook('Attendance', headers, rows, `Payroll_Attendance_${monthInput}.xlsx`)
  }

  async function handleImportFile(file: File) {
    const rows = await readWorkbookRows(file)
    const knownCodes = new Set(employees.map((e) => e.employee_code.trim().toUpperCase()))
    const existing = new Map<string, { payable_days: number; notes: string | null }>()
    attendanceMap.forEach((v, k) => existing.set(k, { payable_days: v.payable_days, notes: v.notes }))
    setImportPreview(previewAttendanceImport(rows, { payrollMonth, knownCodes, existing }))
  }

  async function commitImport() {
    if (!importPreview || !canModify || locked) return
    for (const row of importPreview.rows) {
      if (row.status !== 'valid' && row.status !== 'warning') continue
      const data = row.data as { payable_days: number; notes?: string }
      await saveAttendance(row.employeeCode, payrollMonth, data.payable_days, data.notes ?? null)
    }
    setImportPreview(null)
    await reload()
    setMessage('Attendance import committed')
  }

  async function fill30Days() {
    if (!canModify || locked) return
    if (!window.confirm('Fill 30 payable days for all visible employees without existing attendance?')) return
    for (const e of filtered) {
      const code = e.employee_code.trim().toUpperCase()
      if (attendanceMap.has(code)) continue
      await saveAttendance(code, payrollMonth, 30, null)
    }
    await reload()
    setMessage('Filled 30 days for employees without attendance')
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Month</label>
        <input type="month" value={monthInput} onChange={(ev) => onMonthChange(ev.target.value)} style={{ padding: '0.3rem 0.5rem' }} />
        <input placeholder="Search employee…" value={search} onChange={(ev) => setSearch(ev.target.value)} style={{ padding: '0.3rem 0.5rem', minWidth: '160px' }} />
        <select value={deptFilter} onChange={(ev) => setDeptFilter(ev.target.value)}><option value="all">All departments</option>{depts.map((d) => <option key={d} value={d!}>{d}</option>)}</select>
        <select value={branchFilter} onChange={(ev) => setBranchFilter(ev.target.value)}><option value="all">All branches</option>{branches.map((b) => <option key={b} value={b!}>{b}</option>)}</select>
        <select value={salaryTypeFilter} onChange={(ev) => setSalaryTypeFilter(ev.target.value)}>
          <option value="all">All salary types</option>
          <option value="base">Base Salary</option>
          <option value="variable">Variable Salary</option>
          <option value="both">Base + Variable</option>
        </select>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void handleExport()}>Export Excel</button>
        {canModify && !locked && (
          <>
            <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
              Import Excel
              <input type="file" accept=".xlsx,.xls" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void handleImportFile(f) }} />
            </label>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void fill30Days()}>Fill 30 Days</button>
          </>
        )}
      </div>

      {locked && <div className="toast error">This payroll month is finalized — attendance edits are locked.</div>}
      {error && <div className="toast error">{error}</div>}
      {message && <div className="toast">{message}</div>}

      {importPreview && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <strong>Import preview</strong>
          <div style={{ fontSize: '0.78rem', margin: '0.35rem 0' }}>
            Total: {importPreview.totalRows} · Valid: {importPreview.valid} · Updates: {importPreview.updates} · Unchanged: {importPreview.unchanged} · Warnings: {importPreview.warnings} · Rejected: {importPreview.rejected}
          </div>
          <div style={{ maxHeight: '180px', overflow: 'auto', fontSize: '0.75rem' }}>
            {importPreview.rows.filter((r) => r.status === 'rejected' || r.status === 'warning').slice(0, 20).map((r) => (
              <div key={r.rowNumber}>{r.rowNumber}: {r.employeeCode || '—'} — {r.status}: {r.message}</div>
            ))}
          </div>
          {canModify && !locked && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void commitImport()}>Commit valid rows</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImportPreview(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ fontSize: '0.78rem', width: '100%' }}>
          <thead>
            <tr>
              <th>Code</th><th>Name</th><th>Dept</th><th>Branch</th><th>Salary Type</th><th>Base</th>
              <th>Payable Days</th><th>Est. Earned Base</th><th>Notes</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const code = e.employee_code.trim().toUpperCase()
              const comp = compMap.get(code)!
              const payable = Number(draftDays[code] ?? 0)
              const earned = comp.salary_type === 'variable' ? 0 : calcEarnedBaseSalary(Number(comp.base_salary), payable)
              const saved = attendanceMap.get(code)
              return (
                <tr key={code}>
                  <td>{code}</td>
                  <td>{e.employee_name}</td>
                  <td>{e.department ?? '—'}</td>
                  <td>{e.location ?? '—'}</td>
                  <td>{SALARY_TYPE_LABELS[comp.salary_type]}</td>
                  <td>{formatCurrency(Number(comp.base_salary))}</td>
                  <td>
                    <input
                      type="number" step="0.5" min={0} max={30}
                      value={draftDays[code] ?? ''}
                      disabled={!canModify || locked}
                      onChange={(ev) => setDraftDays((prev) => ({ ...prev, [code]: ev.target.value }))}
                      style={{ width: '70px' }}
                    />
                  </td>
                  <td>{formatCurrency(earned)}</td>
                  <td>
                    <input
                      value={draftNotes[code] ?? ''}
                      disabled={!canModify || locked}
                      onChange={(ev) => setDraftNotes((prev) => ({ ...prev, [code]: ev.target.value }))}
                      style={{ width: '120px' }}
                    />
                  </td>
                  <td>
                    {canModify && !locked && (
                      <button type="button" className="btn btn--sm btn--primary" disabled={savingCode === code} onClick={() => void handleSave(code)}>
                        {savingCode === code ? '…' : saved ? 'Update' : 'Save'}
                      </button>
                    )}
                    {saved && <span style={{ marginLeft: '0.35rem', color: '#16a34a' }}>Saved</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
