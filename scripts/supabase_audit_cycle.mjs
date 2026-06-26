import fs from 'fs/promises'
import path from 'path'
import updateMasterPlanFromSummary from './supabase_plan_autoupdate.mjs'

const API_BASE = 'https://api.supabase.com'
const RUNS_DIR = 'supabase/evidence/audit_runs'

function normalizeProjectRef(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''

  const projectMatch = raw.match(/\/project\/([a-z0-9]+)/i)
  if (projectMatch && projectMatch[1]) return projectMatch[1]

  const hostMatch = raw.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i)
  if (hostMatch && hostMatch[1]) return hostMatch[1]

  return raw
}

function parseDotenv(content) {
  const out = {}
  for (const line of String(content ?? '').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx <= 0) continue

    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

async function loadLocalEnv(repoRoot) {
  const files = ['.env.local', '.env']
  const merged = {}

  for (const rel of files) {
    try {
      const abs = path.resolve(repoRoot, rel)
      const raw = await fs.readFile(abs, 'utf8')
      Object.assign(merged, parseDotenv(raw))
    } catch {
      // Optional env files.
    }
  }

  return merged
}

function isoNow() {
  return new Date().toISOString()
}

function dateOnly(iso) {
  return String(iso || '').slice(0, 10)
}

function ensureEnv(projectRef, managementToken) {
  const missing = []
  if (!projectRef) missing.push('SUPABASE_PROJECT_REF')
  if (!managementToken) missing.push('SUPABASE_MANAGEMENT_TOKEN')

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}

function enforceTopQueriesGate(topQueriesResult) {
  const rows = Array.isArray(topQueriesResult?.rows) ? topQueriesResult.rows : []
  if (rows.length > 0) return

  const errorPayload = topQueriesResult?.error
  const errorText = errorPayload ? ` Details: ${JSON.stringify(errorPayload)}` : ''
  throw new Error(
    `Validation gate failed: top_queries is empty. Aborting audit cycle to avoid weak artifacts and plan updates.${errorText}`,
  )
}

async function callManagementApi({ method = 'GET', pathName, token, body }) {
  const url = `${API_BASE}${pathName}`
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()
  let parsed
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = { raw: text }
  }

  return {
    ok: response.ok,
    status: response.status,
    data: parsed,
  }
}

async function runSql(projectRef, token, sql, label) {
  const result = await callManagementApi({
    method: 'POST',
    pathName: `/v1/projects/${projectRef}/database/query`,
    token,
    body: { query: sql, read_only: true },
  })

  if (!result.ok) {
    return {
      status: 'error',
      label,
      error: result.data,
      rows: [],
    }
  }

  const rows = Array.isArray(result.data)
    ? result.data
    : Array.isArray(result.data?.result)
      ? result.data.result
      : []
  return {
    status: 'ok',
    label,
    rows,
  }
}

async function collectPlatformLogs(projectRef, token, sourceTable, limit = 100) {
  const sql = `select timestamp, event_message from ${sourceTable} order by timestamp desc limit ${Number(limit)}`
  const endpoint = `/v1/projects/${projectRef}/analytics/endpoints/logs.all?sql=${encodeURIComponent(sql)}`
  const response = await callManagementApi({ method: 'GET', pathName: endpoint, token })

  if (!response.ok) {
    return {
      status: 'unavailable',
      endpoint,
      count: 0,
      records: [],
      error: response.data,
    }
  }

  const records = Array.isArray(response.data?.result) ? response.data.result : []
  return {
    status: 'ok',
    endpoint,
    count: records.length,
    records,
  }
}

function summarizeTopQuery(topRows) {
  if (!Array.isArray(topRows) || topRows.length === 0) return 'Top query unavailable'
  const top = topRows[0]
  return `Top query ${top.queryid} calls=${top.calls} total_ms=${top.total_ms} mean_ms=${top.mean_ms}`
}

function toSafeJson(value) {
  return JSON.stringify(value, null, 2)
}

