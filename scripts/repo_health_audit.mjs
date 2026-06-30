// Repository Health Auditor
//
// Advisory validator only. It is NOT a source of truth, NOT a governance
// document, and NOT a repository intelligence document. It checks whether
// the repository still follows rules already defined in .instructions.md,
// docs/STRUCTURE_GUIDE.md, docs/shared/reference/SYNC_PROTOCOL.md, and
// docs/shared/reference/DATABASE_TRUTH.md.
//
// It produces a report only. It never modifies any file other than writing
// its own report JSON to docs/shared/evidence/. It never scans
// local_folder/backups/full_database.sql or its chunk mirror (too large,
// out of scope per the rules it is checking).
//
// Each finding in its report is a Health Finding artifact (see Artifact
// Types in docs/shared/reference/SYNC_PROTOCOL.md) and routes per its own
// nature using that file's Classification table — this script does not
// define its own routing.

import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const ROOT = process.cwd()
const REPORT_PATH = path.resolve(ROOT, 'docs/shared/evidence/repo_health_audit_report.json')

const EXCLUDED_DIR_SEGMENTS = [
  'node_modules',
  '.git',
  'dist',
  'dist-ssr',
  'dist-android-local-check',
  'dist-android-local-check-2',
  'local_folder', // includes /Reference (archived other-repo content) and /backups (huge dumps) — out of scope by design
]

const ROOT_ALLOWED_DOC_FILES = new Set(['README.md', 'CONTRIBUTING.md', '.instructions.md'])
const DOC_LIKE_EXTENSIONS = new Set(['.md', '.txt', '.sql', '.guide', '.audit', '.notes', '.log'])

const DOCS_ROOT_ALLOWED = (name) =>
  ['README.md', 'MASTER_INDEX.md', 'STRUCTURE_GUIDE.md', 'DOCS_IMPACT_MATRIX.md', 'db-changes.md', 'agent-change-log.md'].includes(name) ||
  /^DOCS_DEDUP_CONFLICT_MATRIX_.*\.md$/.test(name)

const VENDOR_AI_FILES = ['CLAUDE.md', 'CURSOR.md', 'copilot-instructions.md', 'GEMINI.md', 'CODEX.md']
const VENDOR_AI_PATH_SUFFIXES = ['.cursor/rules']

function rel(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/')
}

function isExcluded(absPath) {
  const relPath = rel(absPath)
  return EXCLUDED_DIR_SEGMENTS.some((seg) => relPath === seg || relPath.startsWith(`${seg}/`) || relPath.includes(`/${seg}/`))
}

async function walk(dir, { filterExt } = {}) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out = []
  for (const entry of entries) {
    const abs = path.join(dir, entry.name)
    if (isExcluded(abs)) continue
    if (entry.isDirectory()) {
      out.push(...(await walk(abs, { filterExt })))
      continue
    }
    if (filterExt && !filterExt.has(path.extname(entry.name))) continue
    out.push(abs)
  }
  return out
}

// ---------------------------------------------------------------------------
// Governance doc set (the only scope for link/contradiction checks — kept
// small and rule-based on purpose, per "high-value, low-cost" instruction).
// ---------------------------------------------------------------------------

async function listGovernanceDocs() {
  const docs = []

  for (const name of ['.instructions.md', 'README.md', 'CONTRIBUTING.md']) {
    const abs = path.resolve(ROOT, name)
    if (await fs.access(abs).then(() => true).catch(() => false)) docs.push(abs)
  }

  const docsRoot = path.resolve(ROOT, 'docs')
  let docsRootEntries = []
  try {
    docsRootEntries = await fs.readdir(docsRoot, { withFileTypes: true })
  } catch {
    docsRootEntries = []
  }
  for (const entry of docsRootEntries) {
    if (entry.isFile() && entry.name.endsWith('.md')) docs.push(path.join(docsRoot, entry.name))
  }

  docs.push(...(await walk(path.resolve(ROOT, 'docs/shared/reference'), { filterExt: new Set(['.md']) })))
  docs.push(...(await walk(path.resolve(ROOT, 'docs/shared/runbooks'), { filterExt: new Set(['.md']) })))

  return [...new Set(docs)]
}

// ---------------------------------------------------------------------------
// Check 1 + 2: broken markdown links / stale references to moved docs
// ---------------------------------------------------------------------------

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g

async function buildBasenameIndex() {
  const allFiles = await walk(ROOT)
  const index = new Map()
  for (const abs of allFiles) {
    const base = path.basename(abs)
    if (!index.has(base)) index.set(base, [])
    index.get(base).push(rel(abs))
  }
  return index
}

