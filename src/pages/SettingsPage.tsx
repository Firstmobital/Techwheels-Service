import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { normalizeDepartmentDisplay } from '../lib/department'
import { supabase } from '../lib/supabase'
import Icon from '../components/Icon'
import {
  activateRateCard,
  createBodyshopSurveyor,
  createRateCardWithRows,
  deleteBodyshopSurveyor,
  exportActiveRateRowsByCityCategory,
  listBodyshopSurveyors,
  listRateCards,
  updateBodyshopSurveyor,
  type BodyshopSurveyor,
  type RateCardRow,
  type RateRowInput,
  listModelOptions,
  createModelOption,
  updateModelOption,
  deleteModelOption,
  type ModelOption,
} from '../lib/api'

interface EmployeeRow {
  id: number
  employee_code: string
  employee_name: string
  location: string | null
  department: string | null
  fuel_type: string | null
  role: string | null
  bank_name: string | null
  account_number: string | null
  ifsc: string | null
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

interface BodyshopSurveyorDraft {
  surveyor_name: string
  surveyor_contact_number: string
  surveyor_email: string
}

interface EmployeeUploadRow {
  employee_code: string
  employee_name: string
  location: string | null
  department: string | null
  fuel_type: string | null
  role: string | null
  bank_name: string | null
  account_number: string | null
  ifsc: string | null
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
  department: 'department',
} as const

const DEALER_CODE_RULES = [
  { key: '3000840', location: 'Sitapura', fuel_type: 'PV' },
  { key: '500A840', location: 'Sitapura', fuel_type: 'EV' },
  { key: '3001440', location: 'Ajmer Road', fuel_type: 'PV' },
] as const

const SETTINGS_SECTION_IDS = [
  'branch-management',
  'employee-master',
  'bodyshop-surveyor',
  'models',
  'autodoc-rate-cards',
  'unmapped-sr-entries',
] as const

type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number]

const DEFAULT_SETTINGS_SECTION_ID: SettingsSectionId = 'branch-management'

