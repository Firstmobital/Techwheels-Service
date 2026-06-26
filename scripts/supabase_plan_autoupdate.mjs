import fs from 'fs/promises'
import path from 'path'

const DEFAULT_PLAN_PATH =
  'docs/Implementation_plans/webversion/categories/supabase/active/SUPABASE-001_PRODUCTION_HARDENING_MASTER_PLAN.md'

function sanitizeCell(value) {
  return String(value ?? '-')
    .replace(/\|/g, '/')
    .replace(/\s+/g, ' ')
    .trim()
}

function sectionRange(text, startHeader, endHeader) {
  const start = text.indexOf(startHeader)
  if (start === -1) return null
  const end = endHeader ? text.indexOf(endHeader, start + startHeader.length) : -1
  return {
    start,
    end: end === -1 ? text.length : end,
  }
}

function appendTableRowInSection(markdown, sectionHeader, nextSectionHeader, rowText) {
  const range = sectionRange(markdown, sectionHeader, nextSectionHeader)
  if (!range) return markdown

  const before = markdown.slice(0, range.start)
  const section = markdown.slice(range.start, range.end)
  const after = markdown.slice(range.end)

  const lines = section.split('\n')
  let insertionIndex = -1
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith('|')) {
      insertionIndex = i
      break
    }
  }

  if (insertionIndex === -1) return markdown
  lines.splice(insertionIndex + 1, 0, rowText)

  return `${before}${lines.join('\n')}${after}`
}

function pruneAutomatedRowsInSection(markdown, sectionHeader, nextSectionHeader, isAutomatedRow, keepLast = 2) {
  const range = sectionRange(markdown, sectionHeader, nextSectionHeader)
  if (!range) return markdown

  const before = markdown.slice(0, range.start)
  const section = markdown.slice(range.start, range.end)
  const after = markdown.slice(range.end)

  const lines = section.split('\n')
  const automatedIndexes = []
  lines.forEach((line, idx) => {
    if (line.startsWith('|') && isAutomatedRow(line)) {
      automatedIndexes.push(idx)
    }
  })

  if (automatedIndexes.length <= keepLast) return markdown

  const toDelete = automatedIndexes.slice(0, automatedIndexes.length - keepLast)
  for (let i = toDelete.length - 1; i >= 0; i -= 1) {
    lines.splice(toDelete[i], 1)
  }

  return `${before}${lines.join('\n')}${after}`
}

function getNextSnapshotNumber(markdown) {
  const matches = [...markdown.matchAll(/^### 14\.(\d+)/gm)]
  if (matches.length === 0) return 1
  const maxValue = matches.reduce((max, match) => Math.max(max, Number(match[1] || 0)), 0)
  return maxValue + 1
}

function pruneSnapshotBlocks(markdown, keepLast = 2) {
  const headingRegex = /^### 14\.\d+ Capture Snapshot: .*$/gm
  const matches = [...markdown.matchAll(headingRegex)]
  if (matches.length === 0) return markdown

  const blocks = matches.map((match, index) => {
    const start = match.index
    const end = index + 1 < matches.length ? matches[index + 1].index : markdown.length
    const heading = match[0] || ''
    return {
      start,
      end,
      heading,
    }
  })

  if (blocks.length <= keepLast) return markdown

  const blocksToRemove = blocks
    .slice(0, blocks.length - keepLast)
    .sort((a, b) => b.start - a.start)

  let next = markdown
  for (const block of blocksToRemove) {
    const before = next.slice(0, block.start).replace(/[ \t]*\n*$/, '\n\n')
    const after = next.slice(block.end).replace(/^\n+/, '')
    next = `${before}${after}`
  }

  return next
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
  const ts = sanitizeCell(summary.captured_at_utc)
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
    `### 14.${snapshotNumber} Capture Snapshot: ${summary.capture_date || ts.slice(0, 10)} (Automated Audit Cycle)`,
    '',
    'What was captured:',
    `- Timestamp: ${ts}`,
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

export async function updateMasterPlanFromSummary(summary, options = {}) {
  const repoRoot = options.repoRoot || process.cwd()
  const relativePlanPath = options.planRelativePath || DEFAULT_PLAN_PATH
  const planPath = path.resolve(repoRoot, relativePlanPath)

  const raw = await fs.readFile(planPath, 'utf8')
  let markdown = raw

  const notes = sanitizeCell(summary.notes || summary.top_query_summary || 'Automated Supabase audit cycle update')
  const capturedAt = sanitizeCell(summary.captured_at_utc)
  const dateOnly = sanitizeCell(summary.capture_date || capturedAt.slice(0, 10))

  const metricsRow = `| ${dateOnly} (automated audit cycle) | - | - | - | - | - | - | - | - | ${notes} |`
  markdown = appendTableRowInSection(
    markdown,
    '## 5) Real-Time Metrics Log (Append Only)',
    '## 6) Change Log (What Was Updated in This Plan)',
    metricsRow,
  )
  markdown = pruneAutomatedRowsInSection(
    markdown,
    '## 5) Real-Time Metrics Log (Append Only)',
    '## 6) Change Log (What Was Updated in This Plan)',
    (line) => line.includes('(automated audit cycle)'),
    2,
  )

  const changeLogRow = `| ${dateOnly} | Copilot | Automated Supabase audit cycle appended run summary (${capturedAt}) and refreshed plan evidence block from generated audit artifacts. |`
  markdown = appendTableRowInSection(
    markdown,
    '## 6) Change Log (What Was Updated in This Plan)',
    '## 7) Update Protocol For Future Chats',
    changeLogRow,
  )
  markdown = pruneAutomatedRowsInSection(
    markdown,
    '## 6) Change Log (What Was Updated in This Plan)',
    '## 7) Update Protocol For Future Chats',
    (line) => line.includes('Automated Supabase audit cycle appended run summary'),
    2,
  )

  const nextSnapshot = getNextSnapshotNumber(markdown)
  const snapshotBlock = buildSnapshotBlock(summary, nextSnapshot)
  markdown = `${markdown.trimEnd()}\n\n${snapshotBlock}`
  markdown = pruneSnapshotBlocks(markdown, 2)

  await fs.writeFile(planPath, markdown, 'utf8')

  return {
    planPath,
    snapshotNumber: nextSnapshot,
  }
}

export default updateMasterPlanFromSummary
