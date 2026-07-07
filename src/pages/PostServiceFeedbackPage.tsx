import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedbackLog {
  id: number
  job_card_closed_data_id: number
  customer_name: string | null
  mobile_number: string
  vehicle_registration_number: string | null
  job_card_number: string | null
  closed_date: string
  scheduled_for_date: string
  sent_at: string | null
  wa_message_id: string | null
  template_name: string | null
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'responded' | 'failed'
  failure_reason: string | null
  rating: number | null
  feedback_text: string | null
  responded_at: string | null
  review_link_sent: boolean
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
  variable_examples: Array<{ name: string; example_value?: string; example?: string }> | null
}

interface AgentConfig {
  post_service_feedback_enabled: boolean
  post_service_feedback_delay_days: number
  post_service_feedback_template_id: number | null
  post_service_feedback_template_lang: string
  post_service_feedback_variable_map: Record<string, string>
  post_service_feedback_send_time: string
  google_review_link: string | null
}

interface Stats {
  total_today: number
  sent: number
  delivered: number
  read: number
  responded: number
  failed: number
  avg_rating: number | null
  review_links_sent: number
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

const STATUS_COLOR: Record<string, string> = {
  pending:   'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-700',
  delivered: 'bg-indigo-100 text-indigo-700',
  read:      'bg-teal-100 text-teal-700',
  responded: 'bg-green-100 text-green-700',
  failed:    'bg-red-100 text-red-700',
}

// Highlights {{variable}} placeholders inside a template text string.
function highlightVars(text: string | null | undefined) {
  if (!text) return null
  return text.split(/(\{\{\s*[\w.]+\s*\}\})/g).map((part, i) =>
    /^\{\{.*\}\}$/.test(part)
      ? <span key={i} className="bg-yellow-100 text-yellow-800 font-mono px-1 rounded">{part}</span>
      : <span key={i}>{part}</span>
  )
}

function Stars({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-gray-400 text-xs">—</span>
  return (
    <span className={rating >= 4 ? 'text-green-600' : rating === 3 ? 'text-yellow-600' : 'text-red-600'}>
      {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
    </span>
  )
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

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function PostServiceFeedbackPage() {
  const [logs, setLogs] = useState<FeedbackLog[]>([])
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

  // Test send
  const [testPhone, setTestPhone] = useState('')
  const [sendingTest, setSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null)

  // Filters
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterRating, setFilterRating] = useState('all')
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
          .from('post_service_feedback_messages')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000),
        supabase
          .from('wa_agent_config')
          .select('post_service_feedback_enabled, post_service_feedback_delay_days, post_service_feedback_template_id, post_service_feedback_template_lang, post_service_feedback_variable_map, post_service_feedback_send_time, google_review_link')
          .eq('id', 1)
          .single(),
        supabase
          .from('wa_templates')
          .select('id, name, display_name, status, language, header_text, body_text, footer_text, variable_examples')
          .eq('status', 'approved')
          .order('display_name'),
      ])

