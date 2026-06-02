import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { getModelNames } from '../lib/api/settings'
import {
  bulkCreateReceptionEntries,
  createReceptionEntry,
  deleteReceptionEntry,
  listReceptionEmployees,
  listReceptionEntries,
  type ReceptionEmployeeOption,
  type ReceptionEntryInput,
  type ReceptionEntryRow,
  updateReceptionEntry,
} from '../lib/api'

const SOURCE_OPTIONS = ['Self', 'Driver Pickup', 'Walk-in', 'RSA']

const SETTINGS_MODELS_STORAGE_KEY = 'settings.models.v1'

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
          const serviceType = serviceTypeIndex >= 0 ? row[serviceTypeIndex]?.trim() ?? '' : ''
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

export default function ReceptionPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [entries, setEntries] = useState<ReceptionEntryRow[]>([])
  const [employeeOptions, setEmployeeOptions] = useState<ReceptionEmployeeOption[]>([])
  const [modelOptions, setModelOptions] = useState<string[]>([...DEFAULT_MODEL_OPTIONS])
  const [canImport, setCanImport] = useState(false)

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const sortedEmployeeOptions = useMemo(() => {
    const values = [...employeeOptions]
    values.sort((a, b) => a.employee_name.localeCompare(b.employee_name))
    return values
  }, [employeeOptions])

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return entries

    return entries.filter((entry) => {
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
  }, [entries, search])

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

    const [entriesRes, employeeRes, authRes] = await Promise.all([
      listReceptionEntries(),
      listReceptionEmployees(),
      supabase.auth.getSession(),
    ])

    if (entriesRes.error) {
      setError(entriesRes.error)
      setEntries([])
    } else {
      setEntries(entriesRes.data ?? [])
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
  }, [])

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
      service_type: '',
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
    const resolvedEmployeeCode =
      entry.sa_employee_code
      ?? employeeOptions.find((employee) => employee.employee_name === entry.sa_name)?.employee_code
      ?? ''

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
    <div className="page">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
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

      {error && <div className="alert alert--err" style={{ marginBottom: 'var(--gap)' }}>{error}</div>}
      {notice && <div className="alert alert--ok" style={{ marginBottom: 'var(--gap)' }}>{notice}</div>}

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
                style={{ textTransform: 'uppercase' }}
                autoCapitalize="characters"
                placeholder="RJ14AB1234"
                className="inp"
              />
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
                {sortedEmployeeOptions.map((employee) => (
                  <option key={employee.employee_code} value={employee.employee_code}>
                    {employee.employee_name} ({employee.employee_code})
                  </option>
                ))}
              </select>
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="label">Owner Name</span>
                <input
                  value={form.owner_name}
                  onChange={(event) => setForm((prev) => ({ ...prev, owner_name: event.target.value }))}
                  className="inp"
                />
              </label>

              <label className="field" style={{ marginBottom: 0 }}>
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

            <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
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
              <div className="sub">Newest first · {filteredEntries.length} shown</div>
            </div>
            <span className="inp-wrap" style={{ width: 240 }}>
              <span className="icon-l">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="inp"
                placeholder="Search reg / model / SA"
                style={{ height: 38 }}
              />
            </span>
          </div>

          <div className="card__body recep-feed__body scroll">
            {loading ? (
              <div style={{ padding: '30px 4px', color: 'var(--faint)', fontSize: 14, textAlign: 'center' }}>Loading reception entries...</div>
            ) : filteredEntries.length === 0 ? (
              <div style={{ padding: '30px 4px', color: 'var(--faint)', fontSize: 14, textAlign: 'center' }}>No entries match your search.</div>
            ) : (
              filteredEntries.map((entry) => (
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
                    <div className="tactions" style={{ marginTop: 8 }}>
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