function toBoolEnv(value, defaultValue = false) {
  const raw = String(value ?? '').trim().toLowerCase()
  if (!raw) return defaultValue
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function enforceManualPostDeployAuditGate(repoRoot, envFileVars) {
  const confirmation = String(
    process.env.SUPABASE_AUDIT_POST_DEPLOY_CONFIRM ||
      envFileVars.SUPABASE_AUDIT_POST_DEPLOY_CONFIRM ||
      '',
  )
    .trim()
    .toUpperCase()

  const requiredToken = 'VERCEL_PROD_DEPLOYED_AND_WAITED_15M'
  if (confirmation === requiredToken) return

  const commandHint =
    'SUPABASE_AUDIT_POST_DEPLOY_CONFIRM=VERCEL_PROD_DEPLOYED_AND_WAITED_15M npm run supabase:audit:cycle:postdeploy'

  const message = [
    'Audit execution blocked by manual post-deploy guard.',
    'Do not run audit immediately after local edits.',
    'Required preconditions:',
    '1) Vercel production deploy is complete.',
    '2) Wait 10-15 minutes after deploy.',
    '3) Real traffic has hit updated paths.',
    `To run intentionally, execute: ${commandHint}`,
    `Repo: ${repoRoot}`,
  ].join('\n')

  throw new Error(message)
}

function mapByQueryId(rows) {
  const map = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const key = String(row.queryid)
    if (!key) continue
    map.set(key, row)
  }
  return map
}

async function loadPreviousSummary(repoRoot) {
  const root = path.resolve(repoRoot, RUNS_DIR)
  let entries = []
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return null
  }

  const runDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()

  if (runDirs.length === 0) return null

  const latestDir = runDirs[runDirs.length - 1]
  const summaryPath = path.resolve(root, latestDir, 'summary.json')
  try {
    const raw = await fs.readFile(summaryPath, 'utf8')
    return {
      run_dir: latestDir,
      summary: JSON.parse(raw),
      summary_path: summaryPath,
    }
  } catch {
    return null
  }
}

function buildComparison(currentSummary, previousSummaryEnvelope) {
  if (!previousSummaryEnvelope?.summary) {
    return {
      compared: false,
      reason: 'no_previous_run',
      movement_status: 'baseline_established',
      recommended_actions: [
        'Use this run as baseline and compare against the next run for interval deltas.',
      ],
      top_regressions: [],
      top_improvements: [],
      totals: {
        delta_calls_sum: 0,
        delta_total_ms_sum: 0,
      },
    }
  }

  const previousSummary = previousSummaryEnvelope.summary
  const currentMap = mapByQueryId(currentSummary.top_queries)
  const previousMap = mapByQueryId(previousSummary.top_queries)
  const queryIds = new Set([...currentMap.keys(), ...previousMap.keys()])

  const deltas = []
  for (const queryId of queryIds) {
    const curr = currentMap.get(queryId) || {}
    const prev = previousMap.get(queryId) || {}

    const currentCalls = toNumber(curr.calls)
    const previousCalls = toNumber(prev.calls)
    const currentTotalMs = toNumber(curr.total_ms)
    const previousTotalMs = toNumber(prev.total_ms)

    const deltaCalls = currentCalls - previousCalls
    const deltaTotalMs = Number((currentTotalMs - previousTotalMs).toFixed(2))

    deltas.push({
      queryid: queryId,
      delta_calls: deltaCalls,
      delta_total_ms: deltaTotalMs,
      previous_calls: previousCalls,
      current_calls: currentCalls,
      previous_total_ms: previousTotalMs,
      current_total_ms: currentTotalMs,
      current_query_sample: curr.query_sample || null,
    })
  }

  const regressions = deltas
    .filter((row) => row.delta_total_ms > 0)
    .sort((a, b) => b.delta_total_ms - a.delta_total_ms)
    .slice(0, 5)

  const improvements = deltas
    .filter((row) => row.delta_total_ms < 0)
    .sort((a, b) => a.delta_total_ms - b.delta_total_ms)
    .slice(0, 5)

  const deltaCallsSum = deltas.reduce((sum, row) => sum + row.delta_calls, 0)
  const deltaTotalMsSum = Number(deltas.reduce((sum, row) => sum + row.delta_total_ms, 0).toFixed(2))

  let movementStatus = 'unchanged'
  if (deltaTotalMsSum > 0) movementStatus = 'regressed'
  if (deltaTotalMsSum < 0) movementStatus = 'improved'

  const recommendedActions = []
  if (movementStatus === 'unchanged') {
    recommendedActions.push('No measurable movement detected; run controlled traffic for 10-15 minutes and compare again.')
  }

  if (regressions.some((row) => String(row.current_query_sample || '').includes('pgrst_source_count'))) {
    recommendedActions.push('Count CTE patterns increased; prioritize removing default exact-count usage on reception/list endpoints.')
  }

  if (regressions.some((row) => String(row.current_query_sample || '').includes('OFFSET'))) {
    recommendedActions.push('OFFSET-heavy queries increased; prioritize keyset pagination on list endpoints still using range/offset.')
  }

  if (regressions.some((row) => row.queryid === '-2876120296317350531')) {
    recommendedActions.push('Realtime WAL polling increased; reduce duplicate subscriptions and channel fan-out.')
  }

  if (recommendedActions.length === 0) {
    recommendedActions.push('Continue monitoring and prioritize top delta_total_ms queryids in next patch batch.')
  }

  return {
    compared: true,
    previous_run_dir: previousSummaryEnvelope.run_dir,
    previous_captured_at_utc: previousSummary.captured_at_utc || null,
    movement_status: movementStatus,
    totals: {
      delta_calls_sum: deltaCallsSum,
      delta_total_ms_sum: deltaTotalMsSum,
    },
    top_regressions: regressions,
    top_improvements: improvements,
    recommended_actions: recommendedActions,
    deltas,
  }
}