      if (logsRes.error) throw logsRes.error
      setLogs((logsRes.data || []) as FeedbackLog[])

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
          post_service_feedback_enabled:       configDraft.post_service_feedback_enabled,
          post_service_feedback_delay_days:    configDraft.post_service_feedback_delay_days,
          post_service_feedback_template_id:   configDraft.post_service_feedback_template_id,
          post_service_feedback_template_lang: configDraft.post_service_feedback_template_lang,
          post_service_feedback_variable_map:  configDraft.post_service_feedback_variable_map,
          post_service_feedback_send_time:     configDraft.post_service_feedback_send_time,
          google_review_link:                 configDraft.google_review_link,
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
      const { data, error: e } = await supabase.functions.invoke('wa-post-service-feedback', {
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

  async function sendTestMessage() {
    if (!testPhone.trim()) {
      alert('Enter a 10-digit mobile number')
      return
    }
    setSendingTest(true)
    setTestResult(null)
    try {
      const { data, error: e } = await supabase.functions.invoke('wa-post-service-feedback', {
        body: { test_phone: testPhone.trim() },
      })
      if (e) throw e
      setTestResult(data as Record<string, unknown>)
    } catch (e: unknown) {
      setTestResult({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      setSendingTest(false)
    }
  }

  // ── Stats ────────────────────────────────────────────────────────────────
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

  const stats = useMemo<Stats>(() => {
    const todayLogs = logs.filter(l => l.scheduled_for_date === today)
    const rated = logs.filter(l => l.rating !== null)
    const avg = rated.length
      ? rated.reduce((sum, l) => sum + (l.rating || 0), 0) / rated.length
      : null
    return {
      total_today: todayLogs.length,
      sent:        todayLogs.filter(l => ['sent', 'delivered', 'read', 'responded'].includes(l.status)).length,
      delivered:   todayLogs.filter(l => ['delivered', 'read', 'responded'].includes(l.status)).length,
      read:        todayLogs.filter(l => ['read', 'responded'].includes(l.status)).length,
      responded:   todayLogs.filter(l => l.status === 'responded').length,
      failed:      todayLogs.filter(l => l.status === 'failed').length,
      avg_rating:  avg,
      review_links_sent: logs.filter(l => l.review_link_sent).length,
    }
  }, [logs, today])

  // ── Filtered logs ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return logs.filter(l => {
      if (filterDate && l.scheduled_for_date !== filterDate) return false
      if (filterStatus !== 'all' && l.status !== filterStatus) return false
      if (filterRating === 'none' && l.rating !== null) return false
      if (filterRating !== 'all' && filterRating !== 'none' && l.rating !== Number(filterRating)) return false
      return true
    })
  }, [logs, filterDate, filterStatus, filterRating])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // ── Selected template variable examples ─────────────────────────────────
  const selectedTemplate = templates.find(t => t.id === configDraft?.post_service_feedback_template_id)
  const varExamples = selectedTemplate?.variable_examples || []

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">Loading Post-Service Feedback data…</div>
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
          <h1 className="text-xl font-semibold text-gray-900">Post-Service Feedback</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Sends a WhatsApp star-rating request a day after a job card closes, and captures the response.
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
          <StatCard label="Sent Today"        value={stats.total_today} />
          <StatCard label="Delivered"         value={stats.delivered}   color="text-indigo-700" />
          <StatCard label="Read"               value={stats.read}        color="text-teal-700" />
          <StatCard label="Responded"         value={stats.responded}   color="text-green-700" />
          <StatCard label="Failed"            value={stats.failed}      color="text-red-700" />
          <StatCard label="Avg Rating (All Time)" value={stats.avg_rating !== null ? stats.avg_rating.toFixed(1) : '—'} color="text-yellow-600" />
          <StatCard label="Review Links Sent" value={stats.review_links_sent} color="text-orange-700" />
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
                checked={configDraft.post_service_feedback_enabled}
                onChange={e => setConfigDraft(d => d ? { ...d, post_service_feedback_enabled: e.target.checked } : d)}
                className="w-4 h-4 accent-green-600"
              />
              <span className="text-sm font-medium text-gray-700">Enable daily post-service feedback job</span>
            </label>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${configDraft.post_service_feedback_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {configDraft.post_service_feedback_enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Daily Send Time (IST)</label>
            <input
              type="time"
              className="border border-gray-300 rounded px-3 py-2 text-sm"
              value={configDraft.post_service_feedback_send_time.slice(0, 5)}
              onChange={e => setConfigDraft(d => d ? { ...d, post_service_feedback_send_time: e.target.value + ':00' } : d)}
            />
            <p className="text-xs text-gray-400 mt-1">Time of day the daily feedback job runs, in Asia/Kolkata time.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">WhatsApp Template (approved only)</label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={configDraft.post_service_feedback_template_id ?? ''}
                onChange={e => setConfigDraft(d => d ? { ...d, post_service_feedback_template_id: e.target.value ? Number(e.target.value) : null } : d)}
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
                value={configDraft.post_service_feedback_template_lang}
                onChange={e => setConfigDraft(d => d ? { ...d, post_service_feedback_template_lang: e.target.value } : d)}
                placeholder="e.g. en, hi, en_IN"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Send Delay (days after job card closes)</label>
              <input
                type="number"
                min={0}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={configDraft.post_service_feedback_delay_days}
                onChange={e => setConfigDraft(d => d ? { ...d, post_service_feedback_delay_days: Number(e.target.value) } : d)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Google Review Link</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={configDraft.google_review_link ?? ''}
                onChange={e => setConfigDraft(d => d ? { ...d, google_review_link: e.target.value } : d)}
                placeholder="https://g.page/r/.../review"
              />
            </div>
          </div>

          {/* Template preview — shown when template is selected */}
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
              {varExamples.length > 0 && (
                <p className="text-xs text-gray-400 mt-1">
                  Variables in this template: {varExamples.map(v => v.name).filter(Boolean).join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Variable map — shown when template is selected */}
          {varExamples.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">
                Template Variable → <code>job_card_closed_data</code> Column Mapping
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {varExamples.map(ex => (
                  <div key={ex.name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-28 shrink-0 font-mono">{ex.name}</span>
                    <span className="text-gray-400 text-xs">→</span>
                    <input
                      type="text"
                      className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs font-mono"
                      value={configDraft.post_service_feedback_variable_map[ex.name ?? ''] ?? ''}
                      placeholder={`job_card_closed_data column (e.g. ${ex.example_value || ex.example})`}
                      onChange={e => setConfigDraft(d => {
                        if (!d || !ex.name) return d
                        return {
                          ...d,
                          post_service_feedback_variable_map: {
                            ...d.post_service_feedback_variable_map,
                            [ex.name]: e.target.value,
                          },
                        }
                      })}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Common columns: <code>first_name</code>, <code>last_name</code>, <code>vehicle_registration_number</code>, <code>job_card_number</code>, <code>closed_date_time</code>, <code>account_phone_number</code>
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

      {/* ── Manual Job Runner ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Run Feedback Job</h2>
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
              <option value="responded">Responded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rating</label>
            <select
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
              value={filterRating}
              onChange={e => { setFilterRating(e.target.value); setPage(1) }}
            >
              <option value="all">All</option>
              <option value="5">★★★★★ (5)</option>
              <option value="4">★★★★☆ (4)</option>
              <option value="3">★★★☆☆ (3)</option>
              <option value="2">★★☆☆☆ (2)</option>
              <option value="1">★☆☆☆☆ (1)</option>
              <option value="none">No Response Yet</option>
            </select>
          </div>
        </div>
        {(filterDate || filterStatus !== 'all' || filterRating !== 'all') && (
          <button
            onClick={() => { setFilterDate(''); setFilterStatus('all'); setFilterRating('all'); setPage(1) }}
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
                <th className="px-4 py-3 font-medium">Job Card</th>
                <th className="px-4 py-3 font-medium">Closed Date</th>
                <th className="px-4 py-3 font-medium">Sent At</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Remarks</th>
                <th className="px-4 py-3 font-medium">Review Link</th>
                <th className="px-4 py-3 font-medium">Failure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No feedback logs found.
                    {logs.length === 0 && ' Run the job to generate the first feedback requests.'}
                  </td>
                </tr>
              ) : pageRows.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{l.customer_name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{l.mobile_number}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{l.vehicle_registration_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 font-mono">{l.job_card_number || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtDate(l.closed_date)}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{fmtDateTime(l.sent_at)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[l.status] || 'bg-gray-100 text-gray-600'}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3"><Stars rating={l.rating} /></td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate" title={l.feedback_text || ''}>
                    {l.feedback_text || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {l.review_link_sent
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Sent</span>
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