async function checkBrokenLinks(governanceDocs, basenameIndex) {
  const broken = []
  for (const docPath of governanceDocs) {
    const content = await fs.readFile(docPath, 'utf8')
    const base = path.dirname(docPath)
    let match
    while ((match = LINK_RE.exec(content)) !== null) {
      const target = match[1].trim()
      if (!target || target.startsWith('http://') || target.startsWith('https://') || target.startsWith('mailto:') || target.startsWith('#')) continue
      const targetClean = target.split('#')[0]
      if (!targetClean) continue
      const resolved = path.normpath ? path.normpath(path.join(base, targetClean)) : path.normalize(path.join(base, targetClean))
      const exists = await fs.access(resolved).then(() => true).catch(() => false)
      if (!exists) {
        const candidates = basenameIndex.get(path.basename(targetClean)) || []
        broken.push({
          file: rel(docPath),
          link_target: target,
          resolved_path: rel(resolved),
          possible_moved_to: candidates.length === 1 ? candidates[0] : candidates.length > 1 ? candidates : null,
        })
      }
    }
  }
  return broken
}

// ---------------------------------------------------------------------------
// Check 3: root-level documentation violations
// ---------------------------------------------------------------------------

async function checkRootViolations() {
  const violations = []

  const repoRootEntries = await fs.readdir(ROOT, { withFileTypes: true })
  for (const entry of repoRootEntries) {
    if (!entry.isFile()) continue
    if (!DOC_LIKE_EXTENSIONS.has(path.extname(entry.name)) && entry.name !== '.instructions.md') continue
    if (ROOT_ALLOWED_DOC_FILES.has(entry.name)) continue
    violations.push({ scope: 'repo-root', file: entry.name, rule: 'STRUCTURE_GUIDE.md Section 2.0 — only README.md (and the AI contract .instructions.md / CONTRIBUTING.md) belong at repo root' })
  }

  const docsRoot = path.resolve(ROOT, 'docs')
  let docsRootEntries = []
  try {
    docsRootEntries = await fs.readdir(docsRoot, { withFileTypes: true })
  } catch {
    docsRootEntries = []
  }
  for (const entry of docsRootEntries) {
    if (!entry.isFile()) continue
    if (path.extname(entry.name) !== '.md') continue
    if (DOCS_ROOT_ALLOWED(entry.name)) continue
    violations.push({ scope: 'docs-root', file: `docs/${entry.name}`, rule: 'STRUCTURE_GUIDE.md Section 2.1 — docs/ root reserved for governance anchors only' })
  }

  return violations
}

// ---------------------------------------------------------------------------
// Check 4: vendor-specific AI instruction files in active repo
// ---------------------------------------------------------------------------

async function checkVendorAiFiles() {
  const found = []
  const allFiles = await walk(ROOT)
  for (const abs of allFiles) {
    const relPath = rel(abs)
    const name = path.basename(abs)
    if (VENDOR_AI_FILES.includes(name) || VENDOR_AI_PATH_SUFFIXES.some((s) => relPath.endsWith(s))) {
      found.push(relPath)
    }
  }
  return found
}

// ---------------------------------------------------------------------------
// Check 5: database truth hierarchy contradictions (lightweight heuristic)
// ---------------------------------------------------------------------------

async function checkDbHierarchyContradictions(governanceDocs) {
  const flags = []
  // Deliberately narrow: bare "authoritative" alone is too noisy, because
  // full_database.sql is legitimately authoritative within its own
  // (secondary/data) tier. Only flag language that claims top-level/primary
  // standing for full_database.sql without also naming full_metadata.sql.
  const authorityWords = /(\bprimary\b|top.?authority|top.?level authority|sole authority|source of truth)/i
  const negated = /(non.?authoritative|not authoritative)/i
  const removedFallback = /latest_remote_schema\.sql/

  for (const docPath of governanceDocs) {
    const content = await fs.readFile(docPath, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      if (
        line.includes('full_database.sql') &&
        authorityWords.test(line) &&
        !negated.test(line) &&
        !line.includes('full_metadata.sql') &&
        !line.includes('secondary')
      ) {
        flags.push({
          file: rel(docPath),
          line: idx + 1,
          excerpt: line.trim().slice(0, 200),
          reason: 'Mentions full_database.sql with an authority word but not full_metadata.sql/secondary on the same line — verify against DATABASE_TRUTH.md hierarchy (full_metadata.sql is primary).',
        })
      }
      if (removedFallback.test(line) && !rel(docPath).endsWith('DATABASE_TRUTH.md')) {
        flags.push({
          file: rel(docPath),
          line: idx + 1,
          excerpt: line.trim().slice(0, 200),
          reason: 'References latest_remote_schema.sql, a fallback file that does not exist in this repo — likely a stale hierarchy claim.',
        })
      }
    })
  }
  return flags
}

// ---------------------------------------------------------------------------
// Check 6: generated DB truth file manually edited (detectable case only)
// ---------------------------------------------------------------------------

