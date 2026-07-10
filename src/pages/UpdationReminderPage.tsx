import { useEffect, useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { REPORT_BRANCH_OPTIONS } from '../lib/branches'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReminderLog {
  id: number
  batch_id: number | null
  chassis_no: string
  updation_code: string | null
  updation_name: string | null
  customer_name: string | null
  mobile_number: string
  vehicle_registration_number: string | null
  model: string | null
  reminder_number: 1 | 2
  scheduled_for_date: string
  sent_at: string | null
  wa_message_id: string | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped'
  failure_reason: string | null
  booking_id: number | null
  created_at: string
}

interface ImportBatch {
  id: number
  file_name: string | null
  sheet_name: string | null
  total_rows: number
  matched_with_phone_count: number
  matched_no_phone_count: number
  unmatched_count: number
  created_at: string
}

interface WATemplate {
  id: number
  name: string
  display_name: string
  status: string
  language: string
  header_text: string | null
  body_text: string | null
  footer_text: string | null
  buttons: Array<{ type: string }> | null
  variable_examples: Array<{ name: string; example_value: string }> | null
}

interface AgentConfig {
  updation_reminder_enabled: boolean
  updation_reminder_template_id: number | null
  updation_reminder_template_lang: string
  updation_reminder_variable_map: Record<string, string>
  updation_reminder_send_time: string
  updation_reminder_gap_days: number
}

interface ImportRow {
  chassis_no: string
  updation_code: string | null
  updation_name: string | null
  model: string | null
}

interface ImportResult {
  ok: boolean
  error?: string
  stats?: {
    total: number
    matched_with_phone: number
    matched_no_phone: number
    unmatched: number
    sent: number
    failed: number
    skipped_duplicate: number
    dry_run: boolean
  }
  batch_id?: number
  unmatched_chassis?: string[]
  matched_no_phone_chassis?: string[]
}

// ─── Header matching helpers ──────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

const CHASSIS_HEADER_ALIASES = ['chassisno', 'chassis', 'chassisnumber', 'chassisnum']
const CODE_HEADER_ALIASES = ['updationcode', 'code']
const NAME_HEADER_ALIASES = ['updationname', 'updation', 'name', 'campaign', 'description']
const MODEL_HEADER_ALIASES = ['model']

function findColumnKey(headers: string[], aliases: string[]): string | null {
  for (const h of headers) {
    if (aliases.includes(normalizeHeader(h))) return h
  }
  return null
}

// supabase-js's functions.invoke() only exposes a generic "non-2xx status
// code" message on error — the actual { ok: false, error: "..." } body we
// return is on error.context (a Response). Unwrap it so failures are
// diagnosable from the UI instead of just "Edge Function returned a non-2xx
// status code".
async function extractFunctionErrorMessage(e: unknown): Promise<string> {
  if (e && typeof e === 'object' && 'context' in e) {
    const ctx = (e as { context?: unknown }).context
    if (ctx instanceof Response) {
      try {
        const body = await ctx.clone().json()
        if (body?.error) return typeof body.error === 'string' ? body.error : JSON.stringify(body.error)
      } catch { /* response wasn't JSON — fall through to generic message */ }
    }
  }
  return e instanceof Error ? e.message : String(e)
}

// ─── Date/time helpers ────────────────────────────────────────────────────────

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s + (s.includes('T') ? '' : 'T00:00:00+05:30'))
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDateTime(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })
}

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-700',
  delivered: 'bg-indigo-100 text-indigo-700',
  read:      'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
  skipped:   'bg-yellow-100 text-yellow-700',
}

function highlightVars(text: string | null | undefined) {
  if (!text) return null
  return text.split(/(\{\{\s*[\w.]+\s*\}\})/g).map((part, i) =>
    /^\{\{.*\}\}$/.test(part)
      ? <span key={i} className="bg-yellow-100 text-yellow-800 font-mono px-1 rounded">{part}</span>
      : <span key={i}>{part}</span>
  )
}

