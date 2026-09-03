import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchCompensationMap, fetchPayrollEmployees, upsertCompensation } from '../../lib/api/payroll'
import { formatCurrency } from '../../lib/payroll/calculations'
import { exportWorkbookWithTextAccounts, previewSalaryTypeImport, readWorkbookRows } from '../../lib/payroll/excelUtils'
import { SALARY_TYPE_LABELS, type ImportPreviewResult, type SalaryType } from '../../lib/payroll/types'
import { supabase } from '../../lib/supabase'

interface Props {
  canModify: boolean
}

export default function SalaryTypeTab({ canModify }: Props) {
  const [employees, setEmployees] = useState<Awaited<ReturnType<typeof fetchPayrollEmployees>>>([])
  const [compMap, setCompMap] = useState<Awaited<ReturnType<typeof fetchCompensationMap>>>(new Map())
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [salaryTypeFilter, setSalaryTypeFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ImportPreviewResult | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newRow, setNewRow] = useState({ employeeCode: '', baseSalary: '', salaryType: 'base' as SalaryType })

  const reload = useCallback(async () => {
    const [emps, comp] = await Promise.all([fetchPayrollEmployees(), fetchCompensationMap()])
    setEmployees(emps)
    setCompMap(comp)
  }, [])

  useEffect(() => { void reload() }, [reload])

  const depts = useMemo(() => Array.from(new Set(employees.map((e) => e.department?.trim()).filter(Boolean))).sort(), [employees])
  const branches = useMemo(() => Array.from(new Set(employees.map((e) => e.location?.trim()).filter(Boolean))).sort(), [employees])

  const filtered = useMemo(() => employees.filter((e) => {
    const code = e.employee_code.trim().toUpperCase()
    const comp = compMap.get(code)
    if (search && !`${e.employee_name} ${e.employee_code}`.toLowerCase().includes(search.toLowerCase())) return false
    if (deptFilter !== 'all' && (e.department?.trim() ?? '') !== deptFilter) return false
    if (branchFilter !== 'all' && (e.location?.trim() ?? '') !== branchFilter) return false
    if (salaryTypeFilter !== 'all' && comp?.salary_type !== salaryTypeFilter) return false
    return true
  }), [employees, compMap, search, deptFilter, branchFilter, salaryTypeFilter])

  async function handleSaveComp(code: string, baseSalary: number, salaryType: SalaryType) {
    if (!canModify) return
    await upsertCompensation(code, baseSalary, salaryType)
    await reload()
    setMessage(`Saved compensation for ${code}`)
  }

  async function handleAddEmployee() {
    if (!canModify || !newRow.employeeCode) return
    const base = Number(newRow.baseSalary)
    if (!Number.isFinite(base) || base < 0) {
      setError('Invalid base salary')
      return
    }
    await upsertCompensation(newRow.employeeCode.trim().toUpperCase(), base, newRow.salaryType)
    setShowAdd(false)
    setNewRow({ employeeCode: '', baseSalary: '', salaryType: 'base' })
    await reload()
    setMessage('Employee added to payroll compensation')
  }

  function handleExport() {
    const headers = ['Employee Code', 'Employee Name', 'Department', 'Branch', 'Role', 'Base Salary', 'Salary Type', 'Bank Account Number', 'Bank Name', 'IFSC']
    const rows = filtered.map((e) => {
      const code = e.employee_code.trim().toUpperCase()
      const comp = compMap.get(code)
      return [
        code, e.employee_name, e.department ?? '', e.location ?? '', e.role ?? '',
        comp?.base_salary ?? 0,
        comp ? SALARY_TYPE_LABELS[comp.salary_type] : '',
        e.account_number ?? '', e.bank_name ?? '', e.ifsc ?? '',
      ]
    })
    exportWorkbookWithTextAccounts('Salary Type', headers, rows, `Payroll_Salary_Type_${new Date().toISOString().slice(0, 10)}.xlsx`, [7])
  }

  async function handleImportFile(file: File) {
    const rows = await readWorkbookRows(file)
    const knownCodes = new Set(employees.map((e) => e.employee_code.trim().toUpperCase()))
    const existing = new Map<string, { base_salary: number; salary_type: SalaryType }>()
    compMap.forEach((v, k) => existing.set(k, { base_salary: Number(v.base_salary), salary_type: v.salary_type }))
    setImportPreview(previewSalaryTypeImport(rows, { knownCodes, existing }))
  }

  async function commitImport() {
    if (!importPreview || !canModify) return
    for (const row of importPreview.rows) {
      if (row.status !== 'valid' && row.status !== 'warning') continue
      const data = row.data as {
        base_salary: number
        salary_type: SalaryType
        account_number?: string
        ifsc?: string
        bank_name?: string
      }
      await upsertCompensation(row.employeeCode, data.base_salary, data.salary_type)
      const bankUpdate: Record<string, string | null> = {}
      if (data.account_number !== undefined) bankUpdate.account_number = data.account_number || null
      if (data.ifsc !== undefined) bankUpdate.ifsc = data.ifsc || null
      if (data.bank_name !== undefined) bankUpdate.bank_name = data.bank_name || null
      if (Object.keys(bankUpdate).length > 0) {
        await supabase.from('employee_master').update(bankUpdate).eq('employee_code', row.employeeCode)
      }
    }
    setImportPreview(null)
    await reload()
    setMessage('Salary type import committed')
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem', alignItems: 'center' }}>
        <input placeholder="Search employee…" value={search} onChange={(ev) => setSearch(ev.target.value)} />
        <select value={deptFilter} onChange={(ev) => setDeptFilter(ev.target.value)}><option value="all">All departments</option>{depts.map((d) => <option key={d} value={d!}>{d}</option>)}</select>
        <select value={branchFilter} onChange={(ev) => setBranchFilter(ev.target.value)}><option value="all">All branches</option>{branches.map((b) => <option key={b} value={b!}>{b}</option>)}</select>
        <select value={salaryTypeFilter} onChange={(ev) => setSalaryTypeFilter(ev.target.value)}>
          <option value="all">All salary types</option>
          <option value="base">Base Salary</option>
          <option value="variable">Variable Salary</option>
          <option value="both">Base + Variable</option>
        </select>
        <span style={{ flex: 1 }} />
        {canModify && <button type="button" className="btn btn--primary btn--sm" onClick={() => setShowAdd(true)}>+ Add Employee</button>}
        <button type="button" className="btn btn--ghost btn--sm" onClick={handleExport}>Export Excel</button>
        {canModify && (
          <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
            Import Excel
            <input type="file" accept=".xlsx,.xls" hidden onChange={(ev) => { const f = ev.target.files?.[0]; if (f) void handleImportFile(f) }} />
          </label>
        )}
      </div>

      {error && <div className="toast error">{error}</div>}
      {message && <div className="toast">{message}</div>}

      {importPreview && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <strong>Import preview</strong>
          <div style={{ fontSize: '0.78rem', margin: '0.35rem 0' }}>
            Total: {importPreview.totalRows} · Valid: {importPreview.valid} · Updates: {importPreview.updates} · Unchanged: {importPreview.unchanged} · Warnings: {importPreview.warnings} · Rejected: {importPreview.rejected}
          </div>
          {canModify && (
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn--primary btn--sm" onClick={() => void commitImport()}>Commit valid rows</button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setImportPreview(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <h4 style={{ margin: '0 0 0.5rem' }}>Add Employee to Payroll</h4>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <select value={newRow.employeeCode} onChange={(ev) => setNewRow((p) => ({ ...p, employeeCode: ev.target.value }))}>
              <option value="">Select from employee master…</option>
              {employees.filter((e) => !compMap.has(e.employee_code.trim().toUpperCase())).map((e) => (
                <option key={e.employee_code} value={e.employee_code}>{e.employee_code} — {e.employee_name}</option>
              ))}
            </select>
            <input placeholder="Base salary" type="number" value={newRow.baseSalary} onChange={(ev) => setNewRow((p) => ({ ...p, baseSalary: ev.target.value }))} />
            <select value={newRow.salaryType} onChange={(ev) => setNewRow((p) => ({ ...p, salaryType: ev.target.value as SalaryType }))}>
              <option value="base">Base Salary</option>
              <option value="variable">Variable Salary</option>
              <option value="both">Base + Variable</option>
            </select>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => void handleAddEmployee()}>Save</button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ fontSize: '0.78rem', width: '100%' }}>
          <thead>
            <tr>
              <th>Employee</th><th>Department</th><th>Branch</th><th>Base Salary</th><th>Salary Type</th>
              <th>Bank Account</th><th>IFSC</th><th>Bank Name</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const code = e.employee_code.trim().toUpperCase()
              const comp = compMap.get(code)
              return (
                <CompRow
                  key={code}
                  employee={e}
                  comp={comp}
                  canModify={canModify}
                  onSave={(base, type) => void handleSaveComp(code, base, type)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function CompRow({
  employee, comp, canModify, onSave,
}: {
  employee: Awaited<ReturnType<typeof fetchPayrollEmployees>>[0]
  comp: Awaited<ReturnType<typeof fetchCompensationMap>> extends Map<string, infer V> ? V | undefined : never
  canModify: boolean
  onSave: (base: number, type: SalaryType) => void
}) {
  const [base, setBase] = useState(comp ? String(comp.base_salary) : '0')
  const [salaryType, setSalaryType] = useState<SalaryType>(comp?.salary_type ?? 'base')

  useEffect(() => {
    if (comp) {
      setBase(String(comp.base_salary))
      setSalaryType(comp.salary_type)
    }
  }, [comp])

  return (
    <tr>
      <td>{employee.employee_code} — {employee.employee_name}</td>
      <td>{employee.department ?? '—'}</td>
      <td>{employee.location ?? '—'}</td>
      <td>
        {canModify ? (
          <input type="number" value={base} onChange={(ev) => setBase(ev.target.value)} style={{ width: '90px' }} />
        ) : formatCurrency(Number(comp?.base_salary ?? 0))}
      </td>
      <td>
        {canModify ? (
          <select value={salaryType} onChange={(ev) => setSalaryType(ev.target.value as SalaryType)}>
            <option value="base">Base Salary</option>
            <option value="variable">Variable Salary</option>
            <option value="both">Base + Variable</option>
          </select>
        ) : comp ? SALARY_TYPE_LABELS[comp.salary_type] : '—'}
      </td>
      <td>{employee.account_number ?? '—'}</td>
      <td>{employee.ifsc ?? '—'}</td>
      <td>{employee.bank_name ?? '—'}</td>
      {canModify && comp && (
        <td>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onSave(Number(base), salaryType)}>Save</button>
        </td>
      )}
    </tr>
  )
}