async function checkGeneratedArtifactDrift() {
  const result = { checked: false, drifted: false, detail: null }
  const metadataPath = path.resolve(ROOT, 'supabase/backups/full_metadata.sql')
  const manifestPath = path.resolve(ROOT, 'supabase/evidence/authoritative_metadata_manifest.json')

  const metadataExists = await fs.access(metadataPath).then(() => true).catch(() => false)
  const manifestExists = await fs.access(manifestPath).then(() => true).catch(() => false)
  if (!metadataExists || !manifestExists) {
    result.detail = 'full_metadata.sql or its manifest not found — skipped.'
    return result
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
  const fileBuf = await fs.readFile(metadataPath)
  const actualSha256 = crypto.createHash('sha256').update(fileBuf).digest('hex')

  result.checked = true
  if (manifest.sha256 && manifest.sha256 !== actualSha256) {
    result.drifted = true
    result.detail = `supabase/backups/full_metadata.sql sha256 does not match supabase/evidence/authoritative_metadata_manifest.json. Either it was hand-edited or regenerated without an updated manifest. Re-run scripts/backup-metadata.sh; never hand-edit this file.`
  } else {
    result.detail = 'full_metadata.sql sha256 matches its manifest. No drift detected.'
  }

  // local_folder/backups/full_database.sql is intentionally NOT hashed here —
  // it is a large DB dump and out of scope for this lightweight auditor.
  return result
}

// ---------------------------------------------------------------------------
// Check 7: active implementation items marked Done/Verified but not promoted
// (best-effort, file-level, no heavy parsing)
// ---------------------------------------------------------------------------

async function checkPromotionGaps() {
  const planRoot = path.resolve(ROOT, 'docs/Implementation_plans')
  const allPlanFiles = await walk(planRoot, { filterExt: new Set(['.md']) })
  // Exclude docs/Implementation_plans/completed/** — its mirror-structure archive
  // roots (per completed/INDEX.md) reuse the "active" folder name to mean
  // "final active-plan authority files that are now archived," not a live,
  // pending-promotion plan. Without this exclusion, every file migrated into
  // the completed archive's categories/<category>/active/ mirror would be
  // mistaken for a live active plan and false-flagged as an unpromoted gap.
  const activeFiles = allPlanFiles.filter((p) => {
    const r = rel(p)
    return r.includes('/active/') && !r.startsWith('docs/Implementation_plans/completed/')
  })

  const flags = []
  const doneVerifiedRowRe = /\|.*(✓\s*Done|✅|Done\b).*(☑|Verified)/i

  for (const filePath of activeFiles) {
    const content = await fs.readFile(filePath, 'utf8')
    const lines = content.split('\n')
    const doneVerifiedCount = lines.filter((l) => l.startsWith('|') && doneVerifiedRowRe.test(l)).length
    if (doneVerifiedCount === 0) continue

    const mentionsPromotion = /promot(e|ed|ion)/i.test(content)
    if (!mentionsPromotion) {
      flags.push({
        file: rel(filePath),
        done_verified_rows_detected: doneVerifiedCount,
        note: 'File contains Done+Verified table row(s) but no mention of "promote/promoted/promotion" anywhere in the file. Verify manually against STRUCTURE_GUIDE.md Section 28 (promotion-before-removal contract) — this is a coarse, file-level signal, not row-level proof.',
      })
    }
  }
  return flags
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const governanceDocs = await listGovernanceDocs()
  const basenameIndex = await buildBasenameIndex()

  const brokenLinks = await checkBrokenLinks(governanceDocs, basenameIndex)
  const rootViolations = await checkRootViolations()
  const vendorAiFiles = await checkVendorAiFiles()
  const dbHierarchyFlags = await checkDbHierarchyContradictions(governanceDocs)
  const generatedArtifactDrift = await checkGeneratedArtifactDrift()
  const promotionGaps = await checkPromotionGaps()

  const totalIssues =
    brokenLinks.length +
    rootViolations.length +
    vendorAiFiles.length +
    dbHierarchyFlags.length +
    (generatedArtifactDrift.drifted ? 1 : 0) +
    promotionGaps.length

  const report = {
    generated_at_utc: new Date().toISOString(),
    advisory_only: true,
    governance_docs_scanned: governanceDocs.length,
    checks: {
      broken_or_stale_links: brokenLinks,
      root_level_doc_violations: rootViolations,
      vendor_ai_instruction_files: vendorAiFiles,
      db_hierarchy_contradiction_flags: dbHierarchyFlags,
      generated_artifact_drift: generatedArtifactDrift,
      promotion_gaps_best_effort: promotionGaps,
    },
    total_issues: totalIssues,
  }

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

  console.log(`Repository Health Audit (advisory only) — report only, no files modified.`)
  console.log(`Governance docs scanned: ${governanceDocs.length}`)
  console.log(`- Broken/stale links: ${brokenLinks.length}`)
  console.log(`- Root-level doc violations: ${rootViolations.length}`)
  console.log(`- Vendor-specific AI instruction files: ${vendorAiFiles.length}`)
  console.log(`- DB hierarchy contradiction flags: ${dbHierarchyFlags.length}`)
  console.log(`- Generated artifact drift: ${generatedArtifactDrift.drifted ? 'YES' : 'no'} (${generatedArtifactDrift.checked ? 'checked' : 'skipped'})`)
  console.log(`- Promotion gaps (best-effort): ${promotionGaps.length}`)
  console.log(`Full report: ${rel(REPORT_PATH)}`)

  if (totalIssues > 0) {
    console.log(`\n${totalIssues} issue(s) found. This is advisory only — nothing was changed automatically.`)
    process.exitCode = 1
  } else {
    console.log('\nNo issues found.')
  }
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
