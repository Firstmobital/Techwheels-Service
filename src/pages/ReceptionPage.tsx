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
  return date.toLocaleString()
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

  const sortedEmployeeOptions = useMemo(() => {
    const values = [...employeeOptions]
    values.sort((a, b) => a.employee_name.localeCompare(b.employee_name))
    return values
  }, [employeeOptions])

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
    <div className="mx-auto w-full max-w-7xl p-4 md:p-6 space-y-5">
      <div className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Reception</h1>
            <p className="mt-1 text-sm text-gray-500">Capture front desk intake records and assign service advisor.</p>
          </div>
          {canImport && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={handleImportChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? 'Importing...' : 'Import XLSX/CSV'}
              </button>
            </div>
          )}
        </div>

        {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {notice && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">Registration No *</span>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-blue-100 focus:border-blue-500 focus:ring"
            />
          </label>

          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">Model</span>
            <select
              value={form.model}
              onChange={(event) => setForm((prev) => ({ ...prev, model: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-blue-100 focus:border-blue-500 focus:ring"
            >
              <option value="">— Select Model —</option>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">SA Name *</span>
            <select
              value={form.sa_employee_code}
              onChange={(event) => setForm((prev) => ({ ...prev, sa_employee_code: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-blue-100 focus:border-blue-500 focus:ring"
            >
              <option value="">— Select SA —</option>
              {sortedEmployeeOptions.map((employee) => (
                <option key={employee.employee_code} value={employee.employee_code}>
                  {employee.employee_name} ({employee.employee_code})
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">Owner Name</span>
            <input
              value={form.owner_name}
              onChange={(event) => setForm((prev) => ({ ...prev, owner_name: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-blue-100 focus:border-blue-500 focus:ring"
            />
          </label>

          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">Owner Phone</span>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-blue-100 focus:border-blue-500 focus:ring"
            />
          </label>

          <label className="text-sm text-gray-700">
            <span className="mb-1 block font-medium">Source *</span>
            <select
              value={form.source}
              onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 outline-none ring-blue-100 focus:border-blue-500 focus:ring"
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : editingId === null ? 'Create Entry' : 'Update Entry'}
          </button>
          {editingId !== null && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel Edit
            </button>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 text-sm font-medium text-gray-700">
          Reception Entries ({entries.length})
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-500">Loading reception entries...</div>
        ) : entries.length === 0 ? (
          <div className="p-4 text-sm text-gray-500">No reception entries found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Created At</th>
                  <th className="px-3 py-2 text-left">Created By</th>
                  <th className="px-3 py-2 text-left">Source</th>
                  <th className="px-3 py-2 text-left">Reg No</th>
                  <th className="px-3 py-2 text-left">Model</th>
                  <th className="px-3 py-2 text-left">SA Name</th>
                  <th className="px-3 py-2 text-left">Owner Name</th>
                  <th className="px-3 py-2 text-left">Owner Phone</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(entry.created_at)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{entry.created_by}</td>
                    <td className="whitespace-nowrap px-3 py-2">{entry.source}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{entry.reg_number}</td>
                    <td className="whitespace-nowrap px-3 py-2">{entry.model ?? '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{entry.sa_name}</td>
                    <td className="whitespace-nowrap px-3 py-2">{entry.owner_name ?? '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2">{entry.owner_phone ?? '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(entry)}
                          className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(entry.id)}
                          disabled={deletingId === entry.id}
                          className="rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === entry.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
