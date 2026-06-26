import {
  getMaxNumberedSnapshot,
  sanitizeCell,
} from '../lib/plan_retention_policy.mjs'

const METRICS_SECTION_HEADER = '## 5) Real-Time Metrics Log (Append Only)'
const CHANGELOG_SECTION_HEADER = '## 6) Change Log (What Was Updated in This Plan)'
const UPDATE_PROTOCOL_SECTION_HEADER = '## 7) Update Protocol For Future Chats'

const SNAPSHOT_NUMBER_REGEX = /^### 14\.(\d+)/gm
const SNAPSHOT_HEADING_REGEX = /^### 14\.\d+ Capture Snapshot: .*$/gm

function formatIstFromIso(isoString) {
  const date = new Date(String(isoString || ''))
  if (Number.isNaN(date.getTime())) return sanitizeCell(isoString)

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const parts = formatter.formatToParts(date)
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${valueByType.year}-${valueByType.month}-${valueByType.day} ${valueByType.hour}:${valueByType.minute}:${valueByType.second} IST`
}

function buildCompactTop10Table(topQueries) {
  const rows = Array.isArray(topQueries) ? topQueries.slice(0, 10) : []
  if (rows.length === 0) {
    return ['- Compact Top 10 table unavailable (no top query rows).']
  }

  const table = [
    '| rank | queryid | calls | total_ms | mean_ms |',
    '|---:|---|---:|---:|---:|',
  ]

  rows.forEach((row, index) => {
    table.push(
      `| ${index + 1} | ${sanitizeCell(row.queryid)} | ${sanitizeCell(row.calls)} | ${sanitizeCell(row.total_ms)} | ${sanitizeCell(row.mean_ms)} |`,
    )
  })

  return table
}

function buildSnapshotBlock(summary, snapshotNumber) {
  const tsIst = sanitizeCell(formatIstFromIso(summary.captured_at_utc))
  const top = summary.top_queries?.[0]
  const topText = top
    ? `- Top queryid: ${top.queryid} (calls=${top.calls}, total_ms=${top.total_ms}, mean_ms=${top.mean_ms})`
    : '- Top queryid: unavailable'

  const availability = summary.platform_logs ?? {}
  const availabilityLine = `- Platform logs capture status: auth=${availability.auth?.status ?? 'unknown'}, edge_functions=${availability.edge_functions?.status ?? 'unknown'}, realtime=${availability.realtime?.status ?? 'unknown'}, storage=${availability.storage?.status ?? 'unknown'}, database_health=${availability.database_health?.status ?? 'unknown'}`

  const mode = sanitizeCell(summary.capture_mode || 'automated')
  const comparison = summary.comparison || null
  const comparisonLine = comparison?.compared
    ? `- Comparison vs previous run (${sanitizeCell(comparison.previous_run_dir)}): status=${sanitizeCell(comparison.movement_status)}, delta_total_ms_sum=${sanitizeCell(comparison.totals?.delta_total_ms_sum)}, delta_calls_sum=${sanitizeCell(comparison.totals?.delta_calls_sum)}`
    : '- Comparison vs previous run: baseline established (no previous run).'

  const topRegressionLine = comparison?.compared && Array.isArray(comparison.top_regressions) && comparison.top_regressions.length > 0
    ? `- Top regressions by delta_total_ms: ${comparison.top_regressions.slice(0, 3).map((row) => `${row.queryid} (${row.delta_total_ms})`).join('; ')}`
    : '- Top regressions by delta_total_ms: none detected or unavailable.'

  const selfHealLines = Array.isArray(comparison?.recommended_actions)
    ? comparison.recommended_actions.slice(0, 3).map((item) => `- ${sanitizeCell(item)}`)
    : ['- Continue standard audit cycle and compare against next run.']

  const compactTop10Table = buildCompactTop10Table(summary.top_queries)

  return [
    `### 14.${snapshotNumber} Capture Snapshot: ${summary.capture_date || tsIst.slice(0, 10)} (Automated Audit Cycle)`,
    '',
    'What was captured:',
    `- Timestamp (IST): ${tsIst}`,
    `- Capture mode: ${mode}`,
    topText,
    availabilityLine,
    comparisonLine,
    topRegressionLine,
    '',
    'Compact Top 10 (run-local):',
    ...compactTop10Table,
    '',
    'Interpretation:',
    '- This snapshot is append-only and intended to keep log evidence current for the hardening cycle.',
    '- Prioritize fixes by highest delta_total_ms and call movement from run-to-run comparison.',
    '',
    'Self-heal plan:',
    ...selfHealLines,
    '',
    'Next action:',
    '- Re-run the cycle after the next production traffic window and validate that comparison status moves toward improved.',
    '',
  ].join('\n')
}

export function buildSupabasePlanMutation({ markdown, payload }) {
  const summary = payload || {}

  const notes = sanitizeCell(summary.notes || summary.top_query_summary || 'Automated Supabase audit cycle update')
  const capturedAtIst = sanitizeCell(formatIstFromIso(summary.captured_at_utc))
  const dateOnly = sanitizeCell(capturedAtIst.slice(0, 10))

  const metricsRow = `| ${dateOnly} (automated audit cycle) | - | - | - | - | - | - | - | - | ${notes} |`
  const changeLogRow = `| ${dateOnly} | Copilot | Automated Supabase audit cycle appended run summary (${capturedAtIst}) and refreshed plan evidence block from generated audit artifacts. |`

  const nextSnapshotNumber = getMaxNumberedSnapshot(markdown, SNAPSHOT_NUMBER_REGEX) + 1
  const snapshotAppendBlock = buildSnapshotBlock(summary, nextSnapshotNumber)

  return {
    metadata: {
      snapshotNumber: nextSnapshotNumber,
    },
    tableUpdates: [
      {
        sectionHeader: METRICS_SECTION_HEADER,
        nextSectionHeader: CHANGELOG_SECTION_HEADER,
        rowText: metricsRow,
        rowMatcher: (line) => line.includes('(automated audit cycle)'),
        keepLast: 2,
      },
      {
        sectionHeader: CHANGELOG_SECTION_HEADER,
        nextSectionHeader: UPDATE_PROTOCOL_SECTION_HEADER,
        rowText: changeLogRow,
        rowMatcher: (line) => line.includes('Automated Supabase audit cycle appended run summary'),
        keepLast: 2,
      },
    ],
    snapshotAppendBlock,
    snapshotHeadingRegex: SNAPSHOT_HEADING_REGEX,
    snapshotKeepLast: 2,
  }
}

export const supabasePlanAdapter = {
  name: 'supabase',
  buildMutation: buildSupabasePlanMutation,
}

export default supabasePlanAdapter
