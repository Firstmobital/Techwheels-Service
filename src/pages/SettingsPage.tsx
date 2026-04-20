import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

interface EmployeeRow {
  id: number
  employee_code: string
  employee_name: string
  location: string | null
  department: string | null
}

interface MappingIssueRow {
  id: number
  source_table: 'service_vas_jc_data' | 'job_card_closed_data'
  branch: string
  row_number: number | null
  job_card_number: string | null
  sr_assigned_to: string | null
  reason: string
  status: 'open' | 'resolved'
  resolved_employee_code: string | null
  created_at: string
}

interface EmployeeUploadRow {
  employee_code: string
  employee_name: string
  location: string | null
  department: string | null
}

const REQUIRED_HEADERS = {
  employee_code: 'sa code',
  employee_name: 'sa name',
  location: 'location',
  department: 'department',
} as const

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseEmployeeWorkbook(file: File): Promise<EmployeeUploadRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })

        if (rows.length === 0) {
          reject(new Error('The file is empty.'))
          return
        }

        const headers = Object.keys(rows[0])
        const normalizedToOriginal = new Map<string, string>()
        for (const header of headers) {
          normalizedToOriginal.set(normalizeHeader(header), header)
        }

        const resolvedHeaders: Record<keyof typeof REQUIRED_HEADERS, string> = {
          employee_code: '',
          employee_name: '',
          location: '',
          department: '',
        }

        const missingHeaders: string[] = []
        for (const [key, expected] of Object.entries(REQUIRED_HEADERS) as Array<[keyof typeof REQUIRED_HEADERS, string]>) {
          const found = normalizedToOriginal.get(expected)
          if (!found) {
            missingHeaders.push(expected)
          } else {
            resolvedHeaders[key] = found
          }
        }

        if (missingHeaders.length > 0) {
          reject(new Error(`Missing required headers: ${missingHeaders.join(', ')}`))
          return
        }

        const parsedRows = rows
          .map((row) => {
            const code = String(row[resolvedHeaders.employee_code] ?? '').trim()
            const name = String(row[resolvedHeaders.employee_name] ?? '').trim()
            const location = String(row[resolvedHeaders.location] ?? '').trim()
            const department = String(row[resolvedHeaders.department] ?? '').trim()

            if (!code || !name) {
              return null
            }

            return {
              employee_code: code,
              employee_name: name,
              location: location || null,
              department: department || null,
            }
          })
          .filter((row): row is EmployeeUploadRow => row !== null)

        if (parsedRows.length === 0) {
          reject(new Error('No valid rows found. Ensure SA CODE and SA NAME are filled.'))
          return
        }

        resolve(parsedRows)
      } catch (err) {
        reject(new Error(err instanceof Error ? err.message : 'Failed to parse file.'))
      }
    }

    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsArrayBuffer(file)
  })
}