function evaluateRegressionGuard(summary, thresholds) {
  const comparison = summary.comparison || {}
  const topRegressions = Array.isArray(comparison.top_regressions) ? comparison.top_regressions : []
  const deltaTotalMsSum = toNumber(comparison.totals?.delta_total_ms_sum)
  const topSingleDeltaMs = topRegressions.length > 0 ? toNumber(topRegressions[0].delta_total_ms) : 0

  const isRegressed = comparison.movement_status === 'regressed'
  const warnTriggered =
    isRegressed &&
    (deltaTotalMsSum >= thresholds.warn_delta_total_ms_sum || topSingleDeltaMs >= thresholds.block_single_query_delta_ms)

  const blockTriggered =
    isRegressed &&
    (deltaTotalMsSum >= thresholds.block_delta_total_ms_sum || topSingleDeltaMs >= thresholds.block_single_query_delta_ms)

  return {
    enabled: true,
    warn_triggered: warnTriggered,
    block_triggered: blockTriggered,
    delta_total_ms_sum: deltaTotalMsSum,
    top_single_query_delta_ms: topSingleDeltaMs,
    thresholds,
    status: blockTriggered ? 'blocked_requires_checklist' : warnTriggered ? 'warn_checklist_recommended' : 'ok',
  }
}

function buildFixChecklistMarkdown(summary, guard) {
  const lines = []
  lines.push(`# Automated Fix Checklist (${summary.captured_at_utc})`)
  lines.push('')
  lines.push('## Guard Status')
  lines.push('')
  lines.push(`- Status: ${guard.status}`)
  lines.push(`- Delta total_ms sum: ${guard.delta_total_ms_sum}`)
  lines.push(`- Top single query delta_total_ms: ${guard.top_single_query_delta_ms}`)
  lines.push(`- Warn threshold: ${guard.thresholds.warn_delta_total_ms_sum}`)
  lines.push(`- Block threshold: ${guard.thresholds.block_delta_total_ms_sum}`)
  lines.push(`- Block single-query threshold: ${guard.thresholds.block_single_query_delta_ms}`)
  lines.push('')
  lines.push('## Top Regressions')
  lines.push('')
  lines.push('| queryid | delta_calls | delta_total_ms |')
  lines.push('|---|---:|---:|')
  for (const row of (summary.comparison?.top_regressions ?? []).slice(0, 10)) {
    lines.push(`| ${row.queryid} | ${row.delta_calls} | ${row.delta_total_ms} |`)
  }
  lines.push('')
  lines.push('## Auto-Generated Actions')
  lines.push('')
  const actions = Array.isArray(summary.comparison?.recommended_actions) ? summary.comparison.recommended_actions : []
  if (actions.length === 0) {
    lines.push('- Continue monitoring and patch by highest delta_total_ms query families.')
  } else {
    actions.forEach((action) => lines.push(`- ${action}`))
  }
  lines.push('')
  lines.push('## Validation SQL')
  lines.push('')
  lines.push('```sql')
  lines.push('SELECT')
  lines.push('  queryid,')
  lines.push('  calls,')
  lines.push('  round(total_exec_time::numeric, 2) AS total_ms,')
  lines.push('  round(mean_exec_time::numeric, 2) AS mean_ms')
  lines.push('FROM extensions.pg_stat_statements')
  lines.push('ORDER BY total_exec_time DESC')
  lines.push('LIMIT 25;')
  lines.push('```')
  lines.push('')
  return lines.join('\n')
}

