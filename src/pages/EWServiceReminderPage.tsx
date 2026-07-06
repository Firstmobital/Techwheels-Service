import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReminderLog {
  id: number
  service_data_id: number
  customer_name: string | null
  mobile_number: string
  vehicle_registration_number: string | null
  extended_warranty_end_date: string
  reminder_type: '30_day' | '15_day'
  scheduled_for_date: string
  sent_at: string | null
  wa_message_id: string | null
  template_name: string | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  failure_reason: string | null
  booking_id: number | null
  created_at: string
}

interface WATemplate {
  id: number
  name: string
  display_name: string
  status: string
  language: string
  variable_examples: Array<{ name: string; example_value: string }> | null
}

interface AgentConfig {
  ew_service_reminder_enabled: boolean
  ew_service_reminder_template_id: number | null
  ew_service_reminder_template_lang: string
  ew_service_reminder_variable_map: Record<string, string>
  ew_service_reminder_send_time: string
}

interface Stats {
  total_today: number
  sent_30_day: number
  sent_15_day: number
  delivered: number
  read: number
  failed: number
  booked: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const REMINDER_LABEL: Record<string, string> = {
  '30_day': '30 Days',
  '15_day': '15 Days',
}

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-700',
  delivered: 'bg-indigo-100 text-indigo-700',
  read:      'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
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

export default function EWServiceReminderPage() {
  const [logs, setLogs] = useState<ReminderLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Config editor
  const [templates, setTemplates] = useState<WATemplate[]>([])
  const [configDraft, setConfigDraft] = useState<AgentConfig | null>(null)
  const [savingConfig, setSavingConfig] = useState(false)
  const [configSaved, setConfigSaved] = useState(false)

  // Job runner
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<Record<string, unknown> | null>(null)
  const [dryRun, setDryRun] = useState(true)

  // Filters
  const [filterDate, setFilterDate] = useState('')
  const [filterType, setFilterType] = useState('all')
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
      const [logsRes, cfgRes, tplRes] = await Promise.all([
        supabase
          .from('ew_service_reminders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('wa_agent_config')
          .select('ew_service_reminder_enabled, ew_service_reminder_template_id, ew_service_reminder_template_lang, ew_service_reminder_variable_map, ew_service_reminder_send_time')
          .eq('id', 1)
          .single(),
        supabase
          .from('wa_templates')
          .select('id, name, display_name, status, language, variable_examples')
          .eq('status', 'approved')
          .order('display_name'),
      ])

      if (logsRes.error) throw logsRes.error
      setLogs((logsRes.data || []) as ReminderLog[])

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
          ew_service_reminder_enabled:       configDraft.ew_service_reminder_enabled,
          ew_service_reminder_template_id:   configDraft.ew_service_reminder_template_id,
          ew_service_reminder_template_lang: configDraft.ew_service_reminder_template_lang,
          ew_service_reminder_variable_map:  configDraft.ew_service_reminder_variable_map,
          ew_service_reminder_send_time:     configDraft.ew_service_reminder_send_time,
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

  async function runJob() {
    setRunning(true)
    setRunResult(null)
    try {
      const { data, error: e } = await supabase.functions.invoke('wa-ew-service-reminder', {
        body: { dry_run: dryRun },
      })
      if (e) throw e
      setRunResult(data as Record<string, unknown>)
      if (!dryRun) await fetchAll()
    } catch (e: unknown) {
      setRunResult({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setRunning(false)
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const stats = useMemo<Stats>(() => {
    const todayLogs = logs.filter(l => l.scheduled_for_date === today)
    return {
      total_today: todayLogs.length,
      sent_30_day: todayLogs.filter(l => l.reminder_type === '30_day').length,
      sent_15_day: todayLogs.filter(l => l.reminder_type === '15_day').length,
      delivered:   todayLogs.filter(l => ['delivered', 'read'].includes(l.status)).length,
      read:        todayLogs.filter(l => l.status === 'read').length,
      failed:      todayLogs.filter(l => l.status === 'failed').length,
      booked:      todayLogs.filter(l => l.booking_id !== null).length,
    }
  }, [logs, today])

  // ── Filtered logs ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filterDate && l.scheduled_for_date !== filterDate) return false
      if (filterType !== 'all' && l.reminder_type !== filterType) return false
      if (filterStatus !== 'all' && l.status !== filterStatus) return false
      if (filterBooked === 'booked' && l.booking_id === null) return false
      if (filterBooked === 'not_booked' && l.booking_id !== null) return false
      return true
    })
  }, [logs, filterDate, filterType, filterStatus, filterBooked])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Selected template variable examples ─────────────────────────────────
  const selectedTemplate = templates.find(t => t.id === configDraft?.ew_service_reminder_template_id)
  const varExamples = selectedTemplate?.variable_examples || []

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">Loading EW Service Reminder data…</div>
    )
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
          <h1 className="text-xl font-semibold text-gray-900">EW Service Reminder</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Sends a WhatsApp "Book Now / Call Us" reminder 30 and 15 days before a customer's Extended Warranty expires, to get serviced while coverage is still active.
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-700"
        >
          Refresh
        </button>
      </div>

      {/* ── Stats ── */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Today's Summary</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatCard label="Total Sent Today" value={stats.total_today} />
          <StatCard label="30-Day Reminders" value={stats.sent_30_day} color="text-purple-700" />
          <StatCard label="15-Day Reminders" value={stats.sent_15_day} color="text-blue-700" />
          <StatCard label="Delivered"        value={stats.delivered}   color="text-teal-700" />
          <StatCard label="Read"             value={stats.read}        color="text-green-700" />
          <StatCard label="Failed"           value={stats.failed}      color="text-red-700" />
          <StatCard label="Bookings Received" value={stats.booked}     color="text-orange-700" />
        </div>
      </div>

      {/* ── Config ── */}
      {configDraft && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Configuration</h2>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={configDraft.ew_service_reminder_enabled}
                onChange={e => setConfigDraft(d => d ? { ...d, ew_service_reminder_enabled: e.target.checked } : d)}
                className="w-4 h-4 accent-green-600"
              />
              <span className="text-sm font-medium text-gray-700">Enable daily EW service reminders</span>
            </label>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${configDraft.ew_service_reminder_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {configDraft.ew_service_reminder_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Daily Send Time (IST)</label>
            <input
              type="time"
              className="border border-gray-300 rounded px-3 py-2 text-sm"
              value={configDraft.ew_service_reminder_send_time.slice(0, 5)}
              onChange={e => setConfigDraft(d => d ? { ...d, ew_service_reminder_send_time: e.target.value + ':00' } : d)}
            />
            <p className="text-xs text-gray-400 mt-1">Time of day the daily reminder job runs, in Asia/Kolkata time.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">WhatsApp Template (approved only)</label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={configDraft.ew_service_reminder_template_id ?? ''}
                onChange={e => setConfigDraft(d => d ? { ...d, ew_service_reminder_template_id: e.target.value ? Number(e.target.value) : null } : d)}
              >
                <option value="">— Select template —</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.display_name || t.name} ({t.language})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Template Language Code</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={configDraft.ew_service_reminder_template_lang}
                onChange={e => setConfigDraft(d => d ? { ...d, ew_service_reminder_template_lang: e.target.value } : d)}
                placeholder="e.g. en, hi, en_IN"
              />
            </div>
          </div>

          {/* Variable map — shown when template is selected */}
          {varExamples.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Template Variable → <code>all_service_data</code> Column Mapping
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {varExamples.map(ex => (
                  <div key={ex.name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-28 shrink-0 font-mono">{ex.name}</span>
                    <span className="text-gray-400 text-xs">→</span>
                    <input
                      type="text"
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                      value={configDraft.ew_service_reminder_variable_map[ex.name] ?? ''}
                      placeholder={`all_service_data column (e.g. ${ex.example_value})`}
                      onChange={e => setConfigDraft(d => {
                        if (!d) return d
                        return {
                          ...d,
                          ew_service_reminder_variable_map: {
                            ...d.ew_service_reminder_variable_map,
                            [ex.name]: e.target.value,
                          },
                        }
                      })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Common columns: <code>first_name</code>, <code>last_name</code>, <code>model</code>, <code>vehicle_registration_number</code>, <code>contact_phones</code>, <code>extended_warranty_end_date</code>
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

      {/* ── Manual Job Runner ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Run Reminder Job</h2>
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
            onClick={runJob}
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
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input
              type="date"
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={filterDate}
              onChange={e => { setFilterDate(e.target.value); setPage(1) }}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reminder Type</label>
            <select
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={filterType}
              onChange={e => { setFilterType(e.target.value); setPage(1) }}
            >
              <option value="all">All Types</option>
              <option value="30_day">30 Day</option>
              <option value="15_day">15 Day</option>
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
        {(filterDate || filterType !== 'all' || filterStatus !== 'all' || filterBooked !== 'all') && (
          <button
            onClick={() => { setFilterDate(''); setFilterType('all'); setFilterStatus('all'); setFilterBooked('all'); setPage(1) }}
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
                <th className="px-4 py-3 font-medium">Vehicle Reg</th>
                <th className="px-4 py-3 font-medium">EW Expiry</th>
                <th className="px-4 py-3 font-medium">Reminder</th>
                <th className="px-4 py-3 font-medium">Sent At</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Booking</th>
                <th className="px-4 py-3 font-medium">Failure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No reminder logs found.
                    {logs.length === 0 && ' Run the job to generate the first reminders.'}
                  </td>
                </tr>
              ) : pageRows.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{l.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{l.mobile_number}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{l.vehicle_registration_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(l.extended_warranty_end_date)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      l.reminder_type === '15_day' ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {REMINDER_LABEL[l.reminder_type]}
                    </span>
                  </td>
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
                  <td className="px-4 py-3 text-xs text-red-600 max-w-[160px] truncate" title={l.failure_reason || ''}>
                    {l.failure_reason || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
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
    </div>
  )
}
