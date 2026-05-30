import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import {
  activateRateCard,
  createRateCardWithRows,
  exportActiveRateRowsByCityCategory,
  listRateCards,
  type RateCardRow,
  type RateRowInput,
} from '../lib/api'

interface EmployeeRow {
  id: number
  employee_code: string
  employee_name: string
  location: string | null
  department: string | null
  fuel_type: string | null
  rote: string | null
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
  fuel_type: string | null
  rote: string | null
}

interface RateUploadRow {
  modelName: string
  panelLabel: string
  ppRate: number | null
  pmRate: number | null
  psRate: number | null
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

function normalizeBranch(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed || null
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

        // Optional headers for fuel_type and rote.
        const fuelTypeHeader = normalizedToOriginal.get('fuel type') || normalizedToOriginal.get('fuel_type')
        const roteHeader = normalizedToOriginal.get('rote') || normalizedToOriginal.get('role')

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
            const fuelType = fuelTypeHeader ? String(row[fuelTypeHeader] ?? '').trim() : ''
            const rote = roteHeader ? String(row[roteHeader] ?? '').trim() : ''

            if (!code || !name) {
              return null
            }

            return {
              employee_code: code,
              employee_name: name,
              location: location || null,
              department: department || null,
              fuel_type: fuelType || null,
              rote: rote || null,
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

function parseRateNumber(raw: unknown): number | null {
  const value = String(raw ?? '').replace(/,/g, '').trim()
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function parseRateWorkbook(file: File): Promise<RateUploadRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, { header: 1, defval: '' })

        let currentModel = ''
        const parsed: RateUploadRow[] = []

        rows.forEach((colsRaw) => {
          const cols = [...colsRaw].map((v) => String(v ?? '').trim())
          const modelCol = cols[0] || ''
          const panelCol = cols[1] || ''

          const headerLike = modelCol.toLowerCase() === 'model' || panelCol.toLowerCase() === 'panel'
          if (headerLike) return

          const pp = parseRateNumber(cols[2])
          const pm = parseRateNumber(cols[3])
          const ps = parseRateNumber(cols[4])

          const looksLikeModelRow = modelCol && !panelCol && pp == null && pm == null && ps == null
          if (looksLikeModelRow) {
            currentModel = modelCol
            return
          }

          if (!currentModel) {
            if (modelCol && panelCol) {
              currentModel = modelCol
            } else {
              return
            }
          }

          const panelLabel = panelCol || cols[0] || ''
          if (!panelLabel) return

          parsed.push({
            modelName: currentModel,
            panelLabel,
            ppRate: pp,
            pmRate: pm,
            psRate: ps,
          })
        })

        const validRows = parsed.filter((row) => row.modelName && row.panelLabel)
        if (validRows.length === 0) {
          reject(new Error('No valid rate rows found in uploaded file.'))
          return
        }

        resolve(validRows)
      } catch (error) {
        reject(new Error(error instanceof Error ? error.message : 'Failed to parse rate workbook.'))
      }
    }

    reader.onerror = () => reject(new Error('Could not read rate file.'))
    reader.readAsArrayBuffer(file)
  })
}