function isSettingsSectionId(value: string): value is SettingsSectionId {
  return (SETTINGS_SECTION_IDS as readonly string[]).includes(value)
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeBranch(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed || null
}

function deriveLocationAndFuelType(employeeCode: string): { location: string; fuel_type: string } | null {
  const normalizedCode = employeeCode.trim().toUpperCase()
  if (!normalizedCode) return null
  const match = DEALER_CODE_RULES.find((rule) => normalizedCode.includes(rule.key))
  if (!match) return null
  return { location: match.location, fuel_type: match.fuel_type }
}

function normalizeDepartmentForStorage(value: string | null | undefined): string | null {
  const normalized = normalizeDepartmentDisplay(value)
  return normalized || null
}

function isMissingBodyshopSurveyorTableError(message: string | null | undefined): boolean {
  if (!message) return false
  const normalized = message.toLowerCase()
  return normalized.includes('code: 42p01') || normalized.includes('settings_bodyshop_surveyors')
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

        // Optional headers for location, fuel_type, role, and bank details.
        const locationHeader = normalizedToOriginal.get('location')
        const fuelTypeHeader = normalizedToOriginal.get('fuel type') || normalizedToOriginal.get('fuel_type')
        const roleHeader = normalizedToOriginal.get('role') || normalizedToOriginal.get('rote')
        const bankNameHeader = normalizedToOriginal.get('bank name') || normalizedToOriginal.get('bank_name')
        const accountNumberHeader =
          normalizedToOriginal.get('account number') ||
          normalizedToOriginal.get('account_number') ||
          normalizedToOriginal.get('a/c number')
        const ifscHeader = normalizedToOriginal.get('ifsc') || normalizedToOriginal.get('ifsc code') || normalizedToOriginal.get('ifsc_code')

        if (missingHeaders.length > 0) {
          reject(new Error(`Missing required headers: ${missingHeaders.join(', ')}`))
          return
        }

        const parsedRows = rows
          .map((row) => {
            const code = String(row[resolvedHeaders.employee_code] ?? '').trim()
            const name = String(row[resolvedHeaders.employee_name] ?? '').trim()
            const department = String(row[resolvedHeaders.department] ?? '').trim()
            const location = locationHeader ? String(row[locationHeader] ?? '').trim() : ''
            const fuelType = fuelTypeHeader ? String(row[fuelTypeHeader] ?? '').trim() : ''
            const role = roleHeader ? String(row[roleHeader] ?? '').trim() : ''
            const bankName = bankNameHeader ? String(row[bankNameHeader] ?? '').trim() : ''
            const accountNumber = accountNumberHeader ? String(row[accountNumberHeader] ?? '').trim() : ''
            const ifsc = ifscHeader ? String(row[ifscHeader] ?? '').trim() : ''
            const derived = deriveLocationAndFuelType(code)

            if (!code || !name) {
              return null
            }

            return {
              employee_code: code,
              employee_name: name,
              location: location || derived?.location || null,
              department: normalizeDepartmentForStorage(department),
              fuel_type: derived?.fuel_type ?? (fuelType || null),
              role: role || null,
              bank_name: bankName || null,
              account_number: accountNumber || null,
              ifsc: ifsc || null,
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
  const [editBaselineCodes, setEditBaselineCodes] = useState<Record<number, string>>({})

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
    role: '',
    bank_name: '',
    account_number: '',
    ifsc: '',
  })
  const [employeeSearch, setEmployeeSearch] = useState('')
  const [showAddEmployeeForm, setShowAddEmployeeForm] = useState(false)

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase()
    if (!query) return employees

    return employees.filter((employee) => {
      const haystack = [
        employee.employee_code,
        employee.employee_name,
        employee.location ?? '',
        employee.department ?? '',
        employee.fuel_type ?? '',
        employee.role ?? '',
        employee.bank_name ?? '',
        employee.account_number ?? '',
        employee.ifsc ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [employees, employeeSearch])

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
      Role: emp.role || '',
      'Bank Name': emp.bank_name || '',
      'Account Number': emp.account_number || '',
      IFSC: emp.ifsc || '',
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
  const [selectedSectionId, setSelectedSectionId] = useState<SettingsSectionId>(DEFAULT_SETTINGS_SECTION_ID)
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [newModelName, setNewModelName] = useState('')
  const [editingModelId, setEditingModelId] = useState<number | null>(null)
  const [editingModelValue, setEditingModelValue] = useState('')
  const [savingModel, setSavingModel] = useState(false)
  const [deletingModelId, setDeletingModelId] = useState<number | null>(null)
  const [bodyshopSurveyors, setBodyshopSurveyors] = useState<BodyshopSurveyor[]>([])
  const [loadingBodyshopSurveyors, setLoadingBodyshopSurveyors] = useState(false)
  const [bodyshopSurveyorTableReady, setBodyshopSurveyorTableReady] = useState(true)
  const [newBodyshopSurveyor, setNewBodyshopSurveyor] = useState<BodyshopSurveyorDraft>({
    surveyor_name: '',
    surveyor_contact_number: '',
    surveyor_email: '',
  })
  const [savingBodyshopSurveyor, setSavingBodyshopSurveyor] = useState(false)
  const [deletingBodyshopSurveyorId, setDeletingBodyshopSurveyorId] = useState<number | null>(null)
  const [editingBodyshopSurveyorId, setEditingBodyshopSurveyorId] = useState<number | null>(null)
  const [editingBodyshopSurveyorDraft, setEditingBodyshopSurveyorDraft] = useState<BodyshopSurveyorDraft>({
    surveyor_name: '',
    surveyor_contact_number: '',
    surveyor_email: '',
  })

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

  const derivedBranches = useMemo(() => {
    const values = new Set(
      employees
        .map((employee) => String(employee.location ?? '').trim())
        .filter(Boolean),
    )
    return Array.from(values).sort((a, b) => a.localeCompare(b))
  }, [employees])

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

  const selectedIssueCount = useMemo(() => Object.values(selectedIssueIds).filter(Boolean).length, [selectedIssueIds])

  async function loadModelOptions() {
    setLoadingModels(true)
    const result = await listModelOptions()
    setLoadingModels(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setModelOptions(result.data ?? [])
  }

  async function loadBodyshopSurveyors() {
    setLoadingBodyshopSurveyors(true)
    const result = await listBodyshopSurveyors()
    setLoadingBodyshopSurveyors(false)

    if (result.error) {
      if (isMissingBodyshopSurveyorTableError(result.error)) {
        setBodyshopSurveyorTableReady(false)
        setBodyshopSurveyors([])
        return
      }
      setError(result.error)
      return
    }

    setBodyshopSurveyorTableReady(true)
    setBodyshopSurveyors(result.data ?? [])
  }

  useEffect(() => {
    void loadModelOptions()
    void loadBodyshopSurveyors()
  }, [])

  const settingsCards = useMemo<
    Array<{ id: SettingsSectionId; icon: string; title: string; description: string; stat: string }>
  >(
    () => [
      {
        id: 'branch-management',
        icon: 'building',
        title: 'Branch Management',
        description: 'Read-only branch list derived from Employee Master locations.',
        stat: `${derivedBranches.length} branches`,
      },
      {
        id: 'employee-master',
        icon: 'user',
        title: 'Employee Master',
        description: 'Upload, edit, and maintain employee mapping data.',
        stat: `${employees.length} employees`,
      },
      {
        id: 'bodyshop-surveyor',
        icon: 'user',
        title: 'Bodyshop Surveyor',
        description: 'Maintain surveyor contacts for downstream bodyshop workflows.',
        stat: `${bodyshopSurveyors.length} surveyors`,
      },
      {
        id: 'models',
        icon: 'truck',
        title: 'Models',
        description: 'Manage dropdown model values for future use.',
        stat: `${modelOptions.length} models`,
      },
      {
        id: 'autodoc-rate-cards',
        icon: 'doc',
        title: 'AutoDoc Rate Cards',
        description: 'Import and activate city-category labour rate cards.',
        stat: `${rateCards.length} cards`,
      },
      {
        id: 'unmapped-sr-entries',
        icon: 'alert',
        title: 'Unmapped SR Entries (All Pendencies)',
        description: 'Review and resolve unresolved SR mapping issues.',
        stat: `${issues.length} issues`,
      },
    ],
    [bodyshopSurveyors.length, derivedBranches.length, employees.length, issues.length, modelOptions.length, rateCards.length],
  )

  const openSettingReference = useCallback((sectionId: SettingsSectionId) => {
    setSelectedSectionId(sectionId)
    window.history.replaceState(null, '', `#${sectionId}`)
  }, [])

  useEffect(() => {
    const syncSectionFromHash = () => {
      const sectionId = window.location.hash.replace('#', '').trim()
      if (isSettingsSectionId(sectionId)) {
        setSelectedSectionId(sectionId)
        return
      }

      setSelectedSectionId(DEFAULT_SETTINGS_SECTION_ID)
      window.history.replaceState(null, '', `#${DEFAULT_SETTINGS_SECTION_ID}`)
    }

    syncSectionFromHash()
    window.addEventListener('hashchange', syncSectionFromHash)
    return () => window.removeEventListener('hashchange', syncSectionFromHash)
  }, [])

  useEffect(() => {
    const element = document.getElementById(selectedSectionId)
    if (!element) return
    window.requestAnimationFrame(() => {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [selectedSectionId])

  const fetchEmployees = useCallback(async () => {
    setLoadingEmployees(true)
    const { data, error: fetchError } = await supabase
      .from('employee_master')
      .select('id, employee_code, employee_name, location, department, fuel_type, role, bank_name, account_number, ifsc')
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

    const baselineCode = String(editBaselineCodes[employee.id] ?? '').trim()
    const nextCode = employee.employee_code.trim()
    const codeChanged = baselineCode !== '' && baselineCode !== nextCode
    const updatePayload: Partial<EmployeeRow> & { employee_name: string } = {
      employee_name: employee.employee_name.trim(),
      location: employee.location?.trim() || null,
      department: normalizeDepartmentForStorage(employee.department),
      fuel_type: employee.fuel_type?.trim() || null,
      role: employee.role?.trim() || null,
      bank_name: employee.bank_name?.trim() || null,
      account_number: employee.account_number?.trim() || null,
      ifsc: employee.ifsc?.trim().toUpperCase() || null,
    }

    // Avoid updating employee_code unless it was actually changed.
    // This preserves force-edited fuel/location values for existing codes.
    if (codeChanged) {
      updatePayload.employee_code = nextCode
    }

    if (!nextCode || !updatePayload.employee_name) {
      setError('Employee code and employee name are required.')
      setSavingCode(null)
      return false
    }

    const { error: saveError } = await supabase
      .from('employee_master')
      .update(updatePayload)
      .eq('id', employee.id)

    if (saveError) {
      setError(saveError.message)
    } else {
      setMessage(`Saved ${nextCode}.`)
      setEditBaselineCodes((prev) => {
        const next = { ...prev }
        delete next[employee.id]
        return next
      })
      await fetchEmployees()
    }

    setSavingCode(null)

    return !saveError
  }, [editBaselineCodes, fetchEmployees])

  const handleAddEmployee = useCallback(async () => {
    setMessage(null)
    setError(null)

    const derived = deriveLocationAndFuelType(newEmployee.employee_code)

    const payload = {
      employee_code: newEmployee.employee_code.trim(),
      employee_name: newEmployee.employee_name.trim(),
      location: newEmployee.location.trim() || derived?.location || null,
      department: normalizeDepartmentForStorage(newEmployee.department),
      fuel_type: newEmployee.fuel_type.trim() || derived?.fuel_type || null,
      role: newEmployee.role.trim() || null,
      bank_name: newEmployee.bank_name.trim() || null,
      account_number: newEmployee.account_number.trim() || null,
      ifsc: newEmployee.ifsc.trim().toUpperCase() || null,
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

    setNewEmployee({
      employee_code: '',
      employee_name: '',
      location: '',
      department: '',
      fuel_type: '',
      role: '',
      bank_name: '',
      account_number: '',
      ifsc: '',
    })
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

  function normalizeModelInput(value: string): string {
    return value.trim().replace(/\s+/g, ' ')
  }

  function modelExists(value: string, excludeId?: number): boolean {
    const normalized = normalizeModelInput(value).toLowerCase()
    return modelOptions.some((model) => {
      if (excludeId !== undefined && model.id === excludeId) return false
      return normalizeModelInput(model.model_name).toLowerCase() === normalized
    })
  }

  async function handleAddModel() {
    setError(null)
    setMessage(null)

    const normalized = normalizeModelInput(newModelName)
    if (!normalized) {
      setError('Model name cannot be empty.')
      return
    }

    if (modelExists(normalized)) {
      setError(`Model "${normalized}" already exists.`)
      return
    }

    setSavingModel(true)
    const result = await createModelOption(normalized, modelOptions.length)
    setSavingModel(false)

    if (result.error) {
      setError(result.error)
      return
    }

    await loadModelOptions()
    setNewModelName('')
    setMessage(`Model "${normalized}" added.`)
  }

  function handleStartEditModel(model: ModelOption) {
    setEditingModelId(model.id)
    setEditingModelValue(model.model_name)
    setError(null)
    setMessage(null)
  }

  async function handleSaveModelEdit(model: ModelOption) {
    setError(null)
    setMessage(null)

    const normalized = normalizeModelInput(editingModelValue)
    if (!normalized) {
      setError('Model name cannot be empty.')
      return
    }

    if (modelExists(normalized, model.id)) {
      setError(`Model "${normalized}" already exists.`)
      return
    }

    setSavingModel(true)
    const result = await updateModelOption(model.id, { modelName: normalized })
    setSavingModel(false)

    if (result.error) {
      setError(result.error)
      return
    }

    await loadModelOptions()
    setEditingModelId(null)
    setEditingModelValue('')
    setMessage(`Model updated to "${normalized}".`)
  }

  async function handleDeleteModel(model: ModelOption) {
    const value = model.model_name
    if (!value) return
    if (!window.confirm(`Delete model "${value}"?`)) return

    setDeletingModelId(model.id)
    const result = await deleteModelOption(model.id)
    setDeletingModelId(null)

    if (result.error) {
      setError(result.error)
      return
    }

    await loadModelOptions()
    if (editingModelId === model.id) {
      setEditingModelId(null)
      setEditingModelValue('')
    }
    setMessage(`Model "${value}" deleted.`)
  }

  async function handleAddBodyshopSurveyor() {
    setError(null)
    setMessage(null)

    if (!bodyshopSurveyorTableReady) {
      setError('Bodyshop Surveyor table is not available yet. Run the migration first.')
      return
    }

    setSavingBodyshopSurveyor(true)
    const result = await createBodyshopSurveyor({
      surveyorName: newBodyshopSurveyor.surveyor_name,
      surveyorContactNumber: newBodyshopSurveyor.surveyor_contact_number,
      surveyorEmail: newBodyshopSurveyor.surveyor_email,
    })
    setSavingBodyshopSurveyor(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setNewBodyshopSurveyor({
      surveyor_name: '',
      surveyor_contact_number: '',
      surveyor_email: '',
    })
    setMessage('Bodyshop surveyor added.')
    await loadBodyshopSurveyors()
  }

  function handleStartEditBodyshopSurveyor(surveyor: BodyshopSurveyor) {
    setEditingBodyshopSurveyorId(surveyor.id)
    setEditingBodyshopSurveyorDraft({
      surveyor_name: surveyor.surveyor_name,
      surveyor_contact_number: surveyor.surveyor_contact_number,
      surveyor_email: surveyor.surveyor_email ?? '',
    })
    setError(null)
    setMessage(null)
  }

  async function handleSaveBodyshopSurveyorEdit() {
    if (editingBodyshopSurveyorId == null) return

    setError(null)
    setMessage(null)
    setSavingBodyshopSurveyor(true)

    const result = await updateBodyshopSurveyor(editingBodyshopSurveyorId, {
      surveyorName: editingBodyshopSurveyorDraft.surveyor_name,
      surveyorContactNumber: editingBodyshopSurveyorDraft.surveyor_contact_number,
      surveyorEmail: editingBodyshopSurveyorDraft.surveyor_email,
    })

    setSavingBodyshopSurveyor(false)

    if (result.error) {
      setError(result.error)
      return
    }

    setEditingBodyshopSurveyorId(null)
    setEditingBodyshopSurveyorDraft({
      surveyor_name: '',
      surveyor_contact_number: '',
      surveyor_email: '',
    })
    setMessage('Bodyshop surveyor updated.')
    await loadBodyshopSurveyors()
  }

  async function handleDeleteBodyshopSurveyor(surveyor: BodyshopSurveyor) {
    if (!window.confirm(`Delete surveyor "${surveyor.surveyor_name}"?`)) return

    setDeletingBodyshopSurveyorId(surveyor.id)
    setError(null)
    setMessage(null)

    const result = await deleteBodyshopSurveyor(surveyor.id)
    setDeletingBodyshopSurveyorId(null)

    if (result.error) {
      setError(result.error)
      return
    }

    if (editingBodyshopSurveyorId === surveyor.id) {
      setEditingBodyshopSurveyorId(null)
      setEditingBodyshopSurveyorDraft({
        surveyor_name: '',
        surveyor_contact_number: '',
        surveyor_email: '',
      })
    }

    setMessage('Bodyshop surveyor deleted.')
    await loadBodyshopSurveyors()
  }

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

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 px-5 py-4">
            <h2 className="text-sm font-semibold text-gray-900">Settings Sections</h2>
            <p className="mt-1 text-xs text-gray-600">Open any card to jump directly to that setting.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
            {settingsCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => openSettingReference(card.id)}
                className={[
                  'group rounded-xl border p-4 text-left transition-all duration-200',
                  selectedSectionId === card.id
                    ? 'border-blue-300 bg-blue-50 shadow-sm'
                    : 'border-gray-200 bg-gray-50/70 hover:border-blue-300 hover:bg-blue-50/70 hover:shadow-sm',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={[
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                      selectedSectionId === card.id
                        ? 'border-blue-200 bg-white text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 group-hover:text-blue-700',
                    ].join(' ')}
                  >
                    <Icon name={card.icon} size={16} strokeWidth={2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-900">{card.title}</div>
                    <p className="mt-1 text-xs leading-5 text-gray-600">{card.description}</p>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{card.stat}</p>
                  </div>
                </div>
                <div
                  className={[
                    'mt-3 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide',
                    selectedSectionId === card.id ? 'text-blue-700' : 'text-gray-500 group-hover:text-blue-700',
                  ].join(' ')}
                >
                  {selectedSectionId === card.id ? 'Opened' : 'Open section'}
                  <Icon name={selectedSectionId === card.id ? 'chevron' : 'arrowr'} size={13} strokeWidth={2.2} />
                </div>
              </button>
            ))}
          </div>
        </section>

        {selectedSectionId === 'models' && (
        <section id="models" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Models <span className="font-medium text-gray-500">({modelOptions.length})</span>
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Vehicle model dropdown values used across intake and job cards.
              </p>
            </div>
          </div>

          <div className="space-y-4 p-5">
            <div className="flex flex-col gap-2 sm:max-w-xl sm:flex-row">
              <input
                type="text"
                value={newModelName}
                onChange={(event) => setNewModelName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    handleAddModel()
                  }
                }}
                placeholder="Add new model name"
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none ring-blue-100 focus:border-blue-500 focus:ring"
              />
              <button
                type="button"
                onClick={handleAddModel}
                disabled={!newModelName.trim() || savingModel}
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="plus" size={14} strokeWidth={2.2} />
                {savingModel ? 'Saving...' : 'Add Model'}
              </button>
            </div>

            {loadingModels ? (
              <p className="py-3 text-sm text-gray-400">Loading models...</p>
            ) : modelOptions.length === 0 ? (
              <p className="py-3 text-sm text-gray-400">No models configured.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {modelOptions.map((model) => (
                  <div
                    key={model.id}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-xs"
                  >
                    {editingModelId === model.id ? (
                      <>
                        <input
                          value={editingModelValue}
                          onChange={(event) => setEditingModelValue(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              void handleSaveModelEdit(model)
                            }
                          }}
                          className="min-w-[140px] rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            void handleSaveModelEdit(model)
                          }}
                          disabled={savingModel}
                          className="rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700"
                        >
                          {savingModel ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingModelId(null)
                            setEditingModelValue('')
                          }}
                          disabled={savingModel}
                          className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="px-1 font-semibold text-gray-700">{model.model_name}</span>
                        <button
                          type="button"
                          onClick={() => handleStartEditModel(model)}
                          disabled={deletingModelId === model.id || savingModel}
                          className="rounded-full border border-amber-200 bg-amber-50 p-1 text-amber-700"
                          aria-label={`Edit model ${model.model_name}`}
                        >
                          <Icon name="dots" size={11} strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteModel(model)
                          }}
                          disabled={deletingModelId === model.id}
                          className="rounded-full border border-red-200 bg-red-50 p-1 text-red-700"
                          aria-label={`Delete model ${model.model_name}`}
                        >
                          <Icon name="x" size={11} strokeWidth={2.4} />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-semibold">#</th>
                    <th className="px-3 py-2 font-semibold">Model Name</th>
                    <th className="px-3 py-2 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingModels ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={3}>Loading models...</td>
                    </tr>
                  ) : modelOptions.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={3}>No models configured.</td>
                    </tr>
                  ) : (
                    modelOptions.map((model, index) => (
                      <tr key={model.id} className="border-b border-gray-100">
                        <td className="px-3 py-2 text-gray-500">{index + 1}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium text-gray-800">{model.model_name}</span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleStartEditModel(model)}
                              disabled={deletingModelId === model.id || savingModel}
                              className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void handleDeleteModel(model)
                              }}
                              disabled={deletingModelId === model.id}
                              className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700"
                            >
                              {deletingModelId === model.id ? 'Deleting...' : 'Delete'}
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
        )}

        {selectedSectionId === 'branch-management' && (
        <section id="branch-management" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Branch Management <span className="font-medium text-gray-500">({derivedBranches.length})</span>
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Runtime source is Employee Master. This list is derived from Employee Master `location` values.
              </p>
            </div>
          </div>
          <div className="space-y-4 p-5">
            {derivedBranches.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">No branch values found in Employee Master location.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                      <th className="px-3 py-2 font-semibold">Sort</th>
                      <th className="px-3 py-2 font-semibold">Branch</th>
                      <th className="px-3 py-2 font-semibold">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derivedBranches.map((branch, index) => (
                      <tr key={branch} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-mono text-gray-400">{index + 1}</td>
                        <td className="px-3 py-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
                            <Icon name="building" size={13} strokeWidth={2.2} />
                            <span className="font-medium">{branch}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            Employee Master
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
        )}

        {selectedSectionId === 'employee-master' && (
        <section id="employee-master" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Employee Master <span className="font-medium text-gray-500">({employees.length})</span>
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Service-advisor master list used for SR to employee mapping. Location and Fuel Type auto-derive from SA code rules.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void handleExportEmployees()}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="download" size={13} strokeWidth={2.2} />
                Export
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="upload" size={13} strokeWidth={2.2} />
                {uploading ? 'Uploading...' : 'Import'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddEmployeeForm((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <Icon name={showAddEmployeeForm ? 'x' : 'plus'} size={13} strokeWidth={2.3} />
                {showAddEmployeeForm ? 'Cancel' : 'Add'}
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

          <div className="space-y-4 px-5 py-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Governance: This Role column is the Business Role source of truth (for example SA, CRM, TECHNICIAN, FLOOR INCHARGE, SM, GM). Platform Role is managed in Admin → Users.
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-gray-400">
                  <Icon name="search" size={14} strokeWidth={2.2} />
                </span>
                <input
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                  placeholder="Search code, name, role, location, bank, IFSC"
                  className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-xs outline-none ring-blue-100 focus:border-blue-500 focus:ring"
                />
              </div>
              <span className="text-xs font-medium text-gray-500">{filteredEmployees.length} shown</span>
            </div>

            {showAddEmployeeForm && (
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-10">
              <input
                value={newEmployee.employee_code}
                onChange={(event) => {
                  const employeeCode = event.target.value
                  const derived = deriveLocationAndFuelType(employeeCode)
                  setNewEmployee((prev) => ({
                    ...prev,
                    employee_code: employeeCode,
                    location: derived?.location ?? prev.location,
                    fuel_type: derived?.fuel_type ?? prev.fuel_type,
                  }))
                }}
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
                value={newEmployee.role}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, role: event.target.value }))}
                placeholder="Business Role"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={newEmployee.bank_name}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, bank_name: event.target.value }))}
                placeholder="Bank Name"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={newEmployee.account_number}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, account_number: event.target.value }))}
                placeholder="Account Number"
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <input
                value={newEmployee.ifsc}
                onChange={(event) => setNewEmployee((prev) => ({ ...prev, ifsc: event.target.value.toUpperCase() }))}
                placeholder="IFSC"
                className="rounded border border-gray-300 px-2 py-1 text-xs uppercase"
              />
              <div className="flex items-center md:justify-end">
                <button
                  type="button"
                  onClick={() => void handleAddEmployee()}
                  className="inline-flex items-center gap-1 rounded bg-gray-800 px-3 py-1 text-xs font-semibold text-white"
                >
                  <Icon name="plus" size={12} strokeWidth={2.3} />
                  Save Employee
                </button>
              </div>
            </div>
            )}

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-semibold">SA CODE</th>
                    <th className="px-3 py-2 font-semibold">SA NAME</th>
                    <th className="px-3 py-2 font-semibold">Location</th>
                    <th className="px-3 py-2 font-semibold">Department</th>
                    <th className="px-3 py-2 font-semibold">Fuel Type</th>
                    <th className="px-3 py-2 font-semibold">Business Role</th>
                    <th className="px-3 py-2 font-semibold">Bank Name</th>
                    <th className="px-3 py-2 font-semibold">Account Number</th>
                    <th className="px-3 py-2 font-semibold">IFSC</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingEmployees ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={10}>Loading employees...</td>
                    </tr>
                  ) : filteredEmployees.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={10}>
                        {employees.length === 0 ? 'No employees found.' : 'No matching employees for current search.'}
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <tr key={employee.id} className="border-b border-gray-100">
                        <td className="px-3 py-2">
                          <input
                            value={employee.employee_code}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              const derived = deriveLocationAndFuelType(value)
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id
                                    ? {
                                        ...row,
                                        employee_code: value,
                                        location: derived?.location ?? null,
                                        fuel_type: derived?.fuel_type ?? null,
                                      }
                                    : row,
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
                            value={employee.role ?? ''}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, role: value } : row,
                                ),
                              )
                            }}
                            placeholder="Business Role"
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 disabled:text-gray-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.bank_name ?? ''}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, bank_name: value } : row,
                                ),
                              )
                            }}
                            placeholder="Bank Name"
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 disabled:text-gray-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.account_number ?? ''}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, account_number: value } : row,
                                ),
                              )
                            }}
                            placeholder="Account Number"
                            className="w-full rounded border border-gray-300 px-2 py-1 disabled:bg-gray-100 disabled:text-gray-600"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={employee.ifsc ?? ''}
                            disabled={editingEmployeeId !== employee.id}
                            onChange={(event) => {
                              const value = event.target.value.toUpperCase()
                              setEmployees((prev) =>
                                prev.map((row) =>
                                  row.id === employee.id ? { ...row, ifsc: value } : row,
                                ),
                              )
                            }}
                            placeholder="IFSC"
                            className="w-full rounded border border-gray-300 px-2 py-1 uppercase disabled:bg-gray-100 disabled:text-gray-600"
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
                                onClick={() => {
                                  setEditingEmployeeId(employee.id)
                                  setEditBaselineCodes((prev) => ({
                                    ...prev,
                                    [employee.id]: employee.employee_code,
                                  }))
                                }}
                                className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                              >
                                Edit
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDeleteEmployee(employee)}
                              disabled={deletingEmployeeId === employee.id || savingCode === employee.employee_code}
                              className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Icon name="trash" size={11} strokeWidth={2.2} />
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
        )}

        {selectedSectionId === 'bodyshop-surveyor' && (
        <section id="bodyshop-surveyor" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                Bodyshop Surveyor <span className="font-medium text-gray-500">({bodyshopSurveyors.length})</span>
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Recommended keys: surveyor_name, surveyor_contact_number, surveyor_email.
              </p>
            </div>
          </div>

          <div className="space-y-4 px-5 py-4">
            {!bodyshopSurveyorTableReady && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Bodyshop Surveyor table not found. Run migration file from supabase/migrations to enable this section.
              </div>
            )}

            <div className="grid grid-cols-1 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-10">
              <input
                value={newBodyshopSurveyor.surveyor_name}
                onChange={(event) =>
                  setNewBodyshopSurveyor((prev) => ({
                    ...prev,
                    surveyor_name: event.target.value,
                  }))
                }
                placeholder="SURVEYOR NAME"
                className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-3"
              />
              <input
                value={newBodyshopSurveyor.surveyor_contact_number}
                onChange={(event) =>
                  setNewBodyshopSurveyor((prev) => ({
                    ...prev,
                    surveyor_contact_number: event.target.value,
                  }))
                }
                placeholder="SURVEYOR CONTACT NO"
                className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-3"
              />
              <input
                value={newBodyshopSurveyor.surveyor_email}
                onChange={(event) =>
                  setNewBodyshopSurveyor((prev) => ({
                    ...prev,
                    surveyor_email: event.target.value,
                  }))
                }
                placeholder="SURVEYOR MAIL ID"
                className="rounded border border-gray-300 px-2 py-1 text-xs md:col-span-3"
              />
              <div className="flex items-center md:justify-end md:col-span-1">
                <button
                  type="button"
                  onClick={() => void handleAddBodyshopSurveyor()}
                  disabled={!bodyshopSurveyorTableReady || savingBodyshopSurveyor}
                  className="inline-flex items-center gap-1 rounded bg-gray-800 px-3 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="plus" size={12} strokeWidth={2.3} />
                  {savingBodyshopSurveyor ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
                    <th className="px-3 py-2 font-semibold">SURVEYOR NAME</th>
                    <th className="px-3 py-2 font-semibold">SURVEYOR CONTACT NO</th>
                    <th className="px-3 py-2 font-semibold">SURVEYOR MAIL ID</th>
                    <th className="px-3 py-2 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingBodyshopSurveyors ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={4}>Loading surveyors...</td>
                    </tr>
                  ) : bodyshopSurveyors.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-gray-400" colSpan={4}>No surveyors configured.</td>
                    </tr>
                  ) : (
                    bodyshopSurveyors.map((surveyor) => (
                      <tr key={surveyor.id} className="border-b border-gray-100">
                        {editingBodyshopSurveyorId === surveyor.id ? (
                          <>
                            <td className="px-3 py-2">
                              <input
                                value={editingBodyshopSurveyorDraft.surveyor_name}
                                onChange={(event) =>
                                  setEditingBodyshopSurveyorDraft((prev) => ({
                                    ...prev,
                                    surveyor_name: event.target.value,
                                  }))
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={editingBodyshopSurveyorDraft.surveyor_contact_number}
                                onChange={(event) =>
                                  setEditingBodyshopSurveyorDraft((prev) => ({
                                    ...prev,
                                    surveyor_contact_number: event.target.value,
                                  }))
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={editingBodyshopSurveyorDraft.surveyor_email}
                                onChange={(event) =>
                                  setEditingBodyshopSurveyorDraft((prev) => ({
                                    ...prev,
                                    surveyor_email: event.target.value,
                                  }))
                                }
                                className="w-full rounded border border-gray-300 px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleSaveBodyshopSurveyorEdit()}
                                  disabled={savingBodyshopSurveyor}
                                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {savingBodyshopSurveyor ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingBodyshopSurveyorId(null)
                                    setEditingBodyshopSurveyorDraft({
                                      surveyor_name: '',
                                      surveyor_contact_number: '',
                                      surveyor_email: '',
                                    })
                                  }}
                                  disabled={savingBodyshopSurveyor}
                                  className="rounded bg-gray-500 px-3 py-1 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 font-medium text-gray-800">{surveyor.surveyor_name}</td>
                            <td className="px-3 py-2">{surveyor.surveyor_contact_number}</td>
                            <td className="px-3 py-2">{surveyor.surveyor_email ?? '-'}</td>
                            <td className="px-3 py-2">
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditBodyshopSurveyor(surveyor)}
                                  className="rounded border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    void handleDeleteBodyshopSurveyor(surveyor)
                                  }}
                                  disabled={deletingBodyshopSurveyorId === surveyor.id}
                                  className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <Icon name="trash" size={11} strokeWidth={2.2} />
                                  {deletingBodyshopSurveyorId === surveyor.id ? 'Deleting...' : 'Delete'}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        )}

        {selectedSectionId === 'autodoc-rate-cards' && (
        <section id="autodoc-rate-cards" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                AutoDoc Rate Cards <span className="font-medium text-gray-500">({rateCards.length})</span>
              </h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Upload model-wise panel labour rates (PP / PM / PS) and activate per city category.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleExportRateFile()}
                disabled={exportingRates || uploadingRates}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="download" size={13} strokeWidth={2.2} />
                {exportingRates ? 'Exporting...' : 'Export'}
              </button>
              <button
                type="button"
                onClick={() => rateFileInputRef.current?.click()}
                disabled={uploadingRates || exportingRates}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="upload" size={13} strokeWidth={2.2} />
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
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3 md:grid-cols-4 md:items-end">
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-600">Card Name</label>
                <input
                  value={rateUploadConfig.name}
                  onChange={(event) => setRateUploadConfig((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Water base paint labour rates"
                  className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs outline-none ring-blue-100 focus:border-blue-500 focus:ring"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-600">City Category</label>
                <select
                  value={rateUploadConfig.cityCategory}
                  onChange={(event) => setRateUploadConfig((prev) => ({ ...prev, cityCategory: event.target.value }))}
                  className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs outline-none ring-blue-100 focus:border-blue-500 focus:ring"
                >
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-600">Notes</label>
                <input
                  value={rateUploadConfig.notes}
                  onChange={(event) => setRateUploadConfig((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="e.g. incl. 6% water-base premium"
                  className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs outline-none ring-blue-100 focus:border-blue-500 focus:ring"
                />
              </div>
              <div className="flex h-full items-end">
                <label className="inline-flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700">
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

            <div className="overflow-x-auto rounded-lg border border-gray-200">
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
                        <td className="px-3 py-2">
                          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-gray-700">
                            <Icon name="doc" size={12} strokeWidth={2.2} />
                            <span className="font-semibold text-gray-800">{card.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                            {card.city_category}
                          </span>
                        </td>
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
                            className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
        )}

        {selectedSectionId === 'unmapped-sr-entries' && (
        <section id="unmapped-sr-entries" className="scroll-mt-24 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-gray-100 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Unmapped SR Entries (All Pendencies) <span className="font-medium text-gray-500">({issues.length})</span>
                </h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  All issues captured while importing VAS and JC closed data, including open and resolved.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleExportIssues()}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="download" size={13} strokeWidth={2.2} />
                Export Issues
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleAutoAssignAllPendencies()}
                disabled={loadingIssues || issues.length === 0 || loadingEmployees}
                className="inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="sparkles" size={13} strokeWidth={2.2} />
                Auto-Assign ALL Pendencies
              </button>
              <button
                type="button"
                onClick={() => void handleBulkAutoAssignAllVasJc()}
                disabled={loadingIssues || issues.length === 0 || loadingEmployees}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Auto-Assign ALL VAS JC
              </button>
              <button
                type="button"
                onClick={() => void handleAutoResolveVasJcByCode()}
                disabled={loadingIssues || issues.length === 0 || loadingEmployees}
                className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Assign VAS JC Names
              </button>
              <button
                type="button"
                onClick={() => void handleAutoResolveByCode()}
                disabled={loadingIssues || issues.length === 0 || loadingEmployees}
                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Auto-Resolve by Code
              </button>
            </div>
          </div>

          {!loadingIssues && issues.length > 0 && (
            <div className="border-b border-gray-100 px-5 py-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <div className="text-xs font-semibold text-blue-900">Total Issues</div>
                  <div className="mt-1 text-lg font-bold text-blue-600">{mappingStats.total}</div>
                </div>
                {Array.from(mappingStats.byBranch.entries()).map(([branch, stats]) => (
                  <div key={branch} className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                    <div className="text-xs font-semibold text-orange-900">{branch}</div>
                    <div className="mt-1 text-lg font-bold text-orange-600">{stats.unmapped}/{stats.total}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-b border-gray-100 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Search Job Card</label>
                <input
                  type="text"
                  placeholder="Filter by job card number"
                  value={filterJobCard}
                  onChange={(event) => setFilterJobCard(event.target.value)}
                  className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs outline-none ring-blue-100 focus:border-blue-500 focus:ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Search SR Name</label>
                <input
                  type="text"
                  placeholder="Filter by SR assigned to"
                  value={filterSrName}
                  onChange={(event) => setFilterSrName(event.target.value)}
                  className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs outline-none ring-blue-100 focus:border-blue-500 focus:ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-700">Filter Branch</label>
                <select
                  value={filterBranch}
                  onChange={(event) => setFilterBranch(event.target.value)}
                  className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-xs outline-none ring-blue-100 focus:border-blue-500 focus:ring"
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

          {!loadingIssues && filteredIssues.length > 0 && (
            <div className="border-b border-gray-100 bg-blue-50 px-5 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <span className="text-xs font-semibold text-blue-700">{selectedIssueCount} selected</span>
                <div className="flex-1">
                  <select
                    value={bulkEmployeeCode}
                    onChange={(event) => setBulkEmployeeCode(event.target.value)}
                    className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs"
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
                  disabled={bulkResolving || !bulkEmployeeCode || selectedIssueCount === 0}
                  className="rounded bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkResolving ? 'Resolving...' : `Bulk Resolve (${selectedIssueCount})`}
                </button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto p-5">
            <div className="overflow-x-auto rounded-lg border border-gray-200">
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
                        <td className="px-3 py-2">
                          <span className="rounded bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                            {issue.source_table}
                          </span>
                        </td>
                        <td className="px-3 py-2">{issue.branch}</td>
                        <td className="px-3 py-2 text-gray-500">{issue.row_number ?? '-'}</td>
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
                            className="rounded border border-gray-300 px-2 py-1.5"
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
                            className="rounded border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
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
          </div>
        </section>
        )}
      </div>
    </div>
  )
}