function downloadTextList(filename: string, items: string[]) {
  const blob = new Blob([items.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color = 'text-gray-800' }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UpdationReminderPage() {
  const [logs, setLogs] = useState<ReminderLog[]>([])
  const [batches, setBatches] = useState<ImportBatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Config editor
  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [configDraft, setConfigDraft] = useState<AgentConfig | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  // Import
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState('')
  const [parsedRows, setParsedRows] = useState<ImportRow[]>([])
  const [chassisColFound, setChassisColFound] = useState(true)
  const [parseError, setParseError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  // Test send
  const [testPhone, setTestPhone] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null)

  // Manual sweep runner
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null)
  const [dryRun, setDryRun] = useState(true)

  // Filters
  const [filterBatch, setFilterBatch] = useState('all')
  const [filterReminder, setFilterReminder] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterBooked, setFilterBooked] = useState('all')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    setError(null)
    try {
      const [logsRes, batchesRes, cfgRes, tplRes] = await Promise.all([
        supabase
          .from('updation_reminders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('updation_import_batches')
          .select('id, file_name, sheet_name, total_rows, matched_with_phone_count, matched_no_phone_count, unmatched_count, created_at')
          .order('created_at', { ascending: false })
          .limit(100),
        supabase
          .from('wa_agent_config')
          .select('updation_reminder_enabled, updation_reminder_template_id, updation_reminder_template_lang, updation_reminder_variable_map, updation_reminder_send_time, updation_reminder_gap_days')
          .eq('id', 1)
          .single(),
        supabase
          .from('wa_templates')
          .select('id, name, display_name, status, language, header_text, body_text, footer_text, buttons, variable_examples')
          .eq('status', 'approved')
          .order('display_name'),
      ])

      if (logsRes.error) throw logsRes.error
      setLogs((logsRes.data || []) as ReminderLog[])
      setBatches((batchesRes.data || []) as ImportBatch[])

      if (cfgRes.data) {
        setConfigDraft({ ...(cfgRes.data as AgentConfig) })
      }

      setTemplates((tplRes.data || []) as WATemplate[])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig() {
    if (!configDraft) return
    setSavingConfig(true)
    setConfigSaved(false)
    try {
      const { error: e } = await supabase
        .from('wa_agent_config')
        .update({
          updation_reminder_enabled:       configDraft.updation_reminder_enabled,
          updation_reminder_template_id:   configDraft.updation_reminder_template_id,
          updation_reminder_template_lang: configDraft.updation_reminder_template_lang,
          updation_reminder_variable_map:  configDraft.updation_reminder_variable_map,
          updation_reminder_send_time:     configDraft.updation_reminder_send_time,
          updation_reminder_gap_days:      configDraft.updation_reminder_gap_days,
        })
        .eq('id', 1)
      if (e) throw e
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 2000)
    } catch (e: unknown) {
      alert('Save failed: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSavingConfig(false)
    }
  }

  // ── File selection: parse workbook, list sheets ──────────────────────────
  function handleFileSelect(file: File) {
    setSelectedFile(file)
    setSheetNames([])
    setSelectedSheet('')
    setParsedRows([])
    setParseError(null)
    setImportResult(null)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        if (wb.SheetNames.length === 0) {
          setParseError('No sheets found in this file.')
          return
        }
        setSheetNames(wb.SheetNames)
        ;(fileInputRef.current as unknown as { __wb?: XLSX.WorkBook }).__wb = wb
      } catch {
        setParseError('Failed to parse the file. Make sure it is a valid .xlsx, .xls, or .csv file.')
      }
    }
    reader.onerror = () => setParseError('Could not read the file.')
    reader.readAsArrayBuffer(file)
  }

  // ── Sheet selection: extract chassis/campaign rows ───────────────────────
  function handleSheetSelect(sheetName: string) {
    setSelectedSheet(sheetName)
    setParsedRows([])
    setParseError(null)
    setImportResult(null)

    const wb = (fileInputRef.current as unknown as { __wb?: XLSX.WorkBook })?.__wb
    if (!wb) return

    const ws = wb.Sheets[sheetName]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
    if (rawRows.length === 0) {
      setParseError(`Sheet "${sheetName}" has no data rows.`)
      return
    }

    const headers = Object.keys(rawRows[0])
    const chassisKey = findColumnKey(headers, CHASSIS_HEADER_ALIASES)
    const codeKey     = findColumnKey(headers, CODE_HEADER_ALIASES)
    const nameKey     = findColumnKey(headers, NAME_HEADER_ALIASES)
    const modelKey    = findColumnKey(headers, MODEL_HEADER_ALIASES)

    if (!chassisKey) {
      setChassisColFound(false)
      setParseError(`Could not find a chassis number column in sheet "${sheetName}". Expected a header like "ChassisNo" or "Chassis Number".`)
      return
    }
    setChassisColFound(true)

    const rows: ImportRow[] = rawRows
      .map(r => ({
        chassis_no: String(r[chassisKey] ?? '').trim(),
        updation_code: codeKey ? String(r[codeKey] ?? '').trim() || null : null,
        updation_name: nameKey ? String(r[nameKey] ?? '').trim() || null : null,
        model: modelKey ? String(r[modelKey] ?? '').trim() || null : null,
      }))
      .filter(r => r.chassis_no)

    setParsedRows(rows)
  }

  async function runImport(dry: boolean) {
    if (parsedRows.length === 0) return
    setImporting(true)
    setImportResult(null)
    try {
      const { data, error: e } = await supabase.functions.invoke('wa-updation-reminder', {
        body: {
          action: 'import',
          rows: parsedRows,
          file_name: selectedFile?.name || null,
          sheet_name: selectedSheet || null,
          dry_run: dry,
        },
      })
      if (e) throw e
      setImportResult(data as ImportResult)
      if (!dry) await fetchAll()
    } catch (e: unknown) {
      setImportResult({ ok: false, error: await extractFunctionErrorMessage(e) })
    } finally {
      setImporting(false)
    }
  }

  async function sendTestMessage() {
    if (!testPhone.trim()) {
      alert('Enter a 10-digit mobile number')
      return
    }
    setSendingTest(true)
    setTestResult(null)
    try {
      const { data, error: e } = await supabase.functions.invoke('wa-updation-reminder', {
        body: { test_phone: testPhone.trim() },
      })
      if (e) throw e
      setTestResult(data as Record<string, unknown>)
    } catch (e: unknown) {
      setTestResult({ error: await extractFunctionErrorMessage(e) })
    } finally {
      setSendingTest(false)
    }
  }

  async function runSweep() {
    setRunning(true)
    setRunResult(null)
    try {
      const { data, error: e } = await supabase.functions.invoke('wa-updation-reminder', {
        body: { dry_run: dryRun },
      })
      if (e) throw e
      setRunResult(data as Record<string, unknown>)
      if (!dryRun) await fetchAll()
    } catch (e: unknown) {
      setRunResult({ error: await extractFunctionErrorMessage(e) })
    } finally {
      setRunning(false)
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const stats = useMemo(() => {
    const todayLogs = logs.filter(l => l.scheduled_for_date === today)
    return {
      total_today:   todayLogs.length,
      reminder_1:    todayLogs.filter(l => l.reminder_number === 1).length,
      reminder_2:    todayLogs.filter(l => l.reminder_number === 2).length,
      sent:          logs.filter(l => ['sent', 'delivered', 'read'].includes(l.status)).length,
      delivered:     logs.filter(l => ['delivered', 'read'].includes(l.status)).length,
      failed:        logs.filter(l => l.status === 'failed').length,
      booked:        logs.filter(l => l.booking_id !== null).length,
    }
  }, [logs, today])

  // ── Filtered logs ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filterBatch !== 'all' && String(l.batch_id) !== filterBatch) return false
      if (filterReminder !== 'all' && String(l.reminder_number) !== filterReminder) return false
      if (filterStatus !== 'all' && l.status !== filterStatus) return false
      if (filterBooked === 'booked' && l.booking_id === null) return false
      if (filterBooked === 'not_booked' && l.booking_id !== null) return false
      return true
    })
  }, [logs, filterBatch, filterReminder, filterStatus, filterBooked])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectedTemplate = templates.find(t => t.id === configDraft?.updation_reminder_template_id)
  const varExamples = selectedTemplate?.variable_examples || []

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading Updation Reminder data…</div>
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
        <button onClick={fetchAll} className="mt-4 px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 text-sm">Retry</button>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Updation Reminder</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Import a chassis-number sheet for an update campaign — matches each chassis to a customer, then sends 2 WhatsApp reminders {configDraft?.updation_reminder_gap_days ?? 3} days apart with a "Book My Visit" form.
          </p>
        </div>
        <button onClick={fetchAll} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700">
          Refresh
        </button>
      </div>

      {/* ── Stats ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Scheduled Today" value={stats.total_today} />
          <StatCard label="Reminder 1 (today)" value={stats.reminder_1} color="text-purple-700" />
          <StatCard label="Reminder 2 (today)" value={stats.reminder_2} color="text-blue-700" />
          <StatCard label="Sent (all time)" value={stats.sent} color="text-teal-700" />
          <StatCard label="Read" value={stats.delivered} color="text-green-700" />
          <StatCard label="Failed" value={stats.failed} color="text-red-700" />
          <StatCard label="Bookings Received" value={stats.booked} color="text-orange-700" />
        </div>
      </div>

      {/* ── Import ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">Import Chassis List</h2>
        <p className="text-xs text-gray-400">
          Upload the updation/campaign sheet (.xlsx, .xls, .csv). If the file has multiple sheets, pick the one containing the pending chassis list.
        </p>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
            className="text-sm"
          />
        </div>

        {sheetNames.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Sheet</label>
            <select
              className="border border-gray-300 rounded px-3 py-2 text-sm"
              value={selectedSheet}
              onChange={e => handleSheetSelect(e.target.value)}
            >
              <option value="">— Select sheet —</option>
              {sheetNames.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {parseError && (
          <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">{parseError}</div>
        )}

        {parsedRows.length > 0 && chassisColFound && (
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
            Found <strong>{parsedRows.length}</strong> chassis numbers in sheet "{selectedSheet}". Ready to import.
          </div>
        )}

        {parsedRows.length > 0 && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => runImport(true)}
              disabled={importing}
              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              {importing ? 'Checking…' : 'Preview (Dry Run)'}
            </button>
            <button
              onClick={() => runImport(false)}
              disabled={importing}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              {importing ? 'Sending…' : 'Import & Send Reminder 1'}
            </button>
          </div>
        )}

        {importResult && (
          <div className={`rounded p-3 text-sm space-y-2 ${importResult.ok === false ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
            {importResult.ok === false ? (
              <div>{importResult.error}</div>
            ) : importResult.stats ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="font-semibold">{importResult.stats.total}</span> total rows</div>
                  <div className="text-green-700"><span className="font-semibold">{importResult.stats.matched_with_phone}</span> matched + phone</div>
                  <div className="text-yellow-700"><span className="font-semibold">{importResult.stats.matched_no_phone}</span> matched, no phone</div>
                  <div className="text-red-700"><span className="font-semibold">{importResult.stats.unmatched}</span> unmatched</div>
                  <div className="text-blue-700"><span className="font-semibold">{importResult.stats.sent}</span> {importResult.stats.dry_run ? 'would send' : 'sent'}</div>
                  <div><span className="font-semibold">{importResult.stats.skipped_duplicate}</span> skipped (duplicate)</div>
                  <div className="text-red-700"><span className="font-semibold">{importResult.stats.failed}</span> failed</div>
                </div>
                <div className="flex flex-wrap gap-3 pt-1">
                  {!!importResult.unmatched_chassis?.length && (
                    <button
                      onClick={() => downloadTextList('unmatched_chassis.txt', importResult.unmatched_chassis!)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Download {importResult.unmatched_chassis.length} unmatched chassis
                    </button>
                  )}
                  {!!importResult.matched_no_phone_chassis?.length && (
                    <button
                      onClick={() => downloadTextList('matched_no_phone_chassis.txt', importResult.matched_no_phone_chassis!)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Download {importResult.matched_no_phone_chassis.length} matched-no-phone chassis
                    </button>
                  )}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Config ── */}
      {configDraft && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Configuration</h2>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={configDraft.updation_reminder_enabled}
                onChange={e => setConfigDraft(d => d ? { ...d, updation_reminder_enabled: e.target.checked } : d)}
                className="w-4 h-4 accent-green-600"
              />
              <span className="text-sm font-medium text-gray-700">Enable reminder-2 follow-up sweep</span>
            </label>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${configDraft.updation_reminder_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {configDraft.updation_reminder_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
          <p className="text-xs text-gray-400 -mt-2">Reminder 1 always sends immediately on import, regardless of this toggle.</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Daily Sweep Time (IST)</label>
              <input
                type="time"
                className="border border-gray-300 rounded px-3 py-2 text-sm"
                value={configDraft.updation_reminder_send_time.slice(0, 5)}
                onChange={e => setConfigDraft(d => d ? { ...d, updation_reminder_send_time: e.target.value + ':00' } : d)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Days Between Reminder 1 &amp; 2</label>
              <input
                type="number"
                min={1}
                max={30}
                className="border border-gray-300 rounded px-3 py-2 text-sm w-full"
                value={configDraft.updation_reminder_gap_days}
                onChange={e => setConfigDraft(d => d ? { ...d, updation_reminder_gap_days: Number(e.target.value) || 1 } : d)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">WhatsApp Template (approved only)</label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={configDraft.updation_reminder_template_id ?? ''}
                onChange={e => setConfigDraft(d => d ? { ...d, updation_reminder_template_id: e.target.value ? Number(e.target.value) : null } : d)}
              >
                <option value="">— Select template —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.display_name || t.name} ({t.language})</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">
                No template yet? See <code>docs/web/cross-cutting/wa_templates/reference/updation_reminder_wa.md</code> for how to create the Flow + template.
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Template Language Code</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={configDraft.updation_reminder_template_lang}
                onChange={e => setConfigDraft(d => d ? { ...d, updation_reminder_template_lang: e.target.value } : d)}
                placeholder="e.g. en, hi, en_IN"
              />
            </div>
          </div>

          {selectedTemplate && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Template Preview</label>
              <div className="bg-white rounded-lg border border-gray-200 p-3 text-sm whitespace-pre-wrap">
                {selectedTemplate.header_text && (
                  <div className="font-semibold text-gray-800 mb-1">{highlightVars(selectedTemplate.header_text)}</div>
                )}
                <div className="text-gray-700">{highlightVars(selectedTemplate.body_text)}</div>
                {selectedTemplate.footer_text && (
                  <div className="text-gray-400 text-xs mt-1">{highlightVars(selectedTemplate.footer_text)}</div>
                )}
              </div>
              {!selectedTemplate.buttons?.some(b => b.type === 'FLOW') && (
                <div className="mt-2 bg-yellow-50 border border-yellow-200 rounded p-2 text-xs text-yellow-800">
                  This template has no "Book My Visit" Flow button attached — reminders will send as plain text with no booking form. See <code>updation_reminder_wa.md</code> to create a template with the Flow button.
                </div>
              )}
            </div>
          )}

          {varExamples.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Template Variable → Column Mapping
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {varExamples.map(ex => (
                  <div key={ex.name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-28 shrink-0 font-mono">{ex.name}</span>
                    <span className="text-gray-400 text-xs">→</span>
                    <input
                      type="text"
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                      value={configDraft.updation_reminder_variable_map[ex.name] ?? ''}
                      placeholder={`column (e.g. ${ex.example_value})`}
                      onChange={e => setConfigDraft(d => {
                        if (!d) return d
                        return {
                          ...d,
                          updation_reminder_variable_map: {
                            ...d.updation_reminder_variable_map,
                            [ex.name]: e.target.value,
                          },
                        }
                      })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                <code>name</code>/<code>model</code>/<code>reg_no</code> come from the matched <code>all_service_data</code> row;
                {' '}<code>reason</code> comes from the import file's campaign/updation name column.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-sm font-medium"
            >
              {savingConfig ? 'Saving…' : 'Save Config'}
            </button>
            {configSaved && <span className="text-green-600 text-sm">✓ Saved</span>}
          </div>
        </div>
      )}

      {/* ── Send Test Message ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Send Test Message</h2>
        <p className="text-xs text-gray-400">
          Sends the currently saved template to a single number using example values. Save config first if you just changed the template above.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="tel"
            className="border border-gray-300 rounded px-3 py-2 text-sm w-48"
            placeholder="10-digit mobile number"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
          />
          <button
            onClick={sendTestMessage}
            disabled={sendingTest}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-medium"
          >
            {sendingTest ? 'Sending…' : 'Send Test'}
          </button>
        </div>
        {testResult && (
          <div className={`rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto ${testResult.error || testResult.ok === false ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {JSON.stringify(testResult, null, 2)}
          </div>
        )}
      </div>

      {/* ── Manual Follow-up Sweep Runner ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Run Reminder-2 Sweep</h2>
        <p className="text-xs text-gray-400">Normally runs daily via schedule. Use this to trigger it manually.</p>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={e => setDryRun(e.target.checked)}
              className="w-4 h-4 accent-orange-500"
            />
            <span>Dry Run <span className="text-gray-400">(no real messages sent)</span></span>
          </label>
          <button
            onClick={runSweep}
            disabled={running}
            className={`px-4 py-2 rounded text-sm font-medium text-white disabled:opacity-50 ${dryRun ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {running ? 'Running…' : dryRun ? 'Run Dry Run' : 'Run Now (Live)'}
          </button>
        </div>
        {runResult && (
          <div className={`rounded p-3 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-auto ${runResult.error ? 'bg-red-50 text-red-700' : 'bg-gray-50 text-gray-700'}`}>
            {JSON.stringify(runResult, null, 2)}
          </div>
        )}
      </div>

      {/* ── Filters ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Batch</label>
            <select
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={filterBatch}
              onChange={e => { setFilterBatch(e.target.value); setPage(1) }}
            >
              <option value="all">All Batches</option>
              {batches.map(b => (
                <option key={b.id} value={String(b.id)}>
                  #{b.id} — {b.file_name || 'unnamed'} ({fmtDate(b.created_at)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reminder</label>
            <select
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={filterReminder}
              onChange={e => { setFilterReminder(e.target.value); setPage(1) }}
            >
              <option value="all">All</option>
              <option value="1">Reminder 1</option>
              <option value="2">Reminder 2</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="delivered">Delivered</option>
              <option value="read">Read</option>
              <option value="failed">Failed</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Booking</label>
            <select
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={filterBooked}
              onChange={e => { setFilterBooked(e.target.value); setPage(1) }}
            >
              <option value="all">All</option>
              <option value="booked">Booked</option>
              <option value="not_booked">Not Booked</option>
            </select>
          </div>
        </div>
        {(filterBatch !== 'all' || filterReminder !== 'all' || filterStatus !== 'all' || filterBooked !== 'all') && (
          <button
            onClick={() => { setFilterBatch('all'); setFilterReminder('all'); setFilterStatus('all'); setFilterBooked('all'); setPage(1) }}
            className="mt-2 text-xs text-blue-600 hover:underline"
          >
            Clear filters
          </button>
        )}
        <p className="text-xs text-gray-400 mt-2">{filtered.length} records</p>
      </div>

      {/* ── Table ── */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Mobile</th>
                <th className="px-4 py-3 font-medium">Chassis</th>
                <th className="px-4 py-3 font-medium">Vehicle Reg</th>
                <th className="px-4 py-3 font-medium">Campaign</th>
                <th className="px-4 py-3 font-medium">Reminder</th>
                <th className="px-4 py-3 font-medium">Scheduled</th>
                <th className="px-4 py-3 font-medium">Sent At</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Booking</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No reminder logs found.
                    {logs.length === 0 && ' Import a chassis list above to get started.'}
                  </td>
                </tr>
              ) : pageRows.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{l.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{l.mobile_number}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">{l.chassis_no}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{l.vehicle_registration_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate" title={l.updation_name || ''}>{l.updation_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${l.reminder_number === 2 ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'}`}>
                      #{l.reminder_number}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(l.scheduled_for_date)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDateTime(l.sent_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[l.status] || 'bg-gray-100 text-gray-600'}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {l.booking_id
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Booked #{l.booking_id}</span>
                      : <span className="text-gray-400 text-xs">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-xs"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-xs"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">Branches used by the booking form: {REPORT_BRANCH_OPTIONS.join(', ')}</p>
    </div>
  )
}