function makeMarkdownSummary(summary) {
  const lines = []
  lines.push(`# Supabase Audit Cycle Summary (${summary.captured_at_utc})`)
  lines.push('')
  lines.push(`- Project ref: ${summary.project_ref}`)
  lines.push(`- Capture mode: ${summary.capture_mode}`)
  lines.push(`- Top query summary: ${summary.top_query_summary}`)
  lines.push('')
  lines.push('## Query Performance (Top 10)')
  lines.push('')
  lines.push('| queryid | calls | total_ms | mean_ms |')
  lines.push('|---|---:|---:|---:|')
  for (const row of summary.top_queries.slice(0, 10)) {
    lines.push(`| ${row.queryid} | ${row.calls} | ${row.total_ms} | ${row.mean_ms} |`)
  }
  lines.push('')
  lines.push('## Platform Logs')
  lines.push('')
  for (const [service, info] of Object.entries(summary.platform_logs)) {
    lines.push(`- ${service}: status=${info.status}, count=${info.count}`)
  }
  lines.push('')
  lines.push('## Run Comparison')
  lines.push('')
  if (!summary.comparison?.compared) {
    lines.push('- No previous run available; baseline established.')
  } else {
    lines.push(`- Previous run: ${summary.comparison.previous_run_dir}`)
    lines.push(`- Movement status: ${summary.comparison.movement_status}`)
    lines.push(`- Delta total_ms sum: ${summary.comparison.totals.delta_total_ms_sum}`)
    lines.push(`- Delta calls sum: ${summary.comparison.totals.delta_calls_sum}`)
    lines.push('')
    lines.push('| queryid | delta_calls | delta_total_ms |')
    lines.push('|---|---:|---:|')
    for (const row of summary.comparison.top_regressions.slice(0, 5)) {
      lines.push(`| ${row.queryid} | ${row.delta_calls} | ${row.delta_total_ms} |`)
    }
  }
  lines.push('')
  lines.push('## Regression Guard')
  lines.push('')
  if (summary.regression_guard) {
    lines.push(`- status: ${summary.regression_guard.status}`)
    lines.push(`- warn_triggered: ${summary.regression_guard.warn_triggered}`)
    lines.push(`- block_triggered: ${summary.regression_guard.block_triggered}`)
    lines.push(`- delta_total_ms_sum: ${summary.regression_guard.delta_total_ms_sum}`)
    if (summary.regression_guard.fix_checklist_path) {
      lines.push(`- fix_checklist: ${summary.regression_guard.fix_checklist_path}`)
    }
  } else {
    lines.push('- unavailable')
  }
  lines.push('')
  lines.push('## DB Health')
  lines.push('')
  if (summary.db_health.length === 0) {
    lines.push('- unavailable')
  } else {
    for (const row of summary.db_health) {
      lines.push(`- ${row.db_name}: commits=${row.commits}, rollbacks=${row.rollbacks}, blks_hit_ratio_pct=${row.blks_hit_ratio_pct}, deadlocks=${row.deadlocks}`)
    }
  }
  lines.push('')
  lines.push('## Performance KPIs')
  lines.push('')
  if (summary.performance_kpis.length === 0) {
    lines.push('- unavailable')
  } else {
    for (const row of summary.performance_kpis) {
      lines.push(`- slow_queries_total_time_gt_1000=${row.slow_queries_total_time_gt_1000}, cache_hit_rate_pct=${row.cache_hit_rate_pct}, avg_rows_per_call=${row.avg_rows_per_call}`)
    }
  }
  lines.push('')
  lines.push('## Connection Snapshot')
  lines.push('')
  if (summary.connection_snapshot.length === 0) {
    lines.push('- unavailable')
  } else {
    for (const row of summary.connection_snapshot) {
      lines.push(`- total_connections=${row.total_connections}, active_connections=${row.active_connections}, idle_connections=${row.idle_connections}, waiting_connections=${row.waiting_connections}, max_connections=${row.max_connections}`)
    }
  }
  lines.push('')
  lines.push('## Postgres Log Severity (Recent)')
  lines.push('')
  const sev = summary.postgres_log_severity || {}
  lines.push(`- error=${sev.error ?? 0}, warning=${sev.warning ?? 0}, fatal=${sev.fatal ?? 0}, panic=${sev.panic ?? 0}, total_records=${sev.total_records ?? 0}`)
  lines.push('')
  return lines.join('\n')
}

