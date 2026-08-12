import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import DateRangeFilter, { currentMonthRange, type DateRange } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import { getModelNames } from '../lib/api/settings'
import {
  bulkCreateReceptionEntries,
  createReceptionEntry,
  deleteReceptionEntry,
  getReceptionRevisitContext,
  getReceptionUpdationContext,
  isFloorInchargeServiceType,
  listReceptionEntriesByDateRangePage,
  searchReceptionEntriesForGlobalSearchPage,
  listReceptionEmployees,
  lookupVehicleByRegNumber,
  suggestAdvisorForVehicle,
  type ReceptionEmployeeOption,
  type ReceptionEntryInput,
  type ReceptionEntryRow,
  type ReceptionEntryPageCursor,
  type ReceptionRevisitContext,
  type ReceptionUpdationContext,
  type VehicleLookupResult,
  updateReceptionEntry,
} from '../lib/api'
import RevisitBadge from '../components/RevisitBadge'
import UpdationAvailableBadge from '../components/UpdationAvailableBadge'

const SOURCE_OPTIONS = ['Self', 'Driver Pickup', 'Walk-in', 'RSA']

const SETTINGS_MODELS_STORAGE_KEY = 'settings.models.v1'
const UNKNOWN_FUEL_TYPE = 'Unknown'
const UNKNOWN_SERVICE_TYPE = 'Null'
const UNKNOWN_LOCATION = 'Unknown'

const SERVICE_TYPE_ABBREVIATIONS: Record<string, string> = {
  'running repairs': 'RR',
  'first free service': 'FFS',
  'second free service': 'SFS',
  'third free service': 'TFS',
  'paid service': 'PS',
  'accident': 'ACC',
  'rusting': 'RST',
  'pdi': 'PDI',
  'campaign': 'CMP',
  'e breakdown': 'EBD',
  'updation': 'UPD',
  null: 'NULL',
}

const SERVICE_TYPE_CARD_ORDER = [
  'first free service',
  'second free service',
  'third free service',
  'paid service',
  'running repairs',
  'accident',
  'updation',
  'e breakdown',
  'campaign',
  'pdi',
  'rusting',
  'null',
]

const DEFAULT_MODEL_OPTIONS = [
  'Nexon',
  'Punch EV',
  'Tiago EV',
  'Tigor EV',
  'Altroz',
  'Curvv',
  'Curvv EV',
  'Harrier',
  'Harrier EV',
  'Hexa',
  'Nexon EV',
  'Punch',
  'Punch CNG',
  'Safari',
  'Sierra',
  'Tiago',
  'Tigor',
  'Xpres T Ev',
]

type FormState = {
  reg_number: string
  km_reading: string
  model: string
  fuel_type: string
  sa_employee_code: string
  owner_name: string
  owner_phone: string
  source: string
  service_type: string
}

const EMPTY_FORM: FormState = {
  reg_number: '',
  km_reading: '',
  model: '',
  fuel_type: '',
  sa_employee_code: '',
  owner_name: '',
  owner_phone: '',
  source: SOURCE_OPTIONS[0],
  service_type: '',
}

type ReceptionListFilter = 'default' | 'today'

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

const HEADER_ALIASES: Record<keyof FormState, string[]> = {
  reg_number: ['reg_number', 'registration no', 'registration number', 'vehicle registration number', 'vrn'],
  km_reading: ['km_reading', 'km reading', 'km', 'odometer', 'odometer reading', 'kms run', 'kms'],
  model: ['model', 'vehicle model'],
  sa_employee_code: ['sa_employee_code', 'employee_code', 'sa code', 'employee code', 'sa_code'],
  owner_name: ['owner_name', 'owner name'],
  owner_phone: ['owner_phone', 'owner phone'],
  source: ['source'],
  service_type: ['service_type', 'service type'],
  fuel_type: ['fuel_type', 'fuel type', 'portal'],
}

const IMPORT_SERVICE_TYPE_ALIASES = ['service_type', 'service type']

const RECEPTION_SERVICE_TYPE_OPTIONS = [
  'Running Repairs',
  'First Free Service',
  'Second Free Service',
  'Third Free Service',
  'Paid Service',
  'Accident',
  'Rusting',
  'PDI',
  'Campaign',
  'E Breakdown',
  'Updation',
]
const IMPORT_JC_NUMBER_ALIASES = ['jc_number', 'job card number', 'job card numbe', 'job card no']

function parseImportFile(file: File): Promise<{ rows: ReceptionEntryInput[]; skipped: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const matrix = XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, { header: 1, defval: '' })

        if (matrix.length === 0) {
          reject(new Error('The uploaded sheet is empty'))
          return
        }

        const normalizedRows = matrix.map((row) => row.map((value) => String(value ?? '').trim()))

        let headerIndex = 0
        for (let i = 0; i < Math.min(normalizedRows.length, 8); i += 1) {
          const candidate = normalizedRows[i].map((col) => normalizeHeader(col))
          if (candidate.some((col) => HEADER_ALIASES.reg_number.includes(col) || HEADER_ALIASES.sa_employee_code.includes(col))) {
            headerIndex = i
            break
          }
        }

        const headerRow = normalizedRows[headerIndex].map((col) => normalizeHeader(col))
        const indexMap = {} as Record<keyof FormState, number>

        ;(Object.keys(HEADER_ALIASES) as Array<keyof FormState>).forEach((key) => {
          indexMap[key] = -1
          const aliases = HEADER_ALIASES[key]
          for (let idx = 0; idx < headerRow.length; idx += 1) {
            if (aliases.includes(headerRow[idx])) {
              indexMap[key] = idx
              break
            }
          }
        })

        const serviceTypeIndex = headerRow.findIndex((col) => IMPORT_SERVICE_TYPE_ALIASES.includes(col))
        const jcNumberIndex = headerRow.findIndex((col) => IMPORT_JC_NUMBER_ALIASES.includes(col))

        if (indexMap.reg_number < 0 || indexMap.sa_employee_code < 0) {
          reject(new Error('Missing required headers. Required: reg_number, sa_employee_code'))
          return
        }

        const rows: ReceptionEntryInput[] = []
        let skipped = 0

        for (let i = headerIndex + 1; i < normalizedRows.length; i += 1) {
          const row = normalizedRows[i]

          const regNumber = row[indexMap.reg_number]?.trim() ?? ''
          const serviceType = serviceTypeIndex >= 0 ? row[serviceTypeIndex]?.trim() ?? null : null
          const saEmployeeCode = row[indexMap.sa_employee_code]?.trim() ?? ''

          if (!regNumber && !serviceType && !saEmployeeCode) {
            continue
          }

          if (!regNumber || !saEmployeeCode) {
            skipped += 1
            continue
          }

          rows.push({
            reg_number: regNumber,
            km_reading: (() => {
              const raw = indexMap.km_reading >= 0 ? row[indexMap.km_reading]?.trim() ?? '' : ''
              if (!raw) return null
              const parsed = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10)
              return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
            })(),
            model: indexMap.model >= 0 ? row[indexMap.model]?.trim() ?? '' : '',
            service_type: serviceType,
            sa_employee_code: saEmployeeCode,
            jc_number: jcNumberIndex >= 0 ? row[jcNumberIndex]?.trim() ?? '' : '',
            owner_name: indexMap.owner_name >= 0 ? row[indexMap.owner_name]?.trim() ?? '' : '',
            owner_phone: indexMap.owner_phone >= 0 ? row[indexMap.owner_phone]?.trim() ?? '' : '',
            source: indexMap.source >= 0 ? row[indexMap.source]?.trim() ?? SOURCE_OPTIONS[0] : SOURCE_OPTIONS[0],
          })
        }

        resolve({ rows, skipped })
      } catch (error) {
        reject(new Error(error instanceof Error ? error.message : 'Failed to parse uploaded file'))
      }
    }

    reader.onerror = () => reject(new Error('Could not read uploaded file'))
    reader.readAsArrayBuffer(file)
  })
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function sourceTone(source: string): string {
  const value = source.trim().toLowerCase()
  if (value === 'walk-in') return 'g'
  if (value === 'self') return 'w'
  if (value === 'driver pickup' || value === 'rsa') return 'b'
  return ''
}

function getFuelTypeLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || UNKNOWN_FUEL_TYPE
}

function getLocationLabel(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim()
  return trimmed || UNKNOWN_LOCATION
}

function normalizeName(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeServiceType(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ')
}

function normalizeDepartment(value: string | null | undefined): string {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase()
  if (normalized === 'BODYSHOP') return 'BODY SHOP'
  return normalized
}

function getRequiredDepartmentForServiceType(serviceType: string | null | undefined): 'SERVICE' | 'BODY SHOP' | 'PDI' | 'RUSTING' {
  const normalized = normalizeServiceType(serviceType).toLowerCase()
  if (normalized === 'accident') return 'BODY SHOP'
  if (normalized === 'pdi') return 'PDI'
  if (normalized === 'rusting') return 'RUSTING'
  return 'SERVICE'
}

function normalizeFuelBucket(value: string | null | undefined): 'EV' | 'PV' | '' {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (!normalized) return ''
  return normalized.includes('EV') ? 'EV' : 'PV'
}

function inferRequiredFuelTypeFromModel(model: string | null | undefined): 'EV' | 'PV' {
  const normalized = String(model ?? '').trim().toUpperCase()
  return normalized.includes('EV') ? 'EV' : 'PV'
}

function shouldApplyFuelFilter(serviceType: string | null | undefined): boolean {
  return normalizeServiceType(serviceType).toLowerCase() !== 'accident'
}

function getServiceTypeLabel(value: string | null | undefined): string {
  const normalized = normalizeServiceType(value)
  if (normalized.toLowerCase() === 'null') return UNKNOWN_SERVICE_TYPE
  return normalized || UNKNOWN_SERVICE_TYPE
}

function getServiceTypeAbbreviation(label: string): string {
  const key = normalizeServiceType(label).toLowerCase()
  const mapped = SERVICE_TYPE_ABBREVIATIONS[key]
  if (mapped) return mapped

  const tokens = key.split(' ').filter(Boolean)
  if (tokens.length === 0) return 'UNK'
  if (tokens.length === 1) return tokens[0].slice(0, 3).toUpperCase()
  return tokens.map((token) => token[0]).join('').slice(0, 4).toUpperCase()
}

export default function ReceptionPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [entries, setEntries] = useState<ReceptionEntryRow[]>([])
  const [employeeOptions, setEmployeeOptions] = useState<ReceptionEmployeeOption[]>([])
  const [modelOptions, setModelOptions] = useState<string[]>([...DEFAULT_MODEL_OPTIONS])
  const [canImport, setCanImport] = useState(false)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState<DateRange>(currentMonthRange())
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [globalSearchEntries, setGlobalSearchEntries] = useState<ReceptionEntryRow[]>([])
  const [globalSearchCursor, setGlobalSearchCursor] = useState<ReceptionEntryPageCursor | null>(null)
  const [globalSearchHasMore, setGlobalSearchHasMore] = useState(false)
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false)
  const [globalSearchLoadingMore, setGlobalSearchLoadingMore] = useState(false)
  const [selectedListFilter, setSelectedListFilter] = useState<ReceptionListFilter>('default')
  const [selectedLocation] = useState<string | 'all'>('all')
  const [selectedFuelType, setSelectedFuelType] = useState<string | 'all'>('all')
  const [selectedServiceType, setSelectedServiceType] = useState<string | 'all'>('all')
  const [listCursor, setListCursor] = useState<ReceptionEntryPageCursor | null>(null)
  const [hasMoreEntries, setHasMoreEntries] = useState(false)
  const [loadingMoreEntries, setLoadingMoreEntries] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [revisitContext, setRevisitContext] = useState<ReceptionRevisitContext | null>(null)
  // Ref for accessing latest revisit state inside async callbacks (avoids stale closure)
  const revisitContextRef = useRef<ReceptionRevisitContext | null>(null)
  const [revisitChecking, setRevisitChecking] = useState(false)
  const [updationContext, setUpdationContext] = useState<ReceptionUpdationContext | null>(null)
  const [updationChecking, setUpdationChecking] = useState(false)
  const revisitDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const updationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Vehicle lookup state
  const [vehicleInfo, setVehicleInfo] = useState<VehicleLookupResult | null>(null)
  const [vehicleLooking, setVehicleLooking] = useState(false)
  const [vehicleError, setVehicleError] = useState<string | null>(null)
  const vehicleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const todayKey = useMemo(() => {
    const now = new Date()
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  }, [])

  const todayEntries = useMemo(() => {
    return entries.filter((entry) => {
      const created = new Date(entry.created_at)
      if (Number.isNaN(created.getTime())) return false

      const createdKey = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(created)

      return createdKey === todayKey
    })
  }, [entries, todayKey])

  const locationFilterBaseEntries = useMemo(() => {
    if (selectedListFilter === 'today') return todayEntries
    return entries
  }, [entries, selectedListFilter, todayEntries])

  const locationOptions = useMemo(() => {
    const values = Array.from(
      new Set(locationFilterBaseEntries.map((entry) => getLocationLabel(entry.branch))),
    )
    return values.sort((a, b) => a.localeCompare(b))
  }, [locationFilterBaseEntries])

  const fuelFilterBaseEntries = useMemo(() => {
    if (selectedLocation === 'all') return locationFilterBaseEntries
    return locationFilterBaseEntries.filter((entry) => getLocationLabel(entry.branch) === selectedLocation)
  }, [locationFilterBaseEntries, selectedLocation])

  const employeeFuelTypeByCode = useMemo(() => {
    return new Map(
      employeeOptions.map((employee) => [
        String(employee.employee_code ?? '').trim().toUpperCase(),
        getFuelTypeLabel(employee.fuel_type),
      ]),
    )
  }, [employeeOptions])

  const employeeFuelTypeByName = useMemo(() => {
    return new Map(
      employeeOptions.map((employee) => [
        String(employee.employee_name ?? '').trim().toLowerCase(),
        getFuelTypeLabel(employee.fuel_type),
      ]),
    )
  }, [employeeOptions])

  const getEntryFuelTypeLabel = (entry: ReceptionEntryRow): string => {
    const rowFuelType = String(entry.fuel_type ?? '').trim()
    if (rowFuelType) return rowFuelType

    const codeKey = String(entry.sa_employee_code ?? '').trim().toUpperCase()
    if (codeKey) {
      const byCode = employeeFuelTypeByCode.get(codeKey)
      if (byCode) return byCode
    }

    const nameKey = String(entry.sa_name ?? '').trim().toLowerCase()
    if (nameKey) {
      const byName = employeeFuelTypeByName.get(nameKey)
      if (byName) return byName
    }

    return UNKNOWN_FUEL_TYPE
  }

  const fuelTypeOptions = useMemo(() => {
    const values = Array.from(
      new Set(fuelFilterBaseEntries.map((entry) => getEntryFuelTypeLabel(entry))),
    )
    return values.sort((a, b) => a.localeCompare(b))
  }, [fuelFilterBaseEntries, employeeFuelTypeByCode, employeeFuelTypeByName])

  const serviceTypeBaseEntries = useMemo(() => {
    if (selectedFuelType === 'all') return fuelFilterBaseEntries
    return fuelFilterBaseEntries.filter((entry) => getEntryFuelTypeLabel(entry) === selectedFuelType)
  }, [fuelFilterBaseEntries, selectedFuelType, employeeFuelTypeByCode, employeeFuelTypeByName])

  const serviceTypeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    serviceTypeBaseEntries.forEach((entry) => {
      const label = getServiceTypeLabel(entry.service_type)
      counts.set(label, (counts.get(label) ?? 0) + 1)
    })
    return counts
  }, [serviceTypeBaseEntries])

  const serviceTypeOptions = useMemo(() => {
    const orderMap = new Map(SERVICE_TYPE_CARD_ORDER.map((key, index) => [key, index]))

    return Array.from(serviceTypeCounts.keys()).sort((a, b) => {
      const aKey = normalizeServiceType(a).toLowerCase()
      const bKey = normalizeServiceType(b).toLowerCase()
      const aOrder = orderMap.get(aKey)
      const bOrder = orderMap.get(bKey)

      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder
      if (aOrder !== undefined) return -1
      if (bOrder !== undefined) return 1
      return a.localeCompare(b)
    })
  }, [serviceTypeCounts])

  const sortedEmployeeOptions = useMemo(() => {
    // Business rule (source of truth):
    // 1) Department: SERVICE (default for all reception entries).
    // 2) Fuel Type: Determined from vehicleInfo.vehicle_type (primary) or model name (fallback).
    //    EV vehicles => only EV advisors, PV vehicles => only PV advisors.
    // 3) SA dropdown shows employee_master rows matching BOTH department and fuel_type.
    // Keep this rule in sync with Settings > Employee Master to avoid behavior drift.
    const requiredDepartment = getRequiredDepartmentForServiceType(form.service_type)
    const useFuelFilter = shouldApplyFuelFilter(form.service_type)
    // Primary: use form.fuel_type (set by vehicle lookup or manual selection)
    // Secondary: vehicleInfo.vehicle_type from lookup
    // Tertiary: infer from model name
    const requiredFuelType = form.fuel_type || vehicleInfo?.vehicle_type || inferRequiredFuelTypeFromModel(form.model)

    const values = employeeOptions.filter((employee) => {
      const employeeDepartment = normalizeDepartment(employee.department)
      if (employeeDepartment !== requiredDepartment) return false

      // Only show Sitapura location SAs
      const empLocation = String(employee.location ?? '').trim().toLowerCase()
      if (empLocation !== 'sitapura') return false

      if (!useFuelFilter) return true

      const employeeFuelType = normalizeFuelBucket(employee.fuel_type)
      return employeeFuelType === requiredFuelType
    })

    values.sort((a, b) => a.employee_name.localeCompare(b.employee_name))
    return values
  }, [employeeOptions, form.model, form.fuel_type, form.service_type, vehicleInfo])

  const entryLookupById = useMemo(() => {
    const merged = [...entries, ...globalSearchEntries]
    return new Map(merged.map((entry) => [entry.id, entry]))
  }, [entries, globalSearchEntries])

  const hasSelectedSaInOptions = useMemo(() => {
    const selectedCode = String(form.sa_employee_code ?? '').trim().toUpperCase()
    if (!selectedCode) return false
    return sortedEmployeeOptions.some(
      (employee) => String(employee.employee_code ?? '').trim().toUpperCase() === selectedCode,
    )
  }, [form.sa_employee_code, sortedEmployeeOptions])

  useEffect(() => {
    if (editingId !== null) return
    if (!form.sa_employee_code) return
    if (hasSelectedSaInOptions) return
    if (revisitContext?.is_revisit) return
    setForm((prev) => ({ ...prev, sa_employee_code: '' }))
  }, [editingId, form.sa_employee_code, hasSelectedSaInOptions, revisitContext?.is_revisit])

  const serviceTypeFilteredEntries = useMemo(() => {
    if (selectedServiceType === 'all') return serviceTypeBaseEntries
    return serviceTypeBaseEntries.filter((entry) => getServiceTypeLabel(entry.service_type) === selectedServiceType)
  }, [selectedServiceType, serviceTypeBaseEntries])

  const visibleEntries = useMemo(() => {
    const query = search.trim()
    if (!query) {
      return serviceTypeFilteredEntries
    }

    return globalSearchEntries
  }, [globalSearchEntries, search, serviceTypeFilteredEntries])

  async function loadGlobalSearchPage(query: string, cursor: ReceptionEntryPageCursor | null) {
    const res = await searchReceptionEntriesForGlobalSearchPage(query, cursor)
    if (res.error) {
      setError(res.error)
      return null
    }
    return res.data ?? { rows: [], nextCursor: null, hasMore: false }
  }

  useEffect(() => {
    const query = search.trim()
    if (!query) {
      setGlobalSearchEntries([])
      setGlobalSearchCursor(null)
      setGlobalSearchHasMore(false)
      setGlobalSearchLoading(false)
      setGlobalSearchLoadingMore(false)
      return
    }

    let cancelled = false
    setGlobalSearchLoading(true)
    setGlobalSearchEntries([])
    setGlobalSearchCursor(null)
    setGlobalSearchHasMore(false)

    void loadGlobalSearchPage(query, null).then((page) => {
      if (cancelled || !page) return
      setGlobalSearchEntries(page.rows)
      setGlobalSearchCursor(page.nextCursor)
      setGlobalSearchHasMore(page.hasMore)
    }).finally(() => {
      if (!cancelled) setGlobalSearchLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [search])

  async function loadMoreGlobalSearch() {
    const query = search.trim()
    if (!query || !globalSearchHasMore || !globalSearchCursor || globalSearchLoadingMore || globalSearchLoading) return

    setGlobalSearchLoadingMore(true)
    const page = await loadGlobalSearchPage(query, globalSearchCursor)
    if (!page) {
      setGlobalSearchLoadingMore(false)
      return
    }

    setGlobalSearchEntries((prev) => {
      const seen = new Set(prev.map((entry) => entry.id))
      const merged = [...prev]
      page.rows.forEach((entry) => {
        if (seen.has(entry.id)) return
        merged.push(entry)
      })
      return merged
    })
    setGlobalSearchCursor(page.nextCursor)
    setGlobalSearchHasMore(page.hasMore)
    setGlobalSearchLoadingMore(false)
  }

  useEffect(() => {
    if (selectedServiceType === 'all') return
    if (serviceTypeOptions.includes(selectedServiceType)) return
    setSelectedServiceType('all')
  }, [selectedServiceType, serviceTypeOptions])

  useEffect(() => {
    // Location filter removed — no reset needed
  }, [selectedLocation, locationOptions])

  async function loadModelOptions() {
    const result = await getModelNames()
    if (!result.error && (result.data?.length ?? 0) > 0) {
      const cleaned = (result.data ?? [])
        .map((value) => String(value ?? '').trim().replace(/\s+/g, ' '))
        .filter(Boolean)

      const unique = Array.from(new Set(cleaned))
      if (unique.length > 0) {
        setModelOptions(unique)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(SETTINGS_MODELS_STORAGE_KEY, JSON.stringify(unique))
        }
        return
      }
    }

    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(SETTINGS_MODELS_STORAGE_KEY)
      if (!raw) return

      try {
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return

        const cleaned = parsed
          .map((value) => String(value ?? '').trim().replace(/\s+/g, ' '))
          .filter(Boolean)

        const unique = Array.from(new Set(cleaned))
        if (unique.length > 0) {
          setModelOptions(unique)
        }
      } catch {
        // Ignore invalid local storage payloads and keep defaults.
      }
    }
  }

  async function loadData() {
    setLoading(true)
    setError(null)
    setGlobalSearchEntries([])
    // Period preset probes removed: each fired a separate RLS scan on
    // service_reception_entries and contributed to 57014 on page load.

    const [entriesRes, employeeRes, authRes] = await Promise.all([
      listReceptionEntriesByDateRangePage(dateRange, null),
      listReceptionEmployees(),
      supabase.auth.getSession(),
    ])

    if (entriesRes.error) {
      setError(entriesRes.error)
      setEntries([])
      setListCursor(null)
      setHasMoreEntries(false)
    } else {
      const page = entriesRes.data ?? { rows: [], nextCursor: null, hasMore: false }
      setEntries(page.rows)
      setListCursor(page.nextCursor)
      setHasMoreEntries(page.hasMore)
    }

    if (!employeeRes.error) {
      setEmployeeOptions(employeeRes.data ?? [])
    }

    const userId = authRes.data.session?.user?.id
    if (userId) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      const role = String((profile as { role?: string | null } | null)?.role ?? '').trim().toLowerCase()
      setCanImport(role === 'admin' || role === 'super_admin' || role === 'super admin')
    } else {
      setCanImport(false)
    }

    setLoading(false)
  }

  async function loadMoreEntries() {
    if (!hasMoreEntries || !listCursor || loadingMoreEntries || loading) return

    setLoadingMoreEntries(true)
    const res = await listReceptionEntriesByDateRangePage(dateRange, listCursor)

    if (res.error) {
      setError(res.error)
      setLoadingMoreEntries(false)
      return
    }

    const page = res.data ?? { rows: [], nextCursor: null, hasMore: false }
    setEntries((prev) => {
      const seen = new Set(prev.map((entry) => entry.id))
      const merged = [...prev]
      page.rows.forEach((entry) => {
        if (seen.has(entry.id)) return
        merged.push(entry)
      })
      return merged
    })
    setListCursor(page.nextCursor)
    setHasMoreEntries(page.hasMore)
    setLoadingMoreEntries(false)
  }

  async function handleExportExcel() {
    setExporting(true)
    try {
      // Fetch ALL records matching the date range (bypassing pagination)
      let allRows: ReceptionEntryRow[] = []
      let cursor: ReceptionEntryPageCursor | null = null
      let hasMore = true
      while (hasMore) {
        const res = await listReceptionEntriesByDateRangePage(dateRange, cursor)
        if (res.error) {
          setError(res.error)
          setExporting(false)
          return
        }
        const page = res.data ?? { rows: [], nextCursor: null, hasMore: false }
        allRows = allRows.concat(page.rows)
        cursor = page.nextCursor
        hasMore = page.hasMore
      }

      // Apply same client-side filters as the UI
      let filtered = allRows

      // Location filter
      if (selectedListFilter === 'today') {
        filtered = filtered.filter((entry) => {
          const created = new Date(entry.created_at)
          if (Number.isNaN(created.getTime())) return false
          const createdKey = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(created)
          return createdKey === todayKey
        })
      }

      // Location filter removed per requirement — show all locations

      // Portal / fuel type filter
      if (selectedFuelType !== 'all') {
        filtered = filtered.filter((entry) => getEntryFuelTypeLabel(entry) === selectedFuelType)
      }

      // Service type filter
      if (selectedServiceType !== 'all') {
        filtered = filtered.filter((entry) => getServiceTypeLabel(entry.service_type) === selectedServiceType)
      }

      // Build Excel sheet
      const header = [
        'Reg Number',
        'Job Card No.',
        'Model',
        'Service Type',
        'Service Advisor',
        'Customer Name',
        'Customer Phone',
        'Source',
        'KM Reading',
        'Branch / Location',
        'Portal',
        'Remark',
        'Created By',
        'Created At',
        'Updated At',
      ]

      const dataRows = filtered.map((entry) => [
        entry.reg_number || '',
        entry.jc_number || '',
        entry.model || '',
        getServiceTypeLabel(entry.service_type),
        entry.sa_name || '',
        entry.owner_name || '',
        entry.owner_phone || '',
        entry.source || '',
        entry.km_reading ?? '',
        getLocationLabel(entry.branch),
        getEntryFuelTypeLabel(entry),
        entry.remark || '',
        entry.created_by || '',
        formatDate(entry.created_at),
        formatDate(entry.updated_at),
      ])

      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows])

      // Set column widths
      ws['!cols'] = [
        { wch: 14 }, // Reg Number
        { wch: 16 }, // JC Number
        { wch: 16 }, // Model
        { wch: 16 }, // Service Type
        { wch: 20 }, // SA
        { wch: 20 }, // Customer Name
        { wch: 14 }, // Phone
        { wch: 12 }, // Source
        { wch: 10 }, // KM
        { wch: 16 }, // Branch
        { wch: 8 },  // Portal
        { wch: 24 }, // Remark
        { wch: 16 }, // Created By
        { wch: 20 }, // Created At
        { wch: 20 }, // Updated At
      ]

      XLSX.utils.book_append_sheet(wb, ws, 'Reception')

      const dateStr = dateRange.from === dateRange.to
        ? dateRange.from
        : `${dateRange.from}_to_${dateRange.to}`
      const filterStr = [
        null, // Location filter removed
        selectedFuelType !== 'all' ? selectedFuelType : null,
        selectedServiceType !== 'all' ? selectedServiceType : null,
      ].filter(Boolean).join('_')
      const suffix = filterStr ? `_${filterStr}` : ''

      XLSX.writeFile(wb, `Reception_${dateStr}${suffix}.xlsx`)
    } catch (err) {
      setError(`Export failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setExporting(false)
    }
  }

  useEffect(() => {
    void loadData()
    void loadModelOptions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
    setRevisitContext(null)
    setRevisitChecking(false)
    setUpdationContext(null)
    setUpdationChecking(false)
    setVehicleInfo(null)
    setVehicleLooking(false)
    setVehicleError(null)
    if (revisitDebounceRef.current) {
      clearTimeout(revisitDebounceRef.current)
      revisitDebounceRef.current = null
    }
    if (updationDebounceRef.current) {
      clearTimeout(updationDebounceRef.current)
      updationDebounceRef.current = null
    }
    if (vehicleDebounceRef.current) {
      clearTimeout(vehicleDebounceRef.current)
      vehicleDebounceRef.current = null
    }
  }

  async function checkRevisitForReg(
    regNumber: string,
    serviceType: string,
    excludeEntryId?: number | null,
  ) {
    const normalized = regNumber.trim().toUpperCase()
    if (!normalized || !isFloorInchargeServiceType(serviceType)) {
      setRevisitContext(null)
      return
    }

    setRevisitChecking(true)
    const result = await getReceptionRevisitContext(normalized, serviceType, excludeEntryId ?? null)
    setRevisitChecking(false)

    if (result.error || !result.data) {
      setRevisitContext(null)
      return
    }

    setRevisitContext(result.data)
    revisitContextRef.current = result.data

    if (result.data.is_revisit && result.data.prior_entry?.sa_employee_code) {
      const priorCode = result.data.prior_entry.sa_employee_code.trim().toUpperCase()
      const existsInMaster = employeeOptions.some(
        (employee) => String(employee.employee_code ?? '').trim().toUpperCase() === priorCode,
      )

      if (existsInMaster) {
        setForm((prev) => ({
          ...prev,
          sa_employee_code: priorCode,
        }))
      }
    }
  }

  function scheduleRevisitCheck(
    regNumber: string,
    serviceType: string,
    excludeEntryId?: number | null,
  ) {
    if (revisitDebounceRef.current) {
      clearTimeout(revisitDebounceRef.current)
    }

    revisitDebounceRef.current = setTimeout(() => {
      void checkRevisitForReg(regNumber, serviceType, excludeEntryId)
    }, 400)
  }

  async function checkUpdationForReg(regNumber: string) {
    const normalized = regNumber.trim().toUpperCase()
    if (!normalized) {
      setUpdationContext(null)
      return
    }

    setUpdationChecking(true)
    const result = await getReceptionUpdationContext(normalized)
    setUpdationChecking(false)

    if (result.error || !result.data) {
      setUpdationContext(null)
      return
    }

    setUpdationContext(result.data)
  }

  function scheduleUpdationCheck(regNumber: string) {
    if (updationDebounceRef.current) {
      clearTimeout(updationDebounceRef.current)
    }

    updationDebounceRef.current = setTimeout(() => {
      void checkUpdationForReg(regNumber)
    }, 400)
  }

  function handleRegNumberChange(value: string) {
    const nextReg = value.toUpperCase()
    setForm((prev) => ({
      ...prev,
      reg_number: nextReg,
    }))
    scheduleRevisitCheck(nextReg, form.service_type, editingId)
    scheduleUpdationCheck(nextReg)
    scheduleVehicleLookup(nextReg)
  }

  function scheduleVehicleLookup(regNumber: string) {
    if (vehicleDebounceRef.current) clearTimeout(vehicleDebounceRef.current)
    setVehicleInfo(null)
    setVehicleError(null)
    const normalized = regNumber.trim().toUpperCase()
    if (!normalized || normalized.length < 4) {
      setVehicleLooking(false)
      return
    }
    setVehicleLooking(true)
    vehicleDebounceRef.current = setTimeout(async () => {
      const result = await lookupVehicleByRegNumber(normalized)
      setVehicleLooking(false)
      if (result.error || !result.data) {
        setVehicleError('Failed to lookup vehicle. Please try again.')
        return
      }
      const info = result.data
      setVehicleInfo(info)

      // Auto-fill fields from lookup
      if (info.found) {
        setForm((prev) => ({
          ...prev,
          model: info.model ?? prev.model,
          owner_name: info.owner_name ?? prev.owner_name,
          owner_phone: info.owner_phone ?? prev.owner_phone,
          // Auto-fill fuel type from vehicle lookup
          ...(info.vehicle_type ? { fuel_type: info.vehicle_type } : {}),
          // If vehicle had a previous SA, auto-assign same one
          ...(info.sa_employee_code ? { sa_employee_code: info.sa_employee_code } : {}),
        }))
      } else {
        // Vehicle not found — show clear error
        setVehicleError('Vehicle details not found. Please enter/check Reg. No.')
      }

      // If new vehicle (no previous SA), suggest advisor based on EV/PV
      // Skip suggestion if revisit already assigned an advisor (race condition fix)
      if (info.found && !info.sa_employee_code && info.vehicle_type) {
        // Check if revisit context has already set an SA
        const currentRevisit = revisitContextRef.current
        if (currentRevisit?.is_revisit && currentRevisit.prior_entry?.sa_employee_code) {
          // Revisit already handled — don't override with round-robin suggestion
        } else {
          const suggested = await suggestAdvisorForVehicle(
            info.vehicle_type,
            employeeOptions,
            entries,
          )
          if (suggested) {
            setForm((prev) => ({
              ...prev,
              sa_employee_code: suggested.employee_code,
            }))
          }
        }
      }

      // If EV/PV not identified, show warning
      if (info.found && !info.vehicle_type) {
        setVehicleError('Could not determine EV/PV category. Please verify model and select advisor manually.')
      }
    }, 500)
  }

  function handleServiceTypeChange(value: string) {
    setForm((prev) => ({ ...prev, service_type: value }))
    scheduleRevisitCheck(form.reg_number, value, editingId)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    setError(null)

    if (!form.reg_number.trim() || !form.model.trim() || !form.fuel_type.trim() || !form.sa_employee_code.trim() || !form.owner_name.trim() || !form.owner_phone.trim() || !form.source.trim()) {
      setError('Please fill all required fields: Registration No, Model, Fuel Type (EV/PV), SA Name, Owner Name, Owner Phone, Source')
      return
    }

    if (form.owner_phone.replace(/\D/g, '').length !== 10) {
      setError('Owner phone must be exactly 10 digits')
      return
    }

    setSaving(true)

    const payload: ReceptionEntryInput = {
      reg_number: form.reg_number,
      km_reading: null,
      model: form.model,
      service_type: form.service_type || null,
      sa_employee_code: form.sa_employee_code,
      owner_name: form.owner_name,
      owner_phone: form.owner_phone,
      source: form.source,
      portal: form.fuel_type || null,
    }

    const result =
      editingId === null
        ? await createReceptionEntry(payload)
        : await updateReceptionEntry(editingId, payload)

    setSaving(false)

    if (result.error) {
      setError(result.error)
      return
    }

    // Auto-create bodyshop repair card for Accident service type
    if (editingId === null && form.service_type === 'Accident' && result.data) {
      const entry = result.data as { id?: number; jc_number?: string | null; reg_number?: string; owner_name?: string | null; owner_phone?: string | null; branch?: string | null; sa_name?: string | null; sa_display_name?: string | null; created_at?: string }
      const jcNo = String(entry.jc_number ?? '').trim().toUpperCase()
      const receptionEntryId = Number(entry.id)
      let existingCard: { id: number } | null = null

      if (Number.isFinite(receptionEntryId)) {
        const byReceptionRes = await supabase
          .from('bodyshop_repair_cards')
          .select('id')
          .eq('reception_entry_id', receptionEntryId)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)

        existingCard = ((byReceptionRes.data ?? []) as Array<{ id: number }>)[0] ?? null
      }

      // Bodyshop cards must be keyed by real JC only.
      if (!existingCard && jcNo) {
        const byJcRes = await supabase
          .from('bodyshop_repair_cards')
          .select('id')
          .eq('job_card_no', jcNo)
          .order('updated_at', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)

        const existingByJc = ((byJcRes.data ?? []) as Array<{ id: number }>)[0] ?? null
        existingCard = existingByJc
      }

      if (!existingCard) {
        await supabase.from('bodyshop_repair_cards').insert({
          reception_entry_id:  Number.isFinite(receptionEntryId) ? receptionEntryId : null,
          job_card_no:         jcNo || '',
          reg_number:          form.reg_number,
          customer_name:       form.owner_name || null,
          customer_phone:      form.owner_phone || null,
          customer_type:       null,
          branch:              entry.branch ?? null,
          sa_name:             entry.sa_name ?? entry.sa_display_name ?? null,
          current_stage:       1,
          current_stage_name:  'Vehicle Receiving',
          overall_status:      'active',
          received_at:         new Date().toISOString(),
        })
      }
    }

    setNotice(editingId === null ? 'Reception entry created' : 'Reception entry updated')
    resetForm()
    await loadData()
  }

  function startEdit(entry: ReceptionEntryRow) {
    const entryCode = String(entry.sa_employee_code ?? '').trim().toUpperCase()
    const byCode = entryCode
      ? employeeOptions.find((employee) => String(employee.employee_code ?? '').trim().toUpperCase() === entryCode)
      : undefined

    const entryNames = new Set([
      normalizeName(entry.sa_name),
      normalizeName(entry.sa_display_name),
    ].filter(Boolean))

    const byName = employeeOptions.find((employee) => entryNames.has(normalizeName(employee.employee_name)))

    const resolvedEmployeeCode = byCode?.employee_code ?? byName?.employee_code ?? entryCode

    setEditingId(entry.id)
    setForm({
      reg_number: entry.reg_number,
      km_reading: entry.km_reading == null ? '' : String(entry.km_reading),
      model: entry.model ?? '',
      fuel_type: entry.fuel_type ?? entry.portal ?? '',
      sa_employee_code: resolvedEmployeeCode,
      owner_name: entry.owner_name ?? '',
      owner_phone: entry.owner_phone ?? '',
      source: entry.source,
      service_type: entry.service_type ?? '',
    })
    setNotice(null)
    setError(null)
    setVehicleInfo(null)
    setVehicleError(null)
    void checkRevisitForReg(entry.reg_number, entry.service_type ?? '', entry.id)
    void checkUpdationForReg(entry.reg_number)
    scheduleVehicleLookup(entry.reg_number)
  }

  async function handleDelete(id: number) {
    const confirmed = window.confirm('Delete this reception entry?')
    if (!confirmed) return

    setDeletingId(id)
    setNotice(null)
    setError(null)

    const result = await deleteReceptionEntry(id)

    setDeletingId(null)

    if (result.error) {
      setError(result.error)
      return
    }

    setNotice('Reception entry deleted')
    await loadData()
  }

  async function handleImportChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!canImport) {
      setError('You are not allowed to import reception entries.')
      event.target.value = ''
      return
    }

    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setNotice(null)
    setError(null)

    try {
      const parsed = await parseImportFile(file)
      if (parsed.rows.length === 0) {
        setError('No valid rows found in uploaded sheet')
        setUploading(false)
        return
      }

      const importResult = await bulkCreateReceptionEntries(parsed.rows)
      if (importResult.error) {
        setError(importResult.error)
        setUploading(false)
        return
      }

      const insertedCount = importResult.data ?? 0
      setNotice(
        parsed.skipped > 0
          ? `Imported ${insertedCount} rows. Skipped ${parsed.skipped} incomplete rows.`
          : `Imported ${insertedCount} rows successfully.`,
      )
      await loadData()
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'Failed to import file')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <div className="recep-redesign">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImportChange}
      />

      {/* ── COMPACT FILTER TOOLBAR ─────────────────────────────────────────── */}
      <div className="cft">
        <div className="cft__brand">
          <span className="cft__icon">🏢</span>
          <span className="cft__title">Reception</span>
          <span className="cft__count">{locationFilterBaseEntries.length} records</span>
        </div>
        <div className="cft__sep" />

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" />
        <div className="cft__sep" />

        <span className="cft__label">Portal:</span>
        <select className="cft__sel" value={selectedFuelType} onChange={e => setSelectedFuelType(e.target.value)}>
          <option value="all">All ({fuelFilterBaseEntries.length})</option>
          {fuelTypeOptions.map(ft => (
            <option key={ft} value={ft}>{ft} ({fuelFilterBaseEntries.filter(e => getEntryFuelTypeLabel(e) === ft).length})</option>
          ))}
        </select>

        <span className="cft__label">SR Type:</span>
        <select className="cft__sel" value={selectedServiceType} onChange={e => { setSelectedListFilter('default'); setSelectedServiceType(e.target.value) }}>
          <option value="all">All ({serviceTypeBaseEntries.length})</option>
          {serviceTypeOptions.map(st => (
            <option key={st} value={st}>{st} ({serviceTypeCounts.get(st) ?? 0})</option>
          ))}
        </select>

        <div className="cft__spacer" />

        <button type="button" className="btn btn--soft cft__action" onClick={() => void handleExportExcel()} disabled={exporting || loading || visibleEntries.length === 0}
          title="Export all filtered records to Excel">
          {exporting ? '⏳ Exporting…' : '📊 Download Excel'}
        </button>
        {canImport && (
          <button type="button" className="btn btn--soft cft__action" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? '⏳ Importing…' : '📥 Import XLSX'}
          </button>
        )}
      </div>

      {error && <div className="alert alert--err mb-gap" style={{ marginBottom: '0.5rem' }}>{error}</div>}
      {notice && <div className="alert alert--ok mb-gap" style={{ marginBottom: '0.5rem' }}>{notice}</div>}

      {/* ── METRIC SUMMARY ROW ────────────────────────────────────────────── */}
      <div className="msr">
        <button type="button" onClick={() => setSelectedListFilter('today')} disabled={todayEntries.length === 0}
          className={`msr__tile msr__tile--btn ${selectedListFilter === 'today' ? 'msr__tile--active' : ''}`}>
          <div className="msr__n">{todayEntries.length}</div>
          <div className="msr__l">Today</div>
        </button>
        <button type="button" onClick={() => { setSelectedListFilter('default'); setSelectedServiceType('all') }}
          className={`msr__tile msr__tile--btn ${selectedListFilter === 'default' && selectedServiceType === 'all' ? 'msr__tile--active' : ''}`}>
          <div className="msr__n">{serviceTypeBaseEntries.length}</div>
          <div className="msr__l">All SR</div>
        </button>
        {serviceTypeOptions.map(st => (
          <button key={st} type="button" onClick={() => { setSelectedListFilter('default'); setSelectedServiceType(st) }}
            className={`msr__tile msr__tile--btn ${selectedServiceType === st ? 'msr__tile--active' : ''}`}>
            <div className="msr__n">{serviceTypeCounts.get(st) ?? 0}</div>
            <div className="msr__l" title={st}>{getServiceTypeAbbreviation(st)}</div>
          </button>
        ))}
      </div>

      <div className="recep-grid">
        <form onSubmit={handleSubmit} className="card recep-form">
          <div className="card__head">
            <div>
              <h3>{editingId === null ? 'New intake' : 'Edit intake entry'}</h3>
              <div className="sub">Fields marked * are required.</div>
            </div>
          </div>
          <div className="card__body">
            <div className="form-grid-2">
              <label className="field">
                <span className="label">Registration No <span className="req">*</span></span>
                <input
                  value={form.reg_number}
                  onChange={(event) => handleRegNumberChange(event.target.value)}
                  onBlur={() => {
                    void checkRevisitForReg(form.reg_number, form.service_type, editingId)
                    void checkUpdationForReg(form.reg_number)
                  }}
                  autoCapitalize="characters"
                  placeholder="RJ14AB1234"
                  className="inp inp--uc"
                />
                {(revisitChecking || updationChecking) && (
                  <span style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'block' }}>
                    Checking vehicle history...
                  </span>
                )}
                {updationContext?.has_updation_available && (
                  <div style={{ fontSize: 12, color: '#6d28d9', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <UpdationAvailableBadge />
                    <span>
                      {updationContext.updation_name || 'Pending updation campaign'}
                      {updationContext.updation_code ? ` · ${updationContext.updation_code}` : ''}
                    </span>
                  </div>
                )}
                {revisitContext?.is_revisit && revisitContext.prior_entry && (
                  <div style={{ fontSize: 12, color: '#b45309', marginTop: 6, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <RevisitBadge />
                    <span>
                      Last visit {formatDate(revisitContext.prior_entry.created_at)}
                      {' · '}
                      {revisitContext.prior_entry.service_type || 'Service'}
                      {revisitContext.prior_entry.jc_number ? ` · JC# ${revisitContext.prior_entry.jc_number}` : ''}
                    </span>
                  </div>
                )}
              </label>

            </div>

            {/* ── VEHICLE INFORMATION CARD ── */}
            {vehicleLooking && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', marginBottom: 14,
                borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
                background: 'var(--accent-soft)', fontSize: 13, color: 'var(--accent)',
              }}>
                <span style={{ animation: 'spin 0.8s linear infinite', display: 'inline-block' }}>⟳</span>
                Looking up vehicle details...
              </div>
            )}

            {vehicleError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 16px', marginBottom: 14,
                borderRadius: 'var(--r-sm)', border: '1px solid #fcd34d',
                background: '#fffbeb', fontSize: 13, color: '#b45309', fontWeight: 600,
              }}>
                <span>⚠️</span>
                {vehicleError}
              </div>
            )}

            {vehicleInfo && vehicleInfo.found && (
              <div style={{
                marginBottom: 14,
                borderRadius: 'var(--r)', border: '1px solid var(--border)',
                overflow: 'hidden',
                boxShadow: 'var(--sh-1)',
              }}>
                {/* Card header with EV/PV badge */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: vehicleInfo.vehicle_type === 'EV'
                    ? 'linear-gradient(135deg, #ecfdf5, #d1fae5)'
                    : vehicleInfo.vehicle_type === 'PV'
                    ? 'linear-gradient(135deg, #eff6ff, #dbeafe)'
                    : 'linear-gradient(135deg, #f9fafb, #f3f4f6)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', letterSpacing: '0.01em' }}>
                      Vehicle Information
                    </span>
                    {vehicleInfo.vehicle_type && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: '999px',
                        fontSize: 11, fontWeight: 700, letterSpacing: '0.03em',
                        background: vehicleInfo.vehicle_type === 'EV' ? '#059669' : '#2563eb',
                        color: '#fff',
                      }}>
                        {vehicleInfo.vehicle_type === 'EV' ? '⚡ EV' : '🚗 PV'}
                      </span>
                    )}
                    {vehicleInfo.is_first_visit && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '3px 10px', borderRadius: '999px',
                        fontSize: 11, fontWeight: 600,
                        background: '#f3e8ff', color: '#7c3aed',
                      }}>
                        First Visit
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
                    Source: {vehicleInfo.source === 'reception' ? 'Previous Entry' : 'Vehicle Database'}
                  </span>
                </div>
                {/* Card body — vehicle details grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 18px',
                  padding: '16px', background: 'var(--surface)',
                }}>
                  {/* Reg No */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reg. No.</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{vehicleInfo.reg_number}</div>
                  </div>
                  {/* Vehicle Model */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehicle Model</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>{vehicleInfo.model ?? '—'}</div>
                  </div>
                  {/* Owner Name */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Owner Name</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>{vehicleInfo.owner_name ?? '—'}</div>
                  </div>
                  {/* Mobile No */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mobile No.</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-2)' }}>{vehicleInfo.owner_phone ?? '—'}</div>
                  </div>
                </div>
                {/* Advisor section — visually prominent */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px',
                  borderTop: '1px solid var(--border)',
                  background: vehicleInfo.sa_employee_code ? '#f0fdf4' : '#fffbeb',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      width: 36, height: 36, borderRadius: '50%',
                      display: 'grid', placeItems: 'center',
                      background: vehicleInfo.sa_employee_code ? '#059669' : '#f59e0b',
                      color: '#fff', fontSize: 16, fontWeight: 700,
                    }}>
                      {vehicleInfo.sa_employee_code ? '✓' : '!'}
                    </span>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assigned Service Advisor</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                        {vehicleInfo.sa_name ?? (vehicleInfo.sa_employee_code ? vehicleInfo.sa_employee_code : 'Advisor Not Assigned')}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600,
                    color: vehicleInfo.sa_employee_code ? '#059669' : '#b45309',
                  }}>
                    {vehicleInfo.sa_employee_code
                      ? `Code: ${vehicleInfo.sa_employee_code}`
                      : (vehicleInfo.vehicle_type || form.fuel_type)
                      ? `${vehicleInfo.vehicle_type || form.fuel_type} advisor will be suggested below ↓`
                      : 'Select Fuel Type first'}
                  </span>
                </div>
              </div>
            )}

            <div className="form-grid-2">
              <label className="field">
                <span className="label">Model <span className="req">*</span></span>
                <select
                  value={form.model}
                  onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
                  className="sel"
                >
                  <option value="">- Select Model -</option>
                  {modelOptions.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="label">Source <span className="req">*</span></span>
                <select
                  value={form.source}
                  onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                  className="sel"
                >
                  {SOURCE_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field">
              <span className="label">Service Type</span>
              <select
                value={form.service_type}
                onChange={(event) => handleServiceTypeChange(event.target.value)}
                className="sel"
                style={{ borderColor: form.service_type === 'Accident' ? '#ef4444' : undefined }}
              >
                <option value="">- Select Service Type -</option>
                {RECEPTION_SERVICE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
              {form.service_type === 'Accident' && (
                <span style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'block', fontWeight: 600 }}>
                  ⚠️ Accident — will appear in Bodyshop Repair Tracker
                </span>
              )}
            </label>

            <div className="form-grid-2">
              <label className="field">
                <span className="label">Fuel Type <span className="req">*</span></span>
                <select
                  value={form.fuel_type}
                  onChange={(event) => {
                    const fuel = event.target.value
                    setForm((prev) => ({ ...prev, fuel_type: fuel, sa_employee_code: '' }))
                  }}
                  className="sel"
                  style={form.fuel_type === '' && !vehicleInfo?.vehicle_type ? { borderColor: 'var(--warn)', borderWidth: 2 } : {}}
                >
                  <option value="">- Select EV / PV -</option>
                  <option value="EV">⚡ EV</option>
                  <option value="PV">🚗 PV</option>
                </select>
                {form.fuel_type === '' && !vehicleInfo?.vehicle_type && (
                  <span style={{ fontSize: 12, color: 'var(--warn)', marginTop: 4, display: 'block', fontWeight: 600 }}>
                    ⚠ Fuel Type is required to select advisor
                  </span>
                )}
                {vehicleInfo?.vehicle_type && (
                  <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2, display: 'block' }}>
                    Auto-detected from vehicle lookup
                  </span>
                )}
              </label>

              <label className="field">
                <span className="label">SA Name <span className="req">*</span></span>
              <select
                value={form.sa_employee_code}
                onChange={(event) => setForm((prev) => ({ ...prev, sa_employee_code: event.target.value }))}
                className="sel"
              >
                <option value="">- Select SA -</option>
                {form.sa_employee_code && !hasSelectedSaInOptions && (
                  <option value={form.sa_employee_code}>
                    {(editingId !== null
                      ? entryLookupById.get(editingId)?.sa_name
                      : revisitContext?.prior_entry?.sa_name) || 'Selected SA'} ({form.sa_employee_code})
                  </option>
                )}
                {sortedEmployeeOptions.map((employee) => (
                  <option key={employee.employee_code} value={employee.employee_code}>
                    {employee.employee_name} ({employee.employee_code})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'block' }}>
                Showing {sortedEmployeeOptions.length} SA(s) for {(form.fuel_type || vehicleInfo?.vehicle_type || inferRequiredFuelTypeFromModel(form.model)) === 'EV' ? '⚡ EV' : '🚗 PV'} {getRequiredDepartmentForServiceType(form.service_type)}
              </span>
            </label>
            </div>

            <div className="form-grid-2">
              <label className="field field--no-gap">
                <span className="label">Owner Name <span className="req">*</span></span>
                <input
                  value={form.owner_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, owner_name: event.target.value }))}
                  className="inp"
                />
              </label>

              <label className="field field--no-gap">
                <span className="label">Owner Phone <span className="req">*</span></span>
                <input
                  value={form.owner_phone}
                  onChange={(event) => {
                    const digitsOnly = event.target.value.replace(/\D/g, '').slice(0, 10)
                    setForm((prev) => ({ ...prev, owner_phone: digitsOnly }))
                  }}
                  placeholder="10 digits"
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  className="inp"
                />
              </label>
            </div>

            <div className="form-actions">
              <button
                type="submit"
                disabled={saving}
                className="btn btn--primary"
              >
                {saving ? 'Saving...' : editingId === null ? 'Create entry' : 'Update entry'}
              </button>
              {editingId !== null && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn btn--ghost"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </div>
        </form>

        <div className="card recep-feed">
          <div className="card__head">
            <div>
              <h3>Reception entries</h3>
              <div className="sub">
                {search.trim()
                  ? `${globalSearchLoading ? 'Searching all records...' : 'Global search'} · ${visibleEntries.length} shown${globalSearchHasMore ? ' (more available)' : ''}`
                  : `Newest first · ${visibleEntries.length} loaded${hasMoreEntries ? ' (more available)' : ''}`}
                {selectedListFilter === 'today' ? ' · Today filter' : ''}
                
                {selectedFuelType !== 'all' ? ` · ${selectedFuelType}` : ''}
                {selectedServiceType !== 'all' ? ` · ${selectedServiceType}` : ''}
              </div>
            </div>
            <span className="inp-wrap recep-search">
              <span className="icon-l">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="inp inp--compact"
                placeholder="Search reg / model / SA"
              />
            </span>
          </div>

          <div className="card__body recep-feed__body scroll">
            {loading ? (
              <div className="empty-state empty-state--lg">Loading reception entries...</div>
            ) : visibleEntries.length === 0 ? (
              <div className="empty-state empty-state--lg">
                {search.trim()
                  ? 'No entries match your search.'
                  : selectedListFilter === 'today'
                    ? 'No intake entries found for today.'
                    : 'No intake entries found.'}
              </div>
            ) : (
              <>
              {visibleEntries.map((entry) => (
                <div className="recep-item" key={entry.id}>
                  <div className="recep-item__main">
                    <div className="recep-item__top">
                      <span className="mono recep-item__reg">{entry.reg_number}</span>
                      {entry.is_revisit && <RevisitBadge />}
                      {entry.has_updation_available && <UpdationAvailableBadge />}
                      <span className={[`pill`, sourceTone(entry.source)].join(' ').trim()}>{entry.source}</span>
                    </div>
                    {entry.jc_number && (
                      <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px', fontFamily: 'monospace', letterSpacing: '0.03em' }}>
                        JC# <span style={{ fontWeight: 600, color: '#374151' }}>{entry.jc_number}</span>
                      </div>
                    )}
                    <div className="recep-item__meta">
                      <span>{entry.model ?? '-'}</span>
                      <span className="dot2" />
                      <span>{entry.sa_name}</span>
                      <span className="dot2" />
                      <span>{entry.owner_name ?? '-'}</span>
                      <span className="dot2" />
                      <span>{entry.owner_phone ?? '-'}</span>
                      <span className="dot2" />
                      <span>By {entry.created_by}</span>
                    </div>
                    <div className="tactions tactions--mt">
                      <button
                        type="button"
                        onClick={() => startEdit(entry)}
                        className="tbtn"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(entry.id)}
                        disabled={deletingId === entry.id}
                        className="tbtn tbtn--danger"
                      >
                        {deletingId === entry.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                  <div className="recep-item__time">{formatDate(entry.created_at)}</div>
                </div>
              ))}
              {search.trim() && (globalSearchHasMore || globalSearchLoadingMore) && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={globalSearchLoadingMore || !globalSearchHasMore}
                    onClick={() => void loadMoreGlobalSearch()}
                  >
                    {globalSearchLoadingMore ? 'Loading more…' : 'Load more search results'}
                  </button>
                </div>
              )}
              {!search.trim() && (hasMoreEntries || loadingMoreEntries) && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    disabled={loadingMoreEntries || !hasMoreEntries}
                    onClick={() => void loadMoreEntries()}
                  >
                    {loadingMoreEntries ? 'Loading more…' : 'Load more entries'}
                  </button>
                </div>
              )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
