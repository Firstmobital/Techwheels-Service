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
  model: string
  sa_employee_code: string
  owner_name: string
  owner_phone: string
  source: string
}

const EMPTY_FORM: FormState = {
  reg_number: '',
  model: '',
  sa_employee_code: '',
  owner_name: '',
  owner_phone: '',
  source: SOURCE_OPTIONS[0],
}

type ReceptionListFilter = 'default' | 'today'

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

const HEADER_ALIASES: Record<keyof FormState, string[]> = {
  reg_number: ['reg_number', 'registration no', 'registration number', 'vehicle registration number', 'vrn'],
  model: ['model', 'vehicle model'],
  sa_employee_code: ['sa_employee_code', 'employee_code', 'sa code', 'employee code', 'sa_code'],
  owner_name: ['owner_name', 'owner name'],
  owner_phone: ['owner_phone', 'owner phone'],
  source: ['source'],
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
    const values = [...employeeOptions]
    values.sort((a, b) => a.employee_name.localeCompare(b.employee_name))
    return values
  }, [employeeOptions])

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

    if (!form.reg_number.trim() || !form.sa_employee_code.trim() || !form.source.trim()) {
      setError('Please fill all required fields: Registration No, SA Name, Source')
      return
    }

    if (form.owner_phone.trim() && form.owner_phone.replace(/\D/g, '').length !== 10) {
      setError('Owner phone must be exactly 10 digits')
      return
    }

    setSaving(true)

    const payload: ReceptionEntryInput = {
      reg_number: form.reg_number,
      model: form.model,
      service_type: null,
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
      model: entry.model ?? '',
      sa_employee_code: resolvedEmployeeCode,
      owner_name: entry.owner_name ?? '',
      owner_phone: entry.owner_phone ?? '',
      source: entry.source,
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
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleImportChange}
      />

      <div className="pagehead">
        <div>
          <p className="greet"><span className="ic"><svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 6h14v12H5z" stroke="currentColor" strokeWidth="2"/></svg></span>Reception</p>
          <h1>Front-desk intake</h1>
          <p>Capture intake records and assign a service advisor.</p>
        </div>
        {canImport && (
          <button
            type="button"
            className="btn btn--soft"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Importing...' : 'Import XLSX/CSV'}
          </button>
        )}
      </div>

      {error && <div className="alert alert--err mb-gap">{error}</div>}
      {notice && <div className="alert alert--ok mb-gap">{notice}</div>}

      <DateRangeFilter range={dateRange} onChange={setDateRange} label="Period:" disabledPresets={disabledPeriodPresets} />

      <div className="toolbar toolbar--tight">
        <span className="toolbar__label">Filter by location:</span>
        <button
          type="button"
          onClick={() => setSelectedLocation('all')}
          className={`btn btn--sm ${selectedLocation === 'all' ? 'btn--primary' : 'btn--ghost'}`}
        >
          All ({locationFilterBaseEntries.length})
        </button>
        {locationOptions.map((location) => {
          const count = locationFilterBaseEntries.filter((entry) => getLocationLabel(entry.branch) === location).length
          return (
            <button
              key={location}
              type="button"
              onClick={() => setSelectedLocation(location)}
              className={`btn btn--sm ${selectedLocation === location ? 'btn--primary' : 'btn--ghost'}`}
            >
              {location} ({count})
            </button>
          )
        })}
      </div>

      <div className="toolbar toolbar--tight">
        <span className="toolbar__label">Filter by fuel type:</span>
        <button
          type="button"
          onClick={() => setSelectedFuelType('all')}
          className={`btn btn--sm ${selectedFuelType === 'all' ? 'btn--primary' : 'btn--ghost'}`}
        >
          All ({fuelFilterBaseEntries.length})
        </button>
        {fuelTypeOptions.map((fuelType) => {
          const count = fuelFilterBaseEntries.filter((entry) => getEntryFuelTypeLabel(entry) === fuelType).length
          return (
            <button
              key={fuelType}
              type="button"
              onClick={() => setSelectedFuelType(fuelType)}
              className={`btn btn--sm ${selectedFuelType === fuelType ? 'btn--primary' : 'btn--ghost'}`}
            >
              {fuelType} ({count})
            </button>
          )
        })}
      </div>

      <div className="summary">
        <button
          type="button"
          onClick={() => setSelectedListFilter((prev) => (prev === 'today' ? 'default' : 'today'))}
          disabled={todayEntries.length === 0}
          className={`schip schip--btn ${selectedListFilter === 'today' ? 'schip--active' : ''}`}
        >
          <span className="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M8 2v3m8-3v3M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
          <div>
            <div className="n">{todayEntries.length}</div>
            <div className="l">Today</div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSelectedServiceType('all')}
          className={`schip schip--btn ${selectedServiceType === 'all' ? 'schip--active' : ''}`}
        >
          <span className="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></span>
          <div>
            <div className="n">{serviceTypeBaseEntries.length}</div>
            <div className="l">ALL SR</div>
          </div>
        </button>

        {serviceTypeOptions.map((serviceType) => (
          <button
            key={serviceType}
            type="button"
            onClick={() => setSelectedServiceType(serviceType)}
            className={`schip schip--btn ${selectedServiceType === serviceType ? 'schip--active' : ''}`}
            title={serviceType}
          >
            <span className="ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm3 4h8m-8 4h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            <div>
              <div className="n">{serviceTypeCounts.get(serviceType) ?? 0}</div>
              <div className="l">{getServiceTypeAbbreviation(serviceType)}</div>
            </div>
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

            <div className="form-grid-2">
              <label className="field">
                <span className="label">Model</span>
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
            </label>

            <div className="form-grid-2">
              <label className="field field--no-gap">
                <span className="label">Owner Name</span>
                <input
                  value={form.owner_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, owner_name: event.target.value }))}
                  className="inp"
                />
              </label>

              <label className="field field--no-gap">
                <span className="label">Owner Phone</span>
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