function makeTopSlowQueriesMarkdown(rows, capturedAt) {
  const lines = []
  lines.push(`# Top 10 Slow Queries (Detailed) - ${capturedAt}`)
  lines.push('')
  lines.push('| queryid | role | calls | mean_time | min_time | max_time | total_time | rows_read | cache_hit_rate | prop_total_time |')
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const row of Array.isArray(rows) ? rows : []) {
    lines.push(`| ${row.queryid} | ${row.rolname ?? 'unknown'} | ${row.calls} | ${row.mean_time} | ${row.min_time} | ${row.max_time} | ${row.total_time} | ${row.rows_read} | ${row.cache_hit_rate} | ${row.prop_total_time} |`)
  }
  lines.push('')
  lines.push('## Query Text')
  lines.push('')
  for (const row of Array.isArray(rows) ? rows : []) {
    lines.push(`### queryid ${row.queryid}`)
    lines.push('')
    lines.push('```sql')
    lines.push(String(row.query || '').trim())
    lines.push('```')
    lines.push('')
  }
  return lines.join('\n')
}

function summarizePostgresLogSeverity(records) {
  const out = {
    error: 0,
    warning: 0,
    fatal: 0,
    panic: 0,
    total_records: Array.isArray(records) ? records.length : 0,
  }

  for (const row of Array.isArray(records) ? records : []) {
    const text = String(row?.event_message ?? '').toUpperCase()
    if (!text) continue
    if (text.includes(' PANIC ') || text.startsWith('PANIC') || text.includes('PANIC:')) out.panic += 1
    else if (text.includes(' FATAL ') || text.startsWith('FATAL') || text.includes('FATAL:')) out.fatal += 1
    else if (text.includes(' ERROR ') || text.startsWith('ERROR') || text.includes('ERROR:')) out.error += 1
    else if (text.includes(' WARNING ') || text.startsWith('WARNING') || text.includes('WARNING:')) out.warning += 1
  }

  return out
}

async function writeArtifacts(repoRoot, runTimestamp, payloads) {
  const runDir = path.resolve(repoRoot, RUNS_DIR, runTimestamp)
  await fs.mkdir(runDir, { recursive: true })

  for (const [name, content] of Object.entries(payloads)) {
    const filePath = path.resolve(runDir, name)
    await fs.writeFile(filePath, content, 'utf8')
  }

  return runDir
}