export default function SettingsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const rateFileInputRef = useRef<HTMLInputElement>(null)

  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [issues, setIssues] = useState<MappingIssueRow[]>([])

  const [loadingEmployees, setLoadingEmployees] = useState(true)
  const [loadingIssues, setLoadingIssues] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [savingCode, setSavingCode] = useState<string | null>(null)
  const [resolvingIssueId, setResolvingIssueId] = useState<number | null>(null)
  const [deletingEmployeeId, setDeletingEmployeeId] = useState<number | null>(null)
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null)

  const [rateCards, setRateCards] = useState<RateCardRow[]>([])
  const [loadingRateCards, setLoadingRateCards] = useState(true)
  const [uploadingRates, setUploadingRates] = useState(false)
  const [exportingRates, setExportingRates] = useState(false)
  const [activatingRateCardId, setActivatingRateCardId] = useState<string | null>(null)
  const [rateUploadConfig, setRateUploadConfig] = useState({
    name: '',
    cityCategory: 'A',
    notes: '',
    setActive: true,
  })

  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [issueCodeSelections, setIssueCodeSelections] = useState<Record<number, string>>({})

  const [newEmployee, setNewEmployee] = useState({
    employee_code: '',
    employee_name: '',
    location: '',
    department: '',
    fuel_type: '',
    rote: '',
  })

  const handleExportEmployees = useCallback(() => {
    if (employees.length === 0) {
      setError('No employees to export.')
      return
    }

    const exportData = employees.map((emp) => ({
      'SA Code': emp.employee_code,
      'SA Name': emp.employee_name,
      Location: emp.location || '',
      Department: emp.department || '',
      'Fuel Type': emp.fuel_type || '',
      Rote: emp.rote || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees')
    XLSX.writeFile(workbook, `employees_${new Date().toISOString().slice(0, 10)}.xlsx`)
    setMessage('Employees exported successfully.')
  }, [employees])

  const handleExportIssues = useCallback(() => {
    if (issues.length === 0) {
      setError('No mapping issues to export.')
      return
    }

    const exportData = issues.map((issue) => ({
      When: new Date(issue.created_at).toLocaleString('en-IN'),
      Source: issue.source_table,
      Branch: issue.branch,
      'Row Number': issue.row_number || '',
      'Job Card': issue.job_card_number || '',
      'SR Assigned To': issue.sr_assigned_to || '',
      Reason: issue.reason,
      Status: issue.status,
      'Resolved Employee Code': issue.resolved_employee_code || '',
    }))

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Mapping Issues')
    XLSX.writeFile(workbook, `mapping_issues_${new Date().toISOString().slice(0, 10)}.xlsx`)
    setMessage('Mapping issues exported successfully.')
  }, [issues])

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

  const getDefaultFuelType = (employeeCode: string): string | null => {
    if (employeeCode === '3000840') return 'PV'
    if (employeeCode === '500A840') return 'EV'
    return null
  }

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true)
    const { data, error: fetchError } = await supabase
      .from('employee_master')
      .select('id, employee_code, employee_name, location, department, fuel_type, rote')
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
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setIssues((data as MappingIssueRow[]) ?? [])
    }

    setLoadingIssues(false)
  }, [])

  const fetchRateCards = useCallback(async () => {
    setLoadingRateCards(true)
    const res = await listRateCards()
    if (res.error || !res.data) {
      setError(res.error ?? 'Failed to load rate cards')
    } else {
      setRateCards(res.data)
    }
    setLoadingRateCards(false)
  }, [])

  const handleUploadRateFile = useCallback(async (file: File) => {
    setUploadingRates(true)
    setMessage(null)
    setError(null)

    try {
      const parsedRows = await parseRateWorkbook(file)
      const payloadRows: RateRowInput[] = parsedRows.map((row) => ({
        modelName: row.modelName,
        panelLabel: row.panelLabel,
        ppRate: row.ppRate,
        pmRate: row.pmRate,
        psRate: row.psRate,
      }))

      const cardName = rateUploadConfig.name.trim() || `Water Base Paint Labour - Category ${rateUploadConfig.cityCategory}`
      const createRes = await createRateCardWithRows({
        name: cardName,
        cityCategory: rateUploadConfig.cityCategory,
        notes: rateUploadConfig.notes,
        rows: payloadRows,
        setActive: rateUploadConfig.setActive,
      })

      if (createRes.error) throw new Error(createRes.error)

      setMessage(`Uploaded ${payloadRows.length.toLocaleString()} rate rows to card ${createRes.data?.name ?? cardName}.`)
      setRateUploadConfig((prev) => ({ ...prev, name: '', notes: '' }))
      await fetchRateCards()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload rate card file.')
    } finally {
      setUploadingRates(false)
    }
  }, [fetchRateCards, rateUploadConfig])

  const handleActivateRateCard = useCallback(async (cardId: string) => {
    setActivatingRateCardId(cardId)
    setMessage(null)
    setError(null)

    try {
      const res = await activateRateCard(cardId)
      if (res.error) throw new Error(res.error)
      setMessage('Rate card activated successfully.')
      await fetchRateCards()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate rate card.')
    } finally {
      setActivatingRateCardId(null)
    }
  }, [fetchRateCards])

  const handleExportRateFile = useCallback(async () => {
    setExportingRates(true)
    setMessage(null)
    setError(null)

    try {
      const category = rateUploadConfig.cityCategory.trim()
      const res = await exportActiveRateRowsByCityCategory(category)
      if (res.error || !res.data) {
        throw new Error(res.error ?? 'Failed to export rate file.')
      }

      const rows = res.data
      const sheetRows: Array<[string, string, number | string, number | string, number | string]> = [
        ['model', 'panel', 'paint_type_pp_pearl', 'paint_type_pm_metallic', 'paint_type_ps_solid'],
      ]

      rows.forEach((row) => {
        sheetRows.push([
          row.modelName,
          row.panelLabel,
          row.ppRate ?? '',
          row.pmRate ?? '',
          row.psRate ?? '',
        ])
      })

      const worksheet = XLSX.utils.aoa_to_sheet(sheetRows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Rate Card')

      const fileName = `autodoc_rate_card_category_${category || 'A'}.xlsx`
      XLSX.writeFile(workbook, fileName)

      if (rows.length > 0) {
        setMessage(`Exported ${rows.length.toLocaleString()} rate rows for category ${category}.`)
      } else {
        setMessage(`No active rate card rows found for category ${category}. Exported editable template.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export rate file.')
    } finally {
      setExportingRates(false)
    }
  }, [rateUploadConfig.cityCategory])

  const handleAutoResolveByCode = useCallback(async () => {
    if (issues.length === 0) {
      setMessage('No unmapped entries to resolve.')
      return
    }

    if (employees.length === 0) {
      setError('No employees in master to match against.')
      return
    }

    setMessage(null)
    setError(null)

    try {
      const employeeCodeMap = new Map(employees.map((emp) => [emp.employee_code.toLowerCase().trim(), emp]))

      let resolvedCount = 0
      const failedResolves: string[] = []

      for (const issue of issues) {
        if (!issue.sr_assigned_to) {
          failedResolves.push('(no SR code)')
          continue
        }

        const normalizedSrCode = issue.sr_assigned_to.toLowerCase().trim()
        const matchedEmployee = employeeCodeMap.get(normalizedSrCode)

        if (!matchedEmployee) {
          failedResolves.push(issue.sr_assigned_to)
          continue
        }

        // Update source table with matched employee code
        const employeeBranch = normalizeBranch(matchedEmployee.location)
        const updatePayload = employeeBranch
          ? { employee_code: matchedEmployee.employee_code, branch: employeeBranch }
          : { employee_code: matchedEmployee.employee_code }

        let sourceQuery = supabase
          .from(issue.source_table)
          .update(updatePayload)
          .eq('branch', issue.branch)

        if (issue.job_card_number) {
          sourceQuery = sourceQuery.eq('job_card_number', issue.job_card_number)
        }
        if (issue.sr_assigned_to) {
          sourceQuery = sourceQuery.eq('sr_assigned_to', issue.sr_assigned_to)
        }

        const { error: sourceError } = await sourceQuery.is('employee_code', null)

        if (sourceError) {
          console.error(`Failed to update source table for issue ${issue.id}:`, sourceError)
          failedResolves.push(issue.sr_assigned_to)
          continue
        }

        // Update mapping issues table
        const { error: mappingError } = await supabase
          .from('import_employee_mapping_issues')
          .update({ status: 'resolved', resolved_employee_code: matchedEmployee.employee_code })
          .eq('id', issue.id)

        if (mappingError) {
          console.error(`Failed to resolve issue ${issue.id}:`, mappingError)
          failedResolves.push(issue.sr_assigned_to)
          continue
        }

        resolvedCount += 1
      }

      setMessage(
        `Auto-resolved ${resolvedCount} mapping issue(s). ${failedResolves.length} could not be matched and are shown below.`,
      )

      if (resolvedCount > 0) {
        await fetchIssues()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to auto-resolve mapping issues.')
    }
  }, [issues, employees, fetchIssues])

  const handleAutoResolveVasJcByCode = useCallback(async () => {
    if (employees.length === 0) {
      setError('No employees in master to match against.')
      return
    }

    setMessage(null)
    setError(null)

    try {
      const employeeCodeMap = new Map(
        employees.map((emp) => [emp.employee_code.toLowerCase().trim(), emp]),
      )

      // Get all unmapped service_vas_jc_data entries
      const vasJcIssues = issues.filter((issue) => issue.source_table === 'service_vas_jc_data')

      if (vasJcIssues.length === 0) {
        setMessage('No unmapped VAS JC entries found to resolve.')
        return
      }

      let resolvedCount = 0
      const failedResolves: string[] = []

      for (const issue of vasJcIssues) {
        if (!issue.sr_assigned_to) {
          failedResolves.push('(no SR code)')
          continue
        }

        const normalizedSrCode = issue.sr_assigned_to.toLowerCase().trim()
        const matchedEmployee = employeeCodeMap.get(normalizedSrCode)

        if (!matchedEmployee) {
          failedResolves.push(issue.sr_assigned_to)
          continue
        }

        // Update VAS JC table with matched employee code and name
        const employeeBranch = normalizeBranch(matchedEmployee.location)
        const updatePayload = {
          employee_code: matchedEmployee.employee_code,
          sr_assigned_to: matchedEmployee.employee_code,
          ...(employeeBranch && { branch: employeeBranch }),
        }

        let vasQuery = supabase
          .from('service_vas_jc_data')
          .update(updatePayload)
          .eq('branch', issue.branch)

        if (issue.job_card_number) {
          vasQuery = vasQuery.eq('job_card_number', issue.job_card_number)
        }
        if (issue.sr_assigned_to) {
          vasQuery = vasQuery.eq('sr_assigned_to', issue.sr_assigned_to)
        }

        const { error: sourceError } = await vasQuery.is('employee_code', null)

        if (sourceError) {
          console.error(`Failed to update VAS JC for issue ${issue.id}:`, sourceError)
          failedResolves.push(issue.sr_assigned_to)
          continue
        }

        // Update mapping issues table
        const { error: mappingError } = await supabase
          .from('import_employee_mapping_issues')
          .update({ status: 'resolved', resolved_employee_code: matchedEmployee.employee_code })
          .eq('id', issue.id)

        if (mappingError) {
          console.error(`Failed to resolve issue ${issue.id}:`, mappingError)
          failedResolves.push(issue.sr_assigned_to)
          continue
        }

        resolvedCount += 1
      }

      setMessage(
        `Assigned ${resolvedCount} VAS JC entry(ies) by employee code. ${failedResolves.length} could not be matched.`,
      )

      if (resolvedCount > 0) {
        await fetchIssues()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to auto-assign VAS JC entries.')
    }
  }, [issues, employees, fetchIssues])

  const handleBulkAutoAssignAllVasJc = useCallback(async () => {
    if (!window.confirm('Auto-assign names to ALL unmapped VAS JC entries based on employee codes?\n\nThis will process all records.')) {
      return
    }

    if (employees.length === 0) {
      setError('No employees in master to match against.')
      return
    }

    setMessage(null)
    setError(null)

    try {
      const employeeCodeMap = new Map(
        employees.map((emp) => [emp.employee_code.toLowerCase().trim(), emp]),
      )

      // Get all unmapped VAS JC issues
      const vasJcIssues = issues.filter((issue) => issue.source_table === 'service_vas_jc_data')

      if (vasJcIssues.length === 0) {
        setMessage('No unmapped VAS JC entries found.')
        return
      }

      let resolvedCount = 0
      let failedCount = 0
      const failedCodes: string[] = []

      for (const issue of vasJcIssues) {
        if (!issue.sr_assigned_to) {
          failedCount += 1
          continue
        }

        const normalizedSrCode = issue.sr_assigned_to.toLowerCase().trim()
        const matchedEmployee = employeeCodeMap.get(normalizedSrCode)

        if (!matchedEmployee) {
          failedCount += 1
          failedCodes.push(issue.sr_assigned_to)
          continue
        }

        const employeeBranch = normalizeBranch(matchedEmployee.location)
        const updatePayload = {
          employee_code: matchedEmployee.employee_code,
          sr_assigned_to: matchedEmployee.employee_code,
          ...(employeeBranch && { branch: employeeBranch }),
        }

        // Update service_vas_jc_data
        const { error: sourceError } = await supabase
          .from('service_vas_jc_data')
          .update(updatePayload)
          .eq('branch', issue.branch)
          .eq('job_card_number', issue.job_card_number)
          .eq('sr_assigned_to', issue.sr_assigned_to)
          .is('employee_code', null)

        if (sourceError) {
          console.error(`Failed to update VAS JC for issue ${issue.id}:`, sourceError)
          failedCount += 1
          failedCodes.push(issue.sr_assigned_to)
          continue
        }

        // Update mapping issue
        const { error: mappingError } = await supabase
          .from('import_employee_mapping_issues')
          .update({ status: 'resolved', resolved_employee_code: matchedEmployee.employee_code })
          .eq('id', issue.id)

        if (mappingError) {
          console.error(`Failed to resolve issue ${issue.id}:`, mappingError)
          failedCount += 1
          failedCodes.push(issue.sr_assigned_to)
          continue
        }

        resolvedCount += 1
      }

      setMessage(
        `Auto-assigned ${resolvedCount} VAS JC entries. ${failedCount} could not be matched${failedCodes.length > 0 ? ': ' + failedCodes.join(', ') : '.'}`,
      )

      if (resolvedCount > 0) {
        await fetchIssues()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk auto-assign VAS JC entries.')
    }
  }, [issues, employees, fetchIssues])

  const handleAutoAssignAllPendencies = useCallback(async () => {
    if (!window.confirm('Auto-assign ALL unmapped pendencies based on employee codes?\n\nThis will update:\n- All service_vas_jc_data entries\n- All job_card_closed_data entries\n\nContinue?')) {
      return
    }

    if (employees.length === 0) {
      setError('No employees in master to match against.')
      return
    }

    setMessage(null)
    setError(null)

    try {
      const employeeCodeMap = new Map(
        employees.map((emp) => [emp.employee_code.toLowerCase().trim(), emp]),
      )

      let totalResolved = 0
      let totalFailed = 0
      const failedCodes: string[] = []

      // Process all unmapped issues
      for (const issue of issues) {
        if (!issue.sr_assigned_to) {
          totalFailed += 1
          continue
        }

        const normalizedSrCode = issue.sr_assigned_to.toLowerCase().trim()
        const matchedEmployee = employeeCodeMap.get(normalizedSrCode)

        if (!matchedEmployee) {
          totalFailed += 1
          if (!failedCodes.includes(issue.sr_assigned_to)) {
            failedCodes.push(issue.sr_assigned_to)
          }
          continue
        }

        const employeeBranch = normalizeBranch(matchedEmployee.location)
        const updatePayload = {
          employee_code: matchedEmployee.employee_code,
          sr_assigned_to: matchedEmployee.employee_code,
          ...(employeeBranch && { branch: employeeBranch }),
        }

        // Update the source table (could be service_vas_jc_data or job_card_closed_data)
        const { error: sourceError } = await supabase
          .from(issue.source_table)
          .update(updatePayload)
          .eq('branch', issue.branch)
          .eq('sr_assigned_to', issue.sr_assigned_to)
          .is('employee_code', null)

        if (sourceError) {
          console.error(`Failed to update ${issue.source_table} for issue ${issue.id}:`, sourceError)
          totalFailed += 1
          if (!failedCodes.includes(issue.sr_assigned_to)) {
            failedCodes.push(issue.sr_assigned_to)
          }
          continue
        }

        // Update mapping issue
        const { error: mappingError } = await supabase
          .from('import_employee_mapping_issues')
          .update({ status: 'resolved', resolved_employee_code: matchedEmployee.employee_code })
          .eq('id', issue.id)

        if (mappingError) {
          console.error(`Failed to resolve issue ${issue.id}:`, mappingError)
          totalFailed += 1
          if (!failedCodes.includes(issue.sr_assigned_to)) {
            failedCodes.push(issue.sr_assigned_to)
          }
          continue
        }

        totalResolved += 1
      }

      setMessage(
        `Auto-assigned ${totalResolved} pendency(ies). ${totalFailed} could not be matched${failedCodes.length > 0 ? ': ' + failedCodes.join(', ') : '.'}`,
      )

      if (totalResolved > 0) {
        await fetchIssues()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to auto-assign all pendencies.')
    }
  }, [issues, employees, fetchIssues])

  const handleDeleteEmployee = useCallback(async (employee: EmployeeRow) => {
    if (!window.confirm(`Delete ${employee.employee_code} - ${employee.employee_name}?`)) {
      return
    }

    setDeletingEmployeeId(employee.id)
    setMessage(null)
    setError(null)

    const { error: deleteError } = await supabase
      .from('employee_master')
      .delete()
      .eq('id', employee.id)

    if (deleteError) {
      setError(deleteError.message)
      setDeletingEmployeeId(null)
      return
    }

    setMessage(`Deleted ${employee.employee_code}.`)
    setDeletingEmployeeId(null)
    await fetchEmployees()
  }, [fetchEmployees])

  useEffect(() => {
    void fetchEmployees()
    void fetchIssues()
    void fetchRateCards()
  }, [fetchEmployees, fetchIssues, fetchRateCards])

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
      fuel_type: employee.fuel_type?.trim() || null,
      rote: employee.rote?.trim() || null,
    }

    if (!payload.employee_code || !payload.employee_name) {
      setError('Employee code and employee name are required.')
      setSavingCode(null)
      return false
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

    return !saveError
  }, [fetchEmployees])

  const handleAddEmployee = useCallback(async () => {
    setMessage(null)
    setError(null)

    const payload = {
      employee_code: newEmployee.employee_code.trim(),
      employee_name: newEmployee.employee_name.trim(),
      location: newEmployee.location.trim() || null,
      department: newEmployee.department.trim() || null,
      fuel_type: newEmployee.fuel_type.trim() || getDefaultFuelType(newEmployee.employee_code.trim()) || null,
      rote: newEmployee.rote.trim() || null,
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

    setNewEmployee({ employee_code: '', employee_name: '', location: '', department: '', fuel_type: '', rote: '' })
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
      const selectedEmployee = employees.find((employee) => employee.employee_code === bulkEmployeeCode)
      const employeeBranch = normalizeBranch(selectedEmployee?.location)
      const updatePayload = employeeBranch
        ? { employee_code: bulkEmployeeCode, branch: employeeBranch }
        : { employee_code: bulkEmployeeCode }

      for (const issue of issuesToResolve) {
        let scopedQuery = supabase
          .from(issue.source_table)
          .update(updatePayload)
          .eq('branch', issue.branch)

        if (issue.job_card_number) {
          scopedQuery = scopedQuery.eq('job_card_number', issue.job_card_number)
        }
        if (issue.sr_assigned_to) {
          scopedQuery = scopedQuery.eq('sr_assigned_to', issue.sr_assigned_to)
        }

        const { error: sourceError } = await scopedQuery.is('employee_code', null)
        if (sourceError) {
          throw new Error(sourceError.message)
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
  }, [selectedIssueIds, bulkEmployeeCode, issues, fetchIssues, employees])

  const handleResolveIssue = useCallback(async (issue: MappingIssueRow) => {
    const selectedCode = issueCodeSelections[issue.id]
    if (!selectedCode) {
      setError('Select an employee code first.')
      return
    }

    setResolvingIssueId(issue.id)
    setMessage(null)
    setError(null)

    const selectedEmployee = employees.find((employee) => employee.employee_code === selectedCode)
    const employeeBranch = normalizeBranch(selectedEmployee?.location)
    const updatePayload = employeeBranch
      ? { employee_code: selectedCode, branch: employeeBranch }
      : { employee_code: selectedCode }

    const sourceQuery = supabase
      .from(issue.source_table)
      .update(updatePayload)
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
  }, [fetchIssues, issueCodeSelections, employees])

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
              <p className="mt-0.5 text-xs text-gray-500">Expected headers: SA CODE, SA NAME, location, department. Optional: Fuel Type, Rote.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleExportEmployees()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export Employees
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload Employee File'}
              </button>
            </div>
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
            <div className="grid grid-cols-7 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
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
              <input
                value={newEmployee.department}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, department: event.target.value }))}
                placeholder="department"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={newEmployee.fuel_type}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, fuel_type: event.target.value }))}
                placeholder="Fuel Type (PV/EV)"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={newEmployee.rote}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, rote: event.target.value }))}
                placeholder="Rote"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <div className="flex items-center">
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
                    <th className="px-3 py-2 font-semibold">Fuel Type</th>
                    <th className="px-3 py-2 font-semibold">Rote</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEmployees ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={7}>Loading employees...</td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={7}>No employees found.</td>
                    </tr>
                  ) : (
                    employees.map((employee) => (
                      <tr key={employee.id} className="border-b border-gray-100">
                        <td className="px-3 py-2">
                          <input
                            value={employee.employee_code}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, employee_code: value } : row,
                                ),
                              )
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 disabled:text-gray-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.employee_name}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, employee_name: value } : row,
                                ),
                              )
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 disabled:text-gray-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.location ?? ''}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, location: value } : row,
                                ),
                              )
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 disabled:text-gray-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.department ?? ''}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, department: value } : row,
                                ),
                              )
                            }}
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 disabled:text-gray-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.fuel_type ?? ''}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, fuel_type: value } : row,
                                ),
                              )
                            }}
                            placeholder="PV/EV"
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 disabled:text-gray-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.rote ?? ''}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, rote: value } : row,
                                ),
                              )
                            }}
                            placeholder="Rote"
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 disabled:text-gray-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            {editingEmployeeId === employee.id ? (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const saved = await handleSaveEmployee(employee)
                                    if (saved) {
                                      setEditingEmployeeId(null)
                                    }
                                  }}
                                  disabled={savingCode === employee.employee_code}
                                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {savingCode === employee.employee_code ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingEmployeeId(null)
                                    void fetchEmployees()
                                  }}
                                  className="rounded bg-gray-500 px-3 py-1 text-xs font-medium text-white"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditingEmployeeId(employee.id)}
                                className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDeleteEmployee(employee)}
                              disabled={deletingEmployeeId === employee.id || savingCode === employee.employee_code}
                              className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingEmployeeId === employee.id ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
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
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">AutoDoc Rate Cards</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Upload model-wise panel labour rates (PP / PM / PS) and activate per city category.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportRateFile()}
                disabled={exportingRates || uploadingRates}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {exportingRates ? 'Exporting...' : 'Export'}
              </button>
              <button
                type="button"
                onClick={() => rateFileInputRef.current?.click()}
                disabled={uploadingRates || exportingRates}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadingRates ? 'Importing...' : 'Import'}
              </button>
            </div>
            <input
              ref={rateFileInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) {
                  void handleUploadRateFile(file)
                }
                event.target.value = ''
              }}
            />
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Card Name</label>
                <input
                  value={rateUploadConfig.name}
                  onChange={(event) => setRateUploadConfig((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Water base paint labour rates"
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">City Category</label>
                <select
                  value={rateUploadConfig.cityCategory}
                  onChange={(event) => setRateUploadConfig((prev) => ({ ...prev, cityCategory: event.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Notes</label>
                <input
                  value={rateUploadConfig.notes}
                  onChange={(event) => setRateUploadConfig((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="e.g. incl. 6% water-base premium"
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={rateUploadConfig.setActive}
                    onChange={(event) => setRateUploadConfig((prev) => ({ ...prev, setActive: event.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  Activate after upload
                </label>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-semibold">Card Name</th>
                    <th className="px-3 py-2 font-semibold">Category</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Created</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRateCards ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={5}>Loading rate cards...</td>
                    </tr>
                  ) : rateCards.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={5}>No rate cards uploaded yet.</td>
                    </tr>
                  ) : (
                    rateCards.map((card) => (
                      <tr key={card.id} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-medium text-gray-800">{card.name}</td>
                        <td className="px-3 py-2">{card.city_category}</td>
                        <td className="px-3 py-2">
                          <span className={[
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            card.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600',
                          ].join(' ')}>
                            {card.is_active ? 'Active' : card.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{new Date(card.created_at).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => void handleActivateRateCard(card.id)}
                            disabled={card.is_active || activatingRateCardId === card.id}
                            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {activatingRateCardId === card.id ? 'Activating...' : card.is_active ? 'Active' : 'Activate'}
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
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Unmapped SR Entries (All Pendencies)</h2>
              <p className="mt-0.5 text-xs text-gray-500">All issues captured while importing VAS and JC closed data, including open and resolved.</p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleAutoAssignAllPendencies()}
                disabled={loadingIssues || issues.length === 0 || loadingEmployees}
                className="rounded-lg bg-red-700 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ⚡ Auto-Assign ALL Pendencies
              </button>
              <button
                type="button"
                onClick={() => void handleBulkAutoAssignAllVasJc()}
                disabled={loadingIssues || issues.length === 0 || loadingEmployees}
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Auto-Assign ALL VAS JC
              </button>
              <button
                type="button"
                onClick={() => void handleAutoResolveVasJcByCode()}
                disabled={loadingIssues || issues.length === 0 || loadingEmployees}
                className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Assign VAS JC Names
              </button>
              <button
                type="button"
                onClick={() => void handleAutoResolveByCode()}
                disabled={loadingIssues || issues.length === 0 || loadingEmployees}
                className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Auto-Resolve by Code
              </button>
              <button
                type="button"
                onClick={() => void handleExportIssues()}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export Issues
              </button>
            </div>
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
