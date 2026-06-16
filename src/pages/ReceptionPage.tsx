import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import DateRangeFilter, { currentMonthRange, type DateRange, type DateRangePreset } from '../components/DateRangeFilter'
import { supabase } from '../lib/supabase'
import { getModelNames } from '../lib/api/settings'
import {
  bulkCreateReceptionEntries,
  createReceptionEntry,
  deleteReceptionEntry,
  listReceptionEmployees,
  type ReceptionEmployeeOption,
  type ReceptionEntryInput,
  type ReceptionEntryRow,
  updateReceptionEntry,
} from '../lib/api'

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

const PERIOD_PRESETS: DateRangePreset[] = ['this-month', 'last-month', 'this-week', 'last-7', 'last-30']

function toISTDate(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function getRangeFromPreset(preset: DateRangePreset): DateRange {
  const now = new Date()
  const today = toISTDate(now)

  if (preset === 'this-month') {
    return currentMonthRange()
  }

  if (preset === 'last-month') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const y = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 4)
    const m = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(5, 7)
    const lastDay = new Date(Number(y), Number(m), 0).getDate()
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${String(lastDay).padStart(2, '0')}` }
  }

  if (preset === 'this-week') {
    const day = now.getDay()
    const mon = new Date(now)
    mon.setDate(now.getDate() - ((day + 6) % 7))
    return { from: toISTDate(mon), to: today }
  }

  if (preset === 'last-7') {
    const d = new Date(now)
    d.setDate(now.getDate() - 6)
    return { from: toISTDate(d), to: today }
  }

  if (preset === 'last-30') {
    const d = new Date(now)
    d.setDate(now.getDate() - 29)
    return { from: toISTDate(d), to: today }
  }

  return currentMonthRange()
}

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
  sa_employee_code: string
  owner_name: string
  owner_phone: string
  source: string
  service_type: string
}

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

const EMPTY_FORM: FormState = {
  reg_number: '',
  km_reading: '',
  model: '',
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
}

const IMPORT_SERVICE_TYPE_ALIASES = ['service_type', 'service type']
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

function getRequiredDepartmentForServiceType(serviceType: string | null | undefined): 'SERVICE' | 'BODY SHOP' | 'PDI' {
  const normalized = normalizeServiceType(serviceType).toLowerCase()
  if (normalized === 'accident') return 'BODY SHOP'
  if (normalized === 'pdi') return 'PDI'
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
  const [disabledPeriodPresets, setDisabledPeriodPresets] = useState<DateRangePreset[]>([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedListFilter, setSelectedListFilter] = useState<ReceptionListFilter>('default')
  const [selectedLocation, setSelectedLocation] = useState<string | 'all'>('all')
  const [selectedFuelType, setSelectedFuelType] = useState<string | 'all'>('all')
  const [selectedServiceType, setSelectedServiceType] = useState<string | 'all'>('all')

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
    // 1) Service Type -> Department mapping:
    //    Accident => BODY SHOP, PDI => PDI, all others => SERVICE.
    // 2) Model -> Fuel Type mapping:
    //    model contains "EV" => EV, otherwise => PV.
    // 3) Accident is exempt from fuel filtering: show all BODY SHOP advisors.
    // 4) For non-Accident, SA dropdown shows employee_master rows matching BOTH department and fuel_type.
    // Keep this rule in sync with Settings > Employee Master to avoid behavior drift.
    const requiredDepartment = getRequiredDepartmentForServiceType(form.service_type)
    const useFuelFilter = shouldApplyFuelFilter(form.service_type)
    const requiredFuelType = inferRequiredFuelTypeFromModel(form.model)

    const values = employeeOptions.filter((employee) => {
      const employeeDepartment = normalizeDepartment(employee.department)
      if (employeeDepartment !== requiredDepartment) return false

      if (!useFuelFilter) return true

      const employeeFuelType = normalizeFuelBucket(employee.fuel_type)
      return employeeFuelType === requiredFuelType
    })

    values.sort((a, b) => a.employee_name.localeCompare(b.employee_name))
    return values
  }, [employeeOptions, form.model, form.service_type])

  const entryLookupById = useMemo(() => {
    return new Map(entries.map((entry) => [entry.id, entry]))
  }, [entries])

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
    setForm((prev) => ({ ...prev, sa_employee_code: '' }))
  }, [editingId, form.sa_employee_code, hasSelectedSaInOptions])

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase()
    const serviceTypeFilteredEntries =
      selectedServiceType === 'all'
        ? serviceTypeBaseEntries
        : serviceTypeBaseEntries.filter((entry) => getServiceTypeLabel(entry.service_type) === selectedServiceType)

    if (!query) {
      return serviceTypeFilteredEntries
    }

    return serviceTypeFilteredEntries.filter((entry) => {
      const joined = [
        entry.reg_number,
        entry.model ?? '',
        entry.sa_name,
        entry.owner_name ?? '',
        entry.owner_phone ?? '',
        entry.source,
        entry.created_by,
      ]
        .join(' ')
        .toLowerCase()

      return joined.includes(query)
    })
  }, [serviceTypeBaseEntries, search, selectedServiceType])

  useEffect(() => {
    if (selectedServiceType === 'all') return
    if (serviceTypeOptions.includes(selectedServiceType)) return
    setSelectedServiceType('all')
  }, [selectedServiceType, serviceTypeOptions])

  useEffect(() => {
    if (selectedLocation === 'all') return
    if (locationOptions.includes(selectedLocation)) return
    setSelectedLocation('all')
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

    const presetAvailability = await Promise.all(
      PERIOD_PRESETS.map(async (preset) => {
        const presetRange = getRangeFromPreset(preset)
        const { count, error: countError } = await supabase
          .from('service_reception_entries')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', `${presetRange.from}T00:00:00+05:30`)
          .lte('created_at', `${presetRange.to}T23:59:59+05:30`)

        if (countError) {
          return { preset, hasData: true }
        }

        return { preset, hasData: (count ?? 0) > 0 }
      }),
    )

    setDisabledPeriodPresets(
      presetAvailability
        .filter((item) => !item.hasData)
        .map((item) => item.preset),
    )

    const [{ data: _entriesRaw, error: _entriesErr }, employeeRes, authRes] = await Promise.all([
      supabase
        .from('service_reception_entries')
        .select('*')
        .gte('created_at', dateRange.from + 'T00:00:00+05:30')
        .lte('created_at', dateRange.to + 'T23:59:59+05:30')
        .order('created_at', { ascending: false }),
      listReceptionEmployees(),
      supabase.auth.getSession(),
    ])

    if (_entriesErr) {
      setError(_entriesErr.message)
      setEntries([])
    } else {
      setEntries(_entriesRaw ?? [])
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

  useEffect(() => {
    void loadData()
    void loadModelOptions()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange])

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNotice(null)
    setError(null)

    if (!form.reg_number.trim() || !form.model.trim() || !form.sa_employee_code.trim() || !form.owner_name.trim() || !form.owner_phone.trim() || !form.source.trim()) {
      setError('Please fill all required fields: Registration No, Model, SA Name, Owner Name, Owner Phone, Source')
      return
    }

    if (form.owner_phone.replace(/\D/g, '').length !== 10) {
      setError('Owner phone must be exactly 10 digits')
      return
    }

    setSaving(true)

    const payload: ReceptionEntryInput = {
      reg_number: form.reg_number,
      km_reading: form.km_reading.trim() ? Number.parseInt(form.km_reading, 10) : null,
      model: form.model,
      service_type: form.service_type || null,
      sa_employee_code: form.sa_employee_code,
      owner_name: form.owner_name,
      owner_phone: form.owner_phone,
      source: form.source,
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
      sa_employee_code: resolvedEmployeeCode,
      owner_name: entry.owner_name ?? '',
      owner_phone: entry.owner_phone ?? '',
      source: entry.source,
      service_type: entry.service_type ?? '',
    })
    setNotice(null)
    setError(null)
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

      {/* ── TOP CONTROL BAR ───────────────────────────────────────────────── */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '0.6rem 0.85rem', marginBottom: '0.6rem', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginRight: '0.5rem' }}>
          <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#1e293b' }}>🏢 Reception</span>
          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{locationFilterBaseEntries.length} records</span>
        </div>

        <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" disabledPresets={disabledPeriodPresets} />

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Loc:</span>
        <button type="button" onClick={() => setSelectedLocation('all')}
          className={`btn btn--sm ${selectedLocation === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
          All ({locationFilterBaseEntries.length})
        </button>
        {locationOptions.map((location) => (
          <button key={location} type="button" onClick={() => setSelectedLocation(location)}
            className={`btn btn--sm ${selectedLocation === location ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            {location} ({locationFilterBaseEntries.filter((entry) => getLocationLabel(entry.branch) === location).length})
          </button>
        ))}

        <span style={{ width: '1px', height: '22px', background: '#e2e8f0', flexShrink: 0 }} />

        <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#64748b' }}>Portal:</span>
        <button type="button" onClick={() => setSelectedFuelType('all')}
          className={`btn btn--sm ${selectedFuelType === 'all' ? 'btn--primary' : 'btn--ghost'}`}
          style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
          All ({fuelFilterBaseEntries.length})
        </button>
        {fuelTypeOptions.map((fuelType) => (
          <button key={fuelType} type="button" onClick={() => setSelectedFuelType(fuelType)}
            className={`btn btn--sm ${selectedFuelType === fuelType ? 'btn--primary' : 'btn--ghost'}`}
            style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            {fuelType} ({fuelFilterBaseEntries.filter((entry) => getEntryFuelTypeLabel(entry) === fuelType).length})
          </button>
        ))}

        <span style={{ flex: 1 }} />

        {canImport && (
          <button type="button" className="btn btn--soft" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            style={{ padding: '0.3rem 0.75rem', fontSize: '0.78rem' }}>
            {uploading ? '⏳ Importing…' : '📥 Import XLSX'}
          </button>
        )}
      </div>

      {error && <div className="alert alert--err mb-gap" style={{ marginBottom: '0.5rem' }}>{error}</div>}
      {notice && <div className="alert alert--ok mb-gap" style={{ marginBottom: '0.5rem' }}>{notice}</div>}

      <div className="statsrow">
        <button
          type="button"
          onClick={() => setSelectedListFilter('today')}
          disabled={todayEntries.length === 0}
          className={`stat stat--btn ${selectedListFilter === 'today' ? 'is-active' : ''}`}
        >
          <div className="stat__n">{todayEntries.length}</div>
          <div className="stat__l">Today</div>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedListFilter('default')
            setSelectedServiceType('all')
          }}
          className={`stat stat--btn ${selectedListFilter === 'default' && selectedServiceType === 'all' ? 'is-active' : ''}`}
        >
          <div className="stat__n">{serviceTypeBaseEntries.length}</div>
          <div className="stat__l">All SR</div>
        </button>

        <div className="svcard">
          <div className="svcard__head">
            <span className="t">By service type</span>
            <button type="button" className="all" onClick={() => setSelectedServiceType('all')}>Show all</button>
          </div>
          <div className="svchips scroll">
            {serviceTypeOptions.map((serviceType) => (
              <button
                key={serviceType}
                type="button"
                onClick={() => setSelectedServiceType(serviceType)}
                className={`svchip ${selectedServiceType === serviceType ? 'on' : ''}`}
                title={serviceType}
              >
                <span className="n">{serviceTypeCounts.get(serviceType) ?? 0}</span>
                <span className="ab">{getServiceTypeAbbreviation(serviceType)}</span>
              </button>
            ))}
          </div>
        </div>
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
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      reg_number: event.target.value.toUpperCase(),
                    }))
                  }
                  autoCapitalize="characters"
                  placeholder="RJ14AB1234"
                  className="inp inp--uc"
                />
              </label>

              <label className="field">
                <span className="label">KM Reading</span>
                <input
                  value={form.km_reading}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      km_reading: event.target.value.replace(/[^0-9]/g, ''),
                    }))
                  }
                  inputMode="numeric"
                  placeholder="e.g. 24560"
                  className="inp"
                />
              </label>
            </div>

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
                onChange={(event) => setForm((prev) => ({ ...prev, service_type: event.target.value }))}
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

            <label className="field">
              <span className="label">SA Name <span className="req">*</span></span>
              <select
                value={form.sa_employee_code}
                onChange={(event) => setForm((prev) => ({ ...prev, sa_employee_code: event.target.value }))}
                className="sel"
              >
                <option value="">- Select SA -</option>
                {editingId !== null && form.sa_employee_code && !hasSelectedSaInOptions && (
                  <option value={form.sa_employee_code}>
                    {entryLookupById.get(editingId)?.sa_name || 'Current SA'} ({form.sa_employee_code})
                  </option>
                )}
                {sortedEmployeeOptions.map((employee) => (
                  <option key={employee.employee_code} value={employee.employee_code}>
                    {employee.employee_name} ({employee.employee_code})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: '#64748b', marginTop: 4, display: 'block' }}>
                Showing {sortedEmployeeOptions.length} SA(s): {getRequiredDepartmentForServiceType(form.service_type)}{shouldApplyFuelFilter(form.service_type) ? ` + ${inferRequiredFuelTypeFromModel(form.model)}` : ' (all fuel types)'}
              </span>
            </label>

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
                Newest first · {visibleEntries.length} shown
                {selectedListFilter === 'today' ? ' · Today filter' : ''}
                {selectedLocation !== 'all' ? ` · ${selectedLocation}` : ''}
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
              visibleEntries.map((entry) => (
                <div className="recep-item" key={entry.id}>
                  <div className="recep-item__main">
                    <div className="recep-item__top">
                      <span className="mono recep-item__reg">{entry.reg_number}</span>
                      <span className={[`pill`, sourceTone(entry.source)].join(' ').trim()}>{entry.source}</span>
                    </div>
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