async function main() {
  const repoRoot = process.cwd()
  const envFileVars = await loadLocalEnv(repoRoot)
  enforceManualPostDeployAuditGate(repoRoot, envFileVars)
  const previousSummaryEnvelope = await loadPreviousSummary(repoRoot)

  const projectRef = normalizeProjectRef(
    process.env.SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_ID || envFileVars.SUPABASE_PROJECT_REF || envFileVars.SUPABASE_PROJECT_ID || '',
  )

  const managementToken =
    process.env.SUPABASE_MANAGEMENT_TOKEN || envFileVars.SUPABASE_MANAGEMENT_TOKEN || ''

  const autoUpdatePlan = (
    process.env.SUPABASE_AUDIT_AUTO_UPDATE_PLAN || envFileVars.SUPABASE_AUDIT_AUTO_UPDATE_PLAN || 'true'
  ).toLowerCase() !== 'false'
  const allowRegressionPlanUpdate = toBoolEnv(
    process.env.SUPABASE_AUDIT_ALLOW_REGRESSION || envFileVars.SUPABASE_AUDIT_ALLOW_REGRESSION,
    false,
  )

  const thresholds = {
    warn_delta_total_ms_sum: toNumber(process.env.SUPABASE_AUDIT_WARN_DELTA_TOTAL_MS_SUM || envFileVars.SUPABASE_AUDIT_WARN_DELTA_TOTAL_MS_SUM || '2000'),
    block_delta_total_ms_sum: toNumber(process.env.SUPABASE_AUDIT_BLOCK_DELTA_TOTAL_MS_SUM || envFileVars.SUPABASE_AUDIT_BLOCK_DELTA_TOTAL_MS_SUM || '5000'),
    block_single_query_delta_ms: toNumber(process.env.SUPABASE_AUDIT_BLOCK_SINGLE_QUERY_DELTA_MS || envFileVars.SUPABASE_AUDIT_BLOCK_SINGLE_QUERY_DELTA_MS || '1500'),
  }

  ensureEnv(projectRef, managementToken)

  const capturedAt = isoNow()
  const runTimestamp = capturedAt.replace(/[:.]/g, '-').replace('T', '__').replace('Z', 'Z')

  const sqlTopQueries = `
SELECT
  queryid,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  rows,
  shared_blks_read,
  shared_blks_hit,
  temp_blks_read,
  temp_blks_written,
  left(query, 200) AS query_sample
FROM extensions.pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 25;
  `.trim()

  const sqlTopSlowQueriesDetailed = `
SELECT
  s.query,
  r.rolname,
  s.calls,
  round(s.mean_exec_time::numeric, 12) AS mean_time,
  round(s.min_exec_time::numeric, 6) AS min_time,
  round(s.max_exec_time::numeric, 6) AS max_time,
  round(s.total_exec_time::numeric, 6) AS total_time,
  s.rows AS rows_read,
  round((s.shared_blks_hit::numeric / nullif(s.shared_blks_hit + s.shared_blks_read, 0)) * 100, 16) AS cache_hit_rate,
  round((((s.total_exec_time / nullif(sum(s.total_exec_time) OVER (), 0)) * 100)::numeric), 16) AS prop_total_time,
  null::text AS index_advisor_result,
  s.queryid
FROM extensions.pg_stat_statements s
LEFT JOIN pg_roles r ON r.oid = s.userid
ORDER BY s.total_exec_time DESC
LIMIT 10;
  `.trim()

  const sqlTrackedQueries = `
SELECT
  queryid,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms
FROM extensions.pg_stat_statements
WHERE queryid IN (
  6416750758406621842::bigint,
  -5344960703026327435::bigint,
  -6712128630152386476::bigint,
  -225245605736690330::bigint,
  -5044213774447814878::bigint,
  -2876120296317350531::bigint,
  -922008049376959953::bigint,
  852176900607336119::bigint,
  2744925251257801673::bigint,
  -5633448213020496946::bigint,
  8277935260341689633::bigint
)
ORDER BY total_exec_time DESC;
  `.trim()

  const sqlTableScanRatios = `
SELECT
  relname AS table_name,
  seq_scan,
  idx_scan,
  round((seq_scan::numeric / nullif(seq_scan + idx_scan, 0)) * 100, 2) AS seq_scan_pct
FROM pg_stat_user_tables
WHERE relname IN ('service_reception_entries', 'technician_assignments', 'service_vas_jc_data')
ORDER BY seq_scan_pct DESC NULLS LAST;
  `.trim()

  const sqlDbHealth = `
SELECT
  datname AS db_name,
  xact_commit AS commits,
  xact_rollback AS rollbacks,
  blks_read,
  blks_hit,
  round((blks_hit::numeric / nullif(blks_hit + blks_read, 0)) * 100, 2) AS blks_hit_ratio_pct,
  deadlocks,
  temp_files,
  temp_bytes
FROM pg_stat_database
WHERE datname = current_database();
  `.trim()

  const sqlAuthRecent = `
SELECT
  date_trunc('minute', created_at) AS minute_bucket,
  count(*) AS event_count
FROM auth.audit_log_entries
WHERE created_at >= now() - interval '60 minutes'
GROUP BY 1
ORDER BY 1 DESC
LIMIT 60;
  `.trim()

  const sqlPerformanceKpis = `
WITH base AS (
  SELECT
    total_exec_time,
    shared_blks_hit,
    shared_blks_read,
    rows,
    calls
  FROM extensions.pg_stat_statements
)
SELECT
  count(*) FILTER (WHERE total_exec_time > 1000) AS slow_queries_total_time_gt_1000,
  round((sum(shared_blks_hit)::numeric / nullif(sum(shared_blks_hit) + sum(shared_blks_read), 0)) * 100, 2) AS cache_hit_rate_pct,
  round((sum(rows)::numeric / nullif(sum(calls), 0)), 2) AS avg_rows_per_call
FROM base;
  `.trim()

  const sqlConnectionSnapshot = `
SELECT
  (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections,
  count(*) AS total_connections,
  count(*) FILTER (WHERE state = 'active') AS active_connections,
  count(*) FILTER (WHERE state = 'idle') AS idle_connections,
  count(*) FILTER (WHERE wait_event_type IS NOT NULL) AS waiting_connections
FROM pg_stat_activity
WHERE datname = current_database();
  `.trim()

  const sqlTableIoHotspots = `
SELECT
  relname AS table_name,
  heap_blks_read,
  heap_blks_hit,
  idx_blks_read,
  idx_blks_hit,
  toast_blks_read,
  toast_blks_hit,
  round((heap_blks_hit::numeric / nullif(heap_blks_hit + heap_blks_read, 0)) * 100, 2) AS heap_cache_hit_rate_pct,
  (coalesce(heap_blks_read, 0) + coalesce(idx_blks_read, 0) + coalesce(toast_blks_read, 0)) AS total_read_blocks
FROM pg_statio_user_tables
ORDER BY total_read_blocks DESC
LIMIT 20;
  `.trim()

  const [
    topQueries,
    topSlowQueriesDetailed,
    trackedQueries,
    tableScans,
    dbHealth,
    authRecent,
    performanceKpis,
    connectionSnapshot,
    tableIoHotspots,
  ] = await Promise.all([
    runSql(projectRef, managementToken, sqlTopQueries, 'top_queries'),
    runSql(projectRef, managementToken, sqlTopSlowQueriesDetailed, 'top_slow_queries_detailed'),
    runSql(projectRef, managementToken, sqlTrackedQueries, 'tracked_queries'),
    runSql(projectRef, managementToken, sqlTableScanRatios, 'table_scan_ratios'),
    runSql(projectRef, managementToken, sqlDbHealth, 'db_health'),
    runSql(projectRef, managementToken, sqlAuthRecent, 'auth_recent_events'),
    runSql(projectRef, managementToken, sqlPerformanceKpis, 'performance_kpis'),
    runSql(projectRef, managementToken, sqlConnectionSnapshot, 'connection_snapshot'),
    runSql(projectRef, managementToken, sqlTableIoHotspots, 'table_io_hotspots'),
  ])

  enforceTopQueriesGate(topQueries)

  const [authLogs, edgeLogs, realtimeLogs, storageLogs, dbHealthLogs] = await Promise.all([
    collectPlatformLogs(projectRef, managementToken, 'auth_logs'),
    collectPlatformLogs(projectRef, managementToken, 'edge_logs'),
    collectPlatformLogs(projectRef, managementToken, 'realtime_logs'),
    collectPlatformLogs(projectRef, managementToken, 'storage_logs'),
    collectPlatformLogs(projectRef, managementToken, 'postgres_logs'),
  ])

  const summary = {
    project_ref: projectRef,
    captured_at_utc: capturedAt,
    capture_date: dateOnly(capturedAt),
    capture_mode: 'automated_supabase_audit_cycle',
    top_queries: topQueries.rows,
    tracked_queries: trackedQueries.rows,
    table_scan_ratios: tableScans.rows,
    db_health: dbHealth.rows,
    auth_recent_events: authRecent.rows,
    top_10_slow_queries_detailed: topSlowQueriesDetailed.rows,
    performance_kpis: performanceKpis.rows,
    connection_snapshot: connectionSnapshot.rows,
    table_io_hotspots: tableIoHotspots.rows,
    platform_logs: {
      auth: { status: authLogs.status, count: authLogs.count, endpoint: authLogs.endpoint || null },
      edge_functions: { status: edgeLogs.status, count: edgeLogs.count, endpoint: edgeLogs.endpoint || null },
      realtime: { status: realtimeLogs.status, count: realtimeLogs.count, endpoint: realtimeLogs.endpoint || null },
      storage: { status: storageLogs.status, count: storageLogs.count, endpoint: storageLogs.endpoint || null },
      database_health: { status: dbHealthLogs.status, count: dbHealthLogs.count, endpoint: dbHealthLogs.endpoint || null },
    },
    postgres_log_severity: summarizePostgresLogSeverity(dbHealthLogs.records),
    notes: summarizeTopQuery(topQueries.rows),
    top_query_summary: summarizeTopQuery(topQueries.rows),
    errors: {
      top_queries: topQueries.status === 'error' ? topQueries.error : null,
      tracked_queries: trackedQueries.status === 'error' ? trackedQueries.error : null,
      top_slow_queries_detailed: topSlowQueriesDetailed.status === 'error' ? topSlowQueriesDetailed.error : null,
      table_scan_ratios: tableScans.status === 'error' ? tableScans.error : null,
      db_health: dbHealth.status === 'error' ? dbHealth.error : null,
      auth_recent_events: authRecent.status === 'error' ? authRecent.error : null,
      performance_kpis: performanceKpis.status === 'error' ? performanceKpis.error : null,
      connection_snapshot: connectionSnapshot.status === 'error' ? connectionSnapshot.error : null,
      table_io_hotspots: tableIoHotspots.status === 'error' ? tableIoHotspots.error : null,
    },
  }

  summary.comparison = buildComparison(summary, previousSummaryEnvelope)
  if (summary.comparison?.compared) {
    summary.notes = `${summary.top_query_summary}; comparison=${summary.comparison.movement_status}; delta_total_ms_sum=${summary.comparison.totals.delta_total_ms_sum}`
  }

  summary.regression_guard = evaluateRegressionGuard(summary, thresholds)

  const markdown = makeMarkdownSummary(summary)
  const detailedTop10Markdown = makeTopSlowQueriesMarkdown(summary.top_10_slow_queries_detailed, capturedAt)

  let fixChecklist = null
  let fixChecklistPathRel = null
  if (summary.regression_guard.warn_triggered || summary.regression_guard.block_triggered) {
    fixChecklist = buildFixChecklistMarkdown(summary, summary.regression_guard)
    fixChecklistPathRel = path.posix.join(RUNS_DIR, runTimestamp, 'fix_checklist.md')
    summary.regression_guard.fix_checklist_path = fixChecklistPathRel
  }

  const artifacts = {
    'summary.json': toSafeJson(summary),
    'summary.md': markdown,
    'raw_top_queries.json': toSafeJson(topQueries),
    'raw_top_10_slow_queries_detailed.json': toSafeJson(topSlowQueriesDetailed),
    'raw_tracked_queries.json': toSafeJson(trackedQueries),
    'raw_table_scan_ratios.json': toSafeJson(tableScans),
    'raw_db_health.json': toSafeJson(dbHealth),
    'raw_auth_recent_events.json': toSafeJson(authRecent),
    'raw_performance_kpis.json': toSafeJson(performanceKpis),
    'raw_connection_snapshot.json': toSafeJson(connectionSnapshot),
    'raw_table_io_hotspots.json': toSafeJson(tableIoHotspots),
    'raw_platform_auth_logs.json': toSafeJson(authLogs),
    'raw_platform_edge_logs.json': toSafeJson(edgeLogs),
    'raw_platform_realtime_logs.json': toSafeJson(realtimeLogs),
    'raw_platform_storage_logs.json': toSafeJson(storageLogs),
    'raw_platform_postgres_logs.json': toSafeJson(dbHealthLogs),
    'comparison.json': toSafeJson(summary.comparison),
    'regression_guard.json': toSafeJson(summary.regression_guard),
    'top_10_slow_queries_detailed.md': detailedTop10Markdown,
    'performance_snapshot.json': toSafeJson({
      performance_kpis: summary.performance_kpis,
      connection_snapshot: summary.connection_snapshot,
      table_io_hotspots: summary.table_io_hotspots,
      postgres_log_severity: summary.postgres_log_severity,
      platform_logs_status: summary.platform_logs,
    }),
  }

  if (fixChecklist) {
    artifacts['fix_checklist.md'] = fixChecklist
  }

  const runDir = await writeArtifacts(repoRoot, runTimestamp, artifacts)

  const checklistGenerated = Boolean(fixChecklist)
  if (summary.regression_guard.block_triggered && !checklistGenerated) {
    throw new Error('Regression guard blocked run: severe regression detected and fix checklist was not generated.')
  }

  let planUpdateResult = null
  const shouldBlockPlanUpdate =
    summary.regression_guard.block_triggered && !allowRegressionPlanUpdate && !checklistGenerated

  if (autoUpdatePlan && !shouldBlockPlanUpdate) {
    planUpdateResult = await updateMasterPlanFromSummary(summary, { repoRoot })
  }

  console.log('Supabase audit cycle completed.')
  console.log(`Artifacts: ${runDir}`)
  if (fixChecklistPathRel) {
    console.log(`Fix checklist: ${path.resolve(repoRoot, fixChecklistPathRel)}`)
  }
  if (planUpdateResult) {
    console.log(`Plan updated: ${planUpdateResult.planPath} (snapshot 14.${planUpdateResult.snapshotNumber})`)
  } else if (shouldBlockPlanUpdate) {
    console.log('Plan update blocked by regression guard (set SUPABASE_AUDIT_ALLOW_REGRESSION=true to override).')
  } else {
    console.log('Plan auto-update skipped (SUPABASE_AUDIT_AUTO_UPDATE_PLAN=false).')
  }
}

main().catch((error) => {
  console.error('supabase_audit_cycle failed:', error.message)
  process.exitCode = 1
})