export default function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [issues, setIssues] = useState<MappingIssueRow[]>([])

  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [loadingIssues, setLoadingIssues] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const [resolvingIssueId, setResolvingIssueId] = useState<number | null>(null)

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [issueCodeSelections, setIssueCodeSelections] = useState<Record<number, string>>({})

  const [newEmployee, setNewEmployee] = useState({
    employee_code: '',
    employee_name: '',
    location: '',
    department: '',
  })

  // Filter state for Unmapped SR Entries
  const [filterJobCard, setFilterJobCard] = useState('')
  const [filterSrName, setFilterSrName] = useState('')
  const [filterBranch, setFilterBranch] = useState('')
  const [selectedIssueIds, setSelectedIssueIds] = useState<Record<number, boolean>>({})
  const [bulkEmployeeCode, setBulkEmployeeCode] = useState('')
  const [bulkResolving, setBulkResolving] = useState(false)

  const employeeOptions = useMemo(
    () => employees.map((employee) => ({ code: employee.employee_code, name: employee.employee_name })),
    [employees],
  )

  // Filter issues based on search criteria
  const filteredIssues = useMemo(() => {
    return issues.filter((issue) => {
      const matchJobCard =
        !filterJobCard || (issue.job_card_number?.toLowerCase().includes(filterJobCard.toLowerCase()) ?? false)
      const matchSrName =
        !filterSrName || (issue.sr_assigned_to?.toLowerCase().includes(filterSrName.toLowerCase()) ?? false)
      const matchBranch = !filterBranch || issue.branch === filterBranch
      return matchJobCard && matchSrName && matchBranch
    })
  }, [issues, filterJobCard, filterSrName, filterBranch])

  // Get unique branches from current issues
  const uniqueBranches = useMemo(() => {
    const branches = new Set(issues.map((issue) => issue.branch))
    return Array.from(branches).sort()
  }, [issues])

  // Calculate mapping statistics
  const mappingStats = useMemo(() => {
    const total = issues.length
    const byBranch = new Map<string, { total: number; unmapped: number }>()

    issues.forEach((issue) => {
      const key = issue.branch
      if (!byBranch.has(key)) {
        byBranch.set(key, { total: 0, unmapped: 0 })
      }
      const stats = byBranch.get(key)!
      stats.total += 1
      if (issue.status === 'open') {
        stats.unmapped += 1
      }
    })

    return { total, byBranch }
  }, [issues])

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true)
    const { data, error: fetchError } = await supabase
      .from('employee_master')
      .select('id, employee_code, employee_name, location, department')
      .order('employee_code', { ascending: true })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setEmployees((data as EmployeeRow[]) ?? [])
    }
    setLoadingEmployees(false)
  }, [])

  const fetchIssues = useCallback(async () => {
    setLoadingIssues(true)
    const { data, error: fetchError } = await supabase
      .from('import_employee_mapping_issues')
      .select(
        'id, source_table, branch, row_number, job_card_number, sr_assigned_to, reason, status, resolved_employee_code, created_at',
      )
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(100)

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setIssues((data as MappingIssueRow[]) ?? [])
    }

    setLoadingIssues(false)
  }, [])

  useEffect(() => {
    void fetchEmployees()
    void fetchIssues()
  }, [fetchEmployees, fetchIssues])

  const handleUploadFile = useCallback(async (file: File) => {
    setUploading(true)
    setMessage(null)
    setError(null)

    try {
      const parsedRows = await parseEmployeeWorkbook(file)
      const { error: upsertError } = await supabase
        .from('employee_master')
        .upsert(parsedRows, { onConflict: 'employee_code' })

      if (upsertError) {
        throw new Error(upsertError.message)
      }

      setMessage(`Uploaded ${parsedRows.length.toLocaleString()} employee rows.`)
      await fetchEmployees()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload employee file.')
    } finally {
      setUploading(false)
    }
  }, [fetchEmployees])

  const handleSaveEmployee = useCallback(async (employee: EmployeeRow) => {
    setSavingCode(employee.employee_code)
    setMessage(null)
    setError(null)

    const payload = {
      employee_code: employee.employee_code.trim(),
      employee_name: employee.employee_name.trim(),
      location: employee.location?.trim() || null,
      department: employee.department?.trim() || null,
    }

    if (!payload.employee_code || !payload.employee_name) {
      setError('Employee code and employee name are required.')
      setSavingCode(null)
      return
    }

    const { error: saveError } = await supabase
      .from('employee_master')
      .upsert(payload, { onConflict: 'employee_code' })

    if (saveError) {
      setError(saveError.message)
    } else {
      setMessage(`Saved ${payload.employee_code}.`)
      await fetchEmployees()
    }

    setSavingCode(null)
  }, [fetchEmployees])

  const handleAddEmployee = useCallback(async () => {
    setMessage(null)
    setError(null)

    const payload = {
      employee_code: newEmployee.employee_code.trim(),
      employee_name: newEmployee.employee_name.trim(),
      location: newEmployee.location.trim() || null,
      department: newEmployee.department.trim() || null,
    }

    if (!payload.employee_code || !payload.employee_name) {
      setError('SA CODE and SA NAME are required to add an employee.')
      return
    }

    const { error: addError } = await supabase
      .from('employee_master')
      .insert(payload)

    if (addError) {
      setError(addError.message)
      return
    }

    setNewEmployee({ employee_code: '', employee_name: '', location: '', department: '' })
    setMessage(`Added ${payload.employee_code}.`)
    await fetchEmployees()
  }, [fetchEmployees, newEmployee])

  const handleBulkResolve = useCallback(async () => {
    const selectedIds = Object.entries(selectedIssueIds)
      .filter(([, selected]) => selected)
      .map(([id]) => Number(id))

    if (selectedIds.length === 0) {
      setError('Select at least one issue to resolve.')
      return
    }

    if (!bulkEmployeeCode) {
      setError('Select an employee code to assign to all selected issues.')
      return
    }

    setBulkResolving(true)
    setMessage(null)
    setError(null)

    try {
      const issuesToResolve = issues.filter((issue) => selectedIds.includes(issue.id))

      for (const issue of issuesToResolve) {
        const sourceQuery = supabase.from(issue.source_table)

        if (issue.source_table === 'service_vas_jc_data') {
          await sourceQuery
            .update({ employee_code: bulkEmployeeCode })
            .eq('job_card_number', issue.job_card_number)
            .eq('sr_assigned_to', issue.sr_assigned_to)
        } else if (issue.source_table === 'job_card_closed_data') {
          await sourceQuery
            .update({ employee_code: bulkEmployeeCode })
            .eq('job_card_number', issue.job_card_number)
        }
      }

      const { error: updateError } = await supabase
        .from('import_employee_mapping_issues')
        .update({ status: 'resolved', resolved_employee_code: bulkEmployeeCode })
        .in('id', selectedIds)

      if (updateError) throw new Error(updateError.message)

      setMessage(`Resolved ${selectedIds.length} mapping issue(s).`)
      setSelectedIssueIds({})
      setBulkEmployeeCode('')
      await fetchIssues()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk resolve issues.')
    } finally {
      setBulkResolving(false)
    }
  }, [selectedIssueIds, bulkEmployeeCode, issues, fetchIssues])

  const handleResolveIssue = useCallback(async (issue: MappingIssueRow) => {
    const selectedCode = issueCodeSelections[issue.id]
    if (!selectedCode) {
      setError('Select an employee code first.')
      return
    }

    setResolvingIssueId(issue.id)
    setMessage(null)
    setError(null)

    const sourceQuery = supabase
      .from(issue.source_table)
      .update({ employee_code: selectedCode })
      .eq('branch', issue.branch)

    let scopedQuery = sourceQuery
    if (issue.job_card_number) {
      scopedQuery = scopedQuery.eq('job_card_number', issue.job_card_number)
    }
    if (issue.sr_assigned_to) {
      scopedQuery = scopedQuery.eq('sr_assigned_to', issue.sr_assigned_to)
    }

    const { error: sourceError } = await scopedQuery.is('employee_code', null)

    if (sourceError) {
      setError(sourceError.message)
      setResolvingIssueId(null)
      return
    }

    const { error: issueError } = await supabase
      .from('import_employee_mapping_issues')
      .update({
        status: 'resolved',
        resolved_employee_code: selectedCode,
      })
      .eq('id', issue.id)

    if (issueError) {
      setError(issueError.message)
      setResolvingIssueId(null)
      return
    }

    setMessage(`Resolved mapping issue #${issue.id}.`)
    await fetchIssues()
    setResolvingIssueId(null)
  }, [fetchIssues, issueCodeSelections])

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload and maintain the service advisor master list used for SR to employee mapping.
          </p>
        </div>

        {(message || error) && (
          <div
            className={[
              'rounded-lg border px-4 py-3 text-sm',
              error
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-green-200 bg-green-50 text-green-700',
            ].join(' ')}
          >
            {error ?? message}
          </div>
        )}

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Employee Master</h2>
              <p className="mt-0.5 text-xs text-gray-500">Expected headers: SA CODE, SA NAME, location, department.</p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload Employee File'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void handleUploadFile(file)
                }
                event.target.value = ''
              }}
            />
          </div>

          <div className="px-5 py-4">
            <div className="grid grid-cols-4 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <input
                value={newEmployee.employee_code}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, employee_code: event.target.value }))}
                placeholder="SA CODE"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={newEmployee.employee_name}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, employee_name: event.target.value }))}
                placeholder="SA NAME"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={newEmployee.location}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, location: event.target.value }))}
                placeholder="location"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <div className="flex items-center gap-2">
                <input
                  value={newEmployee.department}
                  onChange={(event) => setNewEmployee((prev) => ({ ...prev, department: event.target.value }))}
                  placeholder="department"
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => void handleAddEmployee()}
                  className="rounded bg-gray-800 px-3 py-1 text-xs font-medium text-white"
                >
                  Add
                </button>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-semibold">SA CODE</th>
                    <th className="px-3 py-2 font-semibold">SA NAME</th>
                    <th className="px-3 py-2 font-semibold">Location</th>
                    <th className="px-3 py-2 font-semibold">Department</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEmployees ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={5}>Loading employees...</td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={5}>No employees found.</td>
                    </tr>
                  ) : (
                    employees.map((employee) => (
                      <tr key={employee.id} className="border-b border-gray-100">
                        <td className="px-3 py-2">
                          <input
                            value={employee.employee_code}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, employee_code: value } : row,
                                ),
                              )
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.employee_name}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, employee_name: value } : row,
                                ),
                              )
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.location ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, location: value } : row,
                                ),
                              )
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.department ?? ''}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, department: value } : row,
                                ),
                              )
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveEmployee(employee)}
                            disabled={savingCode === employee.employee_code}
                            className="rounded bg-blue-600 px-3 py-1 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingCode === employee.employee_code ? 'Saving...' : 'Save'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Unmapped SR Entries</h2>
            <p className="mt-0.5 text-xs text-gray-500">Open issues captured while importing VAS and JC closed data.</p>
          </div>

          {/* Mapping Stats */}
          {!loadingIssues && issues.length > 0 && (
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="rounded-lg bg-blue-50 p-3">
                  <div className="text-xs font-semibold text-blue-900">Total Issues</div>
                  <div className="mt-1 text-lg font-bold text-blue-600">{mappingStats.total}</div>
                </div>
                {Array.from(mappingStats.byBranch.entries()).map(([branch, stats]) => (
                  <div key={branch} className="rounded-lg bg-orange-50 p-3">
                    <div className="text-xs font-semibold text-orange-900">{branch}</div>
                    <div className="mt-1 text-lg font-bold text-orange-600">
                      {stats.unmapped}/{stats.total}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search Filters */}
          <div className="border-b border-gray-100 px-5 py-4">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700">Search Job Card</label>
                <input
                  type="text"
                  placeholder="Filter by job card number..."
                  value={filterJobCard}
                  onChange={(event) => setFilterJobCard(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700">Search SR Name</label>
                <input
                  type="text"
                  placeholder="Filter by SR assigned to..."
                  value={filterSrName}
                  onChange={(event) => setFilterSrName(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700">Filter Branch</label>
                <select
                  value={filterBranch}
                  onChange={(event) => setFilterBranch(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="">All branches</option>
                  {uniqueBranches.map((branch) => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Bulk Resolve Controls */}
          {!loadingIssues && filteredIssues.length > 0 && (
            <div className="border-b border-gray-100 px-5 py-3 bg-blue-50">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <select
                    value={bulkEmployeeCode}
                    onChange={(event) => setBulkEmployeeCode(event.target.value)}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="">Select employee for bulk assignment</option>
                    {employeeOptions.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.code} - {option.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void handleBulkResolve()}
                  disabled={
                    bulkResolving ||
                    !bulkEmployeeCode ||
                    Object.values(selectedIssueIds).filter(Boolean).length === 0
                  }
                  className="rounded bg-emerald-600 px-4 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkResolving
                    ? 'Resolving...'
                    : `Bulk Resolve (${Object.values(selectedIssueIds).filter(Boolean).length})`}
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto px-5 py-4">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                  <th className="px-3 py-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={
                        filteredIssues.length > 0 &&
                        filteredIssues.every((issue) => selectedIssueIds[issue.id])
                      }
                      onChange={(event) => {
                        const newSelection: Record<number, boolean> = {}
                        filteredIssues.forEach((issue) => {
                          newSelection[issue.id] = event.target.checked
                        })
                        setSelectedIssueIds(newSelection)
                      }}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Source</th>
                  <th className="px-3 py-2 font-semibold">Branch</th>
                  <th className="px-3 py-2 font-semibold">Row</th>
                  <th className="px-3 py-2 font-semibold">Job Card</th>
                  <th className="px-3 py-2 font-semibold">SR Assigned To</th>
                  <th className="px-3 py-2 font-semibold">Assign Employee</th>
                  <th className="px-3 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingIssues ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-400" colSpan={9}>Loading issues...</td>
                  </tr>
                ) : issues.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-400" colSpan={9}>No open mapping issues.</td>
                  </tr>
                ) : filteredIssues.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-400" colSpan={9}>No issues match the applied filters.</td>
                  </tr>
                ) : (
                  filteredIssues.map((issue) => (
                    <tr key={issue.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIssueIds[issue.id] ?? false}
                          onChange={(event) =>
                            setSelectedIssueIds((prev) => ({
                              ...prev,
                              [issue.id]: event.target.checked,
                            }))
                          }
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-500">{new Date(issue.created_at).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2">{issue.source_table}</td>
                      <td className="px-3 py-2">{issue.branch}</td>
                      <td className="px-3 py-2">{issue.row_number ?? '-'}</td>
                      <td className="px-3 py-2 font-mono">{issue.job_card_number ?? '-'}</td>
                      <td className="px-3 py-2">{issue.sr_assigned_to ?? '-'}</td>
                      <td className="px-3 py-2">
                        <select
                          value={issueCodeSelections[issue.id] ?? ''}
                          onChange={(event) =>
                            setIssueCodeSelections((prev) => ({
                              ...prev,
                              [issue.id]: event.target.value,
                            }))
                          }
                          className="rounded border border-gray-300 px-2 py-1"
                        >
                          <option value="">Select employee</option>
                          {employeeOptions.map((option) => (
                            <option key={option.code} value={option.code}>
                              {option.code} - {option.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => void handleResolveIssue(issue)}
                          disabled={resolvingIssueId === issue.id}
                          className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {resolvingIssueId === issue.id ? 'Applying...' : 'Apply'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  )
}
