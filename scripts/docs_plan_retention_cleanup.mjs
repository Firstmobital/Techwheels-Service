import fs from 'fs/promises'
import path from 'path'
import {
  pruneSnapshotBlocks,
  pruneTableRowsInSection,
  resolvePlanPath,
} from './lib/plan_retention_policy.mjs'

const ROOT = process.cwd()
const ACTIVE_ROOT = resolvePlanPath(ROOT, 'docs/Implementation_plans')

const METRICS_SECTION_HEADER = '## 5) Real-Time Metrics Log (Append Only)'
const CHANGELOG_SECTION_HEADER = '## 6) Change Log (What Was Updated in This Plan)'
const UPDATE_PROTOCOL_SECTION_HEADER = '## 7) Update Protocol For Future Chats'
const SNAPSHOT_HEADING_REGEX = /^### 14\.\d+ Capture Snapshot: .*$/gm

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

function rel(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/')
}

async function applyCleanup(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  let markdown = raw

  markdown = pruneTableRowsInSection(
    markdown,
    METRICS_SECTION_HEADER,
    CHANGELOG_SECTION_HEADER,
    (line) => line.includes('(automated audit cycle)'),
    2,
  )

  markdown = pruneTableRowsInSection(
    markdown,
    CHANGELOG_SECTION_HEADER,
    UPDATE_PROTOCOL_SECTION_HEADER,
    (line) => line.includes('Automated Supabase audit cycle appended run summary'),
    2,
  )

  markdown = pruneSnapshotBlocks(markdown, SNAPSHOT_HEADING_REGEX, 2)

  if (markdown !== raw) {
    await fs.writeFile(filePath, markdown, 'utf8')
    return true
  }

  return false
}

async function main() {
  const files = await walk(ACTIVE_ROOT)
  const changed = []

  for (const filePath of files) {
    const didChange = await applyCleanup(filePath)
    if (didChange) changed.push(rel(filePath))
  }

  console.log(`Retention cleanup complete. Scanned ${files.length} active plan file(s); updated ${changed.length} file(s).`)
  if (changed.length > 0) {
    console.log('Updated files:')
    for (const item of changed) {
      console.log(`- ${item}`)
    }
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
