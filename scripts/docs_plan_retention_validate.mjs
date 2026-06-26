import fs from 'fs/promises'
import path from 'path'

const ROOT = process.cwd()
const ACTIVE_ROOT = path.resolve(ROOT, 'docs/Implementation_plans')
const REPORT_PATH = path.resolve(ROOT, 'docs/Implementation_plans/retention_validation_report.json')

const SNAPSHOT_REGEX = /^### 14\.\d+ Capture Snapshot: .*$/gm
const AUTOMATED_METRICS_MARKER = '(automated audit cycle)'
const AUTOMATED_CHANGELOG_MARKER = 'Automated Supabase audit cycle appended run summary'

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const out = []

  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walk(abs)))
      continue
    }

    if (!entry.name.endsWith('.md')) continue
    if (!abs.includes(`${path.sep}active${path.sep}`)) continue
    out.push(abs)
  }

  return out
}

function countMatches(text, regex) {
  const matches = text.match(regex)
  return matches ? matches.length : 0
}

function countContains(lines, marker) {
  return lines.filter((line) => line.includes(marker) && line.startsWith('|')).length
}

function rel(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/')
}

async function main() {
  const files = await walk(ACTIVE_ROOT)
  const violations = []
  const scanned = []

  for (const filePath of files) {
    const raw = await fs.readFile(filePath, 'utf8')
    const lines = raw.split('\n')

    const metricsCount = countContains(lines, AUTOMATED_METRICS_MARKER)
    const changelogCount = countContains(lines, AUTOMATED_CHANGELOG_MARKER)
    const snapshotCount = countMatches(raw, SNAPSHOT_REGEX)

    const checks = {
      metrics_automated_rows: metricsCount,
      changelog_automated_rows: changelogCount,
      snapshot_blocks: snapshotCount,
    }

    scanned.push({ file: rel(filePath), checks })

    if (metricsCount > 2 || changelogCount > 2 || snapshotCount > 2) {
      violations.push({
        file: rel(filePath),
        checks,
        limits: {
          metrics_automated_rows: 2,
          changelog_automated_rows: 2,
          snapshot_blocks: 2,
        },
      })
    }
  }

  const report = {
    generated_at_utc: new Date().toISOString(),
    scanned_files: scanned.length,
    violations: violations.length,
    scanned,
    violation_details: violations,
  }

  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

  if (violations.length > 0) {
    console.error(`Retention validation failed with ${violations.length} violation(s). Report: ${rel(REPORT_PATH)}`)
    process.exitCode = 1
    return
  }

  console.log(`Retention validation passed. Scanned ${scanned.length} active plan file(s). Report: ${rel(REPORT_PATH)}`)
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
