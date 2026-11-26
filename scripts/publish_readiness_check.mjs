// Publish Readiness Verifier
//
// Read-only proof layer for the repository publication workflow. This is not
// a new authority and not a classifier. It consumes existing repository-native
// evidence, especially:
//   - docs/shared/evidence/repo_change_impact_report.json
//   - docs/shared/evidence/repo_health_audit_report.json
//   - docs/shared/evidence/publication_readiness_disposition.json
//   - docs/shared/reference/DB_CHANGE_LEDGER.md
//
// It never edits files and never runs git mutation commands. It answers one
// question: is the current local work ready to proceed to publication, or are
// there unresolved repository obligations that still need routing/evidence?

import { execFileSync, execSync } from 'child_process'
import crypto from 'crypto'
import { readFileSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = process.cwd()
const IMPACT_REPORT_PATH = path.resolve(ROOT, 'docs/shared/evidence/repo_change_impact_report.json')
const HEALTH_REPORT_PATH = path.resolve(ROOT, 'docs/shared/evidence/repo_health_audit_report.json')
const DISPOSITION_PATH = path.resolve(ROOT, 'docs/shared/evidence/publication_readiness_disposition.json')
const DB_LEDGER_PATH = path.resolve(ROOT, 'docs/shared/reference/DB_CHANGE_LEDGER.md')

// Repository-owned outputs rewritten by the publication validation pipeline
// (docs:validate, docs:validate:health, docs:impact). They must not invalidate
// readiness when they are the only working-tree delta after validation runs.
const PUBLICATION_PIPELINE_ARTIFACTS = new Set([
  'docs/shared/evidence/repo_change_impact_report.json',
  'docs/shared/evidence/repo_health_audit_report.json',
  'docs/Implementation_plans/retention_validation_report.json',
])

const READINESS_DISPOSITION_EVIDENCE = new Set([
  'docs/shared/evidence/publication_readiness_disposition.json',
  'docs/shared/evidence/PUBLICATION_READINESS_DISPOSITION_2026-06-30.md',
])

function rel(abs) {
  return path.relative(ROOT, abs).replace(/\\/g, '/')
}

async function readJson(absPath) {
  try {
    return JSON.parse(await fs.readFile(absPath, 'utf8'))
  } catch (error) {
    return { __read_error: error?.message || String(error) }
  }
}

async function readText(absPath) {
  try {
    return await fs.readFile(absPath, 'utf8')
  } catch {
    return ''
  }
}

function getGitChanges() {
  const raw = execSync('git status --porcelain --untracked-files=all', { cwd: ROOT, encoding: 'utf8' })
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      let body = line.slice(3)
      if (body.includes(' -> ')) body = body.split(' -> ')[1]
      return body
    })
    .sort()
}

function gitOut(cmd) {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

// Publication state: where HEAD sits relative to its upstream. The outgoing set is
// always merge-base..HEAD, so remote-only commits of a diverged upstream never count.
function getPublicationState() {
  try {
    const upstream = gitOut('rev-parse --abbrev-ref --symbolic-full-name @{u}')
    if (!upstream) return { upstream: null }
    const [behind, ahead] = gitOut(`rev-list --left-right --count ${upstream}...HEAD`).split(/\s+/).map(Number)
    return {
      upstream,
      ahead,
      behind,
      head_sha: gitOut('rev-parse HEAD'),
      merge_base_sha: gitOut(`merge-base ${upstream} HEAD`),
    }
  } catch {
    return { upstream: null }
  }
}

function getUnpushedCommitFiles() {
  const state = getPublicationState()
  if (!state.upstream) return []
  try {
    const raw = gitOut(`diff --name-only ${state.merge_base_sha}..HEAD --`)
    return raw.split('\n').filter((line) => line.length > 0).sort()
  } catch {
    return []
  }
}

function sameSet(a, b) {
  if (a.length !== b.length) return false
  return a.every((item, idx) => item === b[idx])
}

function comparableImpactFiles(files) {
  return files.filter((file) => file !== 'docs/shared/evidence/repo_change_impact_report.json').sort()
}

function isPublicationPipelineArtifact(filePath) {
  return PUBLICATION_PIPELINE_ARTIFACTS.has(filePath)
}

function isPipelineArtifactOnlyWorkingTreeDelta(workingTreeFiles) {
  return (
    workingTreeFiles.length > 0 &&
    workingTreeFiles.every((file) => PUBLICATION_PIPELINE_ARTIFACTS.has(file))
  )
}

function resolveReadinessScope(workingTreeFiles, unpushedCommitFiles, disposition) {
  const fromUnpushed = publishableChangeSetFiles(
    comparableImpactFiles(unpushedCommitFiles),
    disposition,
  )
  const substantiveWorkingTree = comparableImpactFiles(workingTreeFiles)
  const fromWorkingTree = publishableChangeSetFiles(substantiveWorkingTree, disposition)
  const unpushedSet = new Set(comparableImpactFiles(unpushedCommitFiles))

  const dispositionEvidenceOnly =
    substantiveWorkingTree.length > 0 &&
    substantiveWorkingTree.every((file) => READINESS_DISPOSITION_EVIDENCE.has(file))

  const unpushedStackRefresh =
    substantiveWorkingTree.length > 0 &&
    substantiveWorkingTree.every((file) => unpushedSet.has(file)) &&
    fromUnpushed.length > fromWorkingTree.length

  const useUnpushed =
    fromUnpushed.length > 0 &&
    (substantiveWorkingTree.length === 0 ||
      isPipelineArtifactOnlyWorkingTreeDelta(workingTreeFiles) ||
      dispositionEvidenceOnly ||
      unpushedStackRefresh)

  const usePublishedBaseline =
    fromUnpushed.length === 0 &&
    isPipelineArtifactOnlyWorkingTreeDelta(workingTreeFiles) &&
    !disposition.__read_error &&
    Array.isArray(disposition.change_set_files) &&
    disposition.change_set_files.length > 0

  if (usePublishedBaseline) {
    return {
      files: publishableChangeSetFiles([...disposition.change_set_files], disposition),
      scope: 'published baseline',
    }
  }

  if (useUnpushed) {
    return { files: fromUnpushed, scope: 'unpushed commits' }
  }
  if (fromWorkingTree.length > 0) {
    return { files: fromWorkingTree, scope: 'working tree' }
  }
  return { files: fromUnpushed, scope: 'unpushed commits' }
}

function impactModeAccepted(mode, readinessScope) {
  if (mode === 'pending_working_tree_changes') return readinessScope === 'working tree'
  if (readinessScope === 'published baseline') return mode === 'incoming_commit_range'
  return readinessScope === 'unpushed commits' && mode === 'incoming_commit_range'
}

function skipImpactFileSetComparison(readinessScope) {
  return readinessScope === 'published baseline'
}

function add(list, severity, area, message, nextAction, evidence = null) {
  list.push({ severity, area, message, next_action: nextAction, evidence })
}

function timestampPrefix(filePath) {
  const match = path.basename(filePath).match(/^(\d{14})_/)
  return match ? match[1] : null
}

// Exported so scripts/repo_health_audit.mjs reuses the exact ledger matching rule.
export function findLedgerRowsForFile(ledgerText, filePath) {
  const fileName = path.basename(filePath)
  const prefix = timestampPrefix(filePath)

  return ledgerText.split('\n').filter((line) => {
    if (!line.startsWith('|')) return false
    const cells = line.split('|').map((cell) => cell.trim())
    const migrationFile = cells[5] || ''
    if (migrationFile.includes(fileName)) return true
    if (prefix && migrationFile.includes(prefix)) return true
    return false
  })
}

function extractLedgerStatus(row) {
  const cells = row.split('|').map((cell) => cell.trim())
  return cells[8] || ''
}

function extractLedgerId(row) {
  const cells = row.split('|').map((cell) => cell.trim())
  return cells[1] || ''
}

// Review evidence is bound to the content that was reviewed, not only to file names or a commit SHA:
// the fingerprint covers each listed file's git blob, so recording the review (which edits only the
// disposition) does not change it, while any later edit to a reviewed file invalidates the review.
export function reviewContentFingerprint(files) {
  const lines = [...files]
    .filter((file) => !READINESS_DISPOSITION_EVIDENCE.has(file) && !PUBLICATION_PIPELINE_ARTIFACTS.has(file))
    .sort()
    .map((file) => {
      let blob = 'absent'
      try {
        blob = execFileSync('git', ['hash-object', '--', file], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      } catch {
        // deleted file
      }
      return `${file} ${blob}`
    })
  return crypto.createHash('sha256').update(lines.join('\n')).digest('hex')
}

// Risk-based approval (TRANSACTION_FRAMEWORK.md, "Review and approval by risk"). Routine changes publish on
// technical validation. Only the paths below also need a recorded approval: a completed independent review,
// or the user's explicit approval. The two are labelled differently and neither is inferred.
const HIGH_RISK_RULES = [
  [/^supabase\/migrations\/|^scripts\/.*\.sql$/, 'database change'],
  [/^supabase\/functions\//, 'server function with elevated access'],
  [/^(\.github\/workflows\/|vercel\.json$|supabase\/config\.toml$)/, 'deployment configuration'],
  [/^(\.instructions\.md$|scripts\/(git-safe-publish\.sh|publish_readiness_check\.mjs|repo_change_impact\.mjs)$)/, 'publication safeguard or agent authority'],
  [/^(src|mobile\/src)\/.*(auth|rbac|permission|access|bank|settings)/i, 'security or authorization code'],
  [/^(src|mobile\/src)\/.*(account|payroll|payment|settlement|voucher|billing|busy|revenue|invoice)/i, 'financial or accounting code'],
]
const APPROVAL_STATUSES = new Set(['completed', 'user_approved'])

export function riskReason(filePath) {
  const rule = HIGH_RISK_RULES.find(([pattern]) => pattern.test(filePath))
  return rule ? rule[1] : null
}

// An approval names who approved and on what basis, lists the file, and carries the fingerprint of the
// content approved, so a later edit makes it stale.
function approvalProblem(disposition, filePath) {
  const entries = (disposition.reviews || []).filter(
    (entry) => APPROVAL_STATUSES.has(entry.status) && entry.reviewer && entry.outcome && Array.isArray(entry.files) && entry.files.includes(filePath),
  )
  if (entries.length === 0) return 'no recorded approval covers it'
  const current = entries.some((entry) => entry.reviewed_content_sha256 && entry.reviewed_content_sha256 === reviewContentFingerprint(entry.files))
  return current ? null : 'approval is stale or has no reviewed_content_sha256'
}

// The metadata snapshot and manifest are verified directly: the manifest hash must match the snapshot.
const METADATA_PAIR = new Set(['supabase/backups/full_metadata.sql', 'supabase/evidence/authoritative_metadata_manifest.json'])
function metadataSnapshotMatchesManifest() {
  try {
    const manifest = JSON.parse(readFileSync(path.resolve(ROOT, 'supabase/evidence/authoritative_metadata_manifest.json'), 'utf8'))
    const snapshot = readFileSync(path.resolve(ROOT, 'supabase/backups/full_metadata.sql'))
    return manifest.sha256 === crypto.createHash('sha256').update(snapshot).digest('hex')
  } catch {
    return false
  }
}

const LEDGER_STATUSES = new Set(['PROPOSED', 'APPROVED', 'APPLIED', 'VERIFIED', 'DROPPED', 'ROLLED_BACK'])

function generatedArtifactConfirmed(disposition, filePath) {
  return (disposition.generated_artifacts || []).some(
    (entry) => entry.path === filePath && entry.generator_command && entry.regenerated_at_utc,
  )
}

function ledgerRowId(row) {
  return String(row).split('|').map((c) => c.trim()).find((c) => /^DBL-\d+/.test(c)) || '(unidentified row)'
}

function dbChangeDeferred(disposition, filePath) {
  return (disposition.deferred_db_changes || []).some(
    (entry) =>
      Array.isArray(entry.paths) &&
      entry.paths.includes(filePath) &&
      entry.reason &&
      entry.deferred_from_publication === true,
  )
}

function deferredPublicationPaths(disposition) {
  if (!disposition || disposition.__read_error) return []
  return [
    ...new Set(
      (disposition.deferred_db_changes || [])
        .filter((entry) => entry.deferred_from_publication === true && entry.reason)
        .flatMap((entry) => entry.paths || []),
    ),
  ].sort()
}

function publishableChangeSetFiles(files, disposition) {
  const deferred = new Set(deferredPublicationPaths(disposition))
  return files.filter((file) => !deferred.has(file)).sort()
}

function impactFilesInReadinessScope(impactFiles, readinessScope, unpushedCommitFiles, comparableReadinessFiles) {
  if (readinessScope === 'working tree') return impactFiles
  const allowed = new Set([
    ...unpushedCommitFiles,
    ...comparableReadinessFiles,
    ...PUBLICATION_PIPELINE_ARTIFACTS,
  ])
  return impactFiles.filter((file) => allowed.has(file.path))
}

function unknownFilesInReadinessScope(unknownFiles, readinessScope, unpushedCommitFiles, comparableReadinessFiles) {
  if (readinessScope === 'working tree') return unknownFiles
  const allowed = new Set([
    ...unpushedCommitFiles,
    ...comparableReadinessFiles,
    ...PUBLICATION_PIPELINE_ARTIFACTS,
  ])
  return unknownFiles.filter((file) => allowed.has(file))
}

async function main() {
  // `--review-fingerprint <category>`: print the value a reviewer records for the files listed in that review.
  const fpIndex = process.argv.indexOf('--review-fingerprint')
  if (fpIndex !== -1) {
    const category = process.argv[fpIndex + 1]
    const current = await readJson(DISPOSITION_PATH)
    const entry = (current.reviews || []).find((item) => item.category === category)
    if (!entry || !Array.isArray(entry.files) || entry.files.length === 0) {
      console.error(`No review entry with files for category "${category}" in ${rel(DISPOSITION_PATH)}.`)
      process.exitCode = 1
      return
    }
    console.log(reviewContentFingerprint(entry.files))
    return
  }

  const blockers = []
  const advisories = []
  const obligations = {
    database: [],
    generated_artifacts: [],
    validation: [],
    practical_verification: [],
    self_heal_routing: [],
  }

  const impact = await readJson(IMPACT_REPORT_PATH)
  const health = await readJson(HEALTH_REPORT_PATH)
  const disposition = await readJson(DISPOSITION_PATH)
  const ledgerText = await readText(DB_LEDGER_PATH)
  const workingTreeFiles = getGitChanges()
  const unpushedCommitFiles = getUnpushedCommitFiles()
  const { files: comparableReadinessFiles, scope: readinessScope } = resolveReadinessScope(
    workingTreeFiles,
    unpushedCommitFiles,
    disposition,
  )
  const pubState = getPublicationState()
  if (pubState.upstream && pubState.behind > 0) {
    add(
      blockers,
      'BLOCKER',
      'publication_state',
      `Local branch is ${pubState.behind} commit(s) behind ${pubState.upstream}${pubState.ahead > 0 ? ` and ${pubState.ahead} ahead (diverged)` : ''}.`,
      'Integrate upstream (git-safe-publish.sh uses pull --rebase), then regenerate range-mode impact and rerun `npm run publish:ready`. Only merge-base..HEAD is assessed as outgoing.',
      pubState,
    )
  }
  {
    const substantiveTree = comparableImpactFiles(workingTreeFiles).filter(
      (file) => !PUBLICATION_PIPELINE_ARTIFACTS.has(file) && !READINESS_DISPOSITION_EVIDENCE.has(file),
    )
    if (pubState.upstream && pubState.ahead > 0 && substantiveTree.length > 0) {
      add(
        blockers,
        'BLOCKER',
        'publication_state',
        'Uncommitted working-tree changes coexist with unpushed commits; the outgoing set cannot be assessed as one change set.',
        'Commit or stash the working-tree changes, then regenerate range-mode impact and rerun `npm run publish:ready`.',
        { uncommitted_files: substantiveTree },
      )
    }
  }
  if (readinessScope === 'unpushed commits' && !impact.__read_error && impact.mode === 'incoming_commit_range') {
    const resolved = impact.commit_range_resolved
    if (!resolved || resolved.head_sha !== pubState.head_sha || resolved.merge_base_sha !== pubState.merge_base_sha) {
      add(
        blockers,
        'BLOCKER',
        'impact',
        'Impact report was not generated for the current HEAD and merge-base (stale or missing resolved SHAs).',
        'Run `node scripts/repo_change_impact.mjs --range "<upstream>..HEAD"` and rerun `npm run publish:ready`.',
        { report: resolved || null, current: { head_sha: pubState.head_sha, merge_base_sha: pubState.merge_base_sha } },
      )
    }
  }

  if (impact.__read_error) {
    add(blockers, 'BLOCKER', 'impact', `Cannot read ${rel(IMPACT_REPORT_PATH)}: ${impact.__read_error}`, 'Run `npm run docs:impact` and inspect the generated report.')
  } else if (!impactModeAccepted(impact.mode, readinessScope)) {
    add(
      blockers,
      'BLOCKER',
      'impact',
      `Impact report mode is ${impact.mode || '(missing)'}, not accepted for ${readinessScope}.`,
      'Run `npm run docs:impact` immediately before `npm run publish:ready`. When the substantive working tree is clean and unpushed commits exist, git-safe-publish may refresh impact via `--range @{u}..HEAD`.',
    )
  } else if (skipImpactFileSetComparison(readinessScope)) {
    // Pipeline validation artifacts may refresh without changing the publishable stack.
  } else {
    const reportedFiles = (impact.files || []).map((file) => file.path).sort()
    const comparableReportedFiles = publishableChangeSetFiles(
      comparableImpactFiles(reportedFiles),
      disposition,
    )
    if (!sameSet(comparableReadinessFiles, comparableReportedFiles)) {
      add(
        blockers,
        'BLOCKER',
        'impact',
        `Impact report does not match the current ${readinessScope} file set.`,
        'Run `npm run docs:impact` again, then rerun `npm run publish:ready`.',
        {
          readiness_scope: readinessScope,
          current_files: comparableReadinessFiles,
          impact_report_files: comparableReportedFiles,
        },
      )
    }
  }

  if (!impact.__read_error && impactModeAccepted(impact.mode, readinessScope)) {
    const scopedImpactFiles = impactFilesInReadinessScope(
      impact.files || [],
      readinessScope,
      unpushedCommitFiles,
      comparableReadinessFiles,
    )
    const categories = impact.categories_present || []
    const categoryByName = new Map(categories.map((cat) => [cat.category, cat]))
    const unknown = unknownFilesInReadinessScope(
      impact.unknown_or_unmapped_files || [],
      readinessScope,
      unpushedCommitFiles,
      comparableReadinessFiles,
    )
    const files = scopedImpactFiles

    if (unknown.length > 0) {
      add(
        blockers,
        'BLOCKER',
        'self-heal/routing',
        `${unknown.length} file(s) are unknown/unmapped.`,
        'Classify each path via the New File Decision Tree or update the existing impact classifier routing, then rerun `npm run docs:impact`.',
        unknown,
      )
      obligations.self_heal_routing.push(...unknown.map((file) => ({ file, obligation: 'classify unmapped path before publication' })))
    }

    for (const category of categories) {
      const scopedCategoryFiles = (category.files || []).filter((filePath) =>
        files.some((file) => file.path === filePath),
      )
      if (scopedCategoryFiles.length === 0) continue

      for (const command of category.required_validation || []) {
        obligations.validation.push({ category: category.category, command })
      }
      if (category.practical_verification && category.practical_verification !== 'Not applicable unless the doc is itself a script/contract/prompt (then use the repository_authority verification instead).') {
        obligations.practical_verification.push({ category: category.category, expected: category.practical_verification })
      }
    }

    const unapproved = new Map()
    for (const file of files) {
      const reason = riskReason(file.path)
      if (!reason) continue
      const problem = disposition.__read_error ? `cannot read the disposition: ${disposition.__read_error}` : approvalProblem(disposition, file.path)
      if (!problem) continue
      const key = `${reason}: ${problem}`
      unapproved.set(key, [...(unapproved.get(key) || []), file.path])
    }
    for (const [key, paths] of unapproved) {
      add(
        blockers,
        'BLOCKER',
        'approval',
        `High-risk change needs approval (${key}) for ${paths.length} file(s): ${paths.join(', ')}.`,
        'Record an independent review or the user\'s explicit approval in docs/shared/evidence/publication_readiness_disposition.json (TRANSACTION_FRAMEWORK.md, Review and approval by risk).',
        paths,
      )
    }

    const dbFiles = files
      .filter((file) => file.category === 'database_schema_truth' || /^supabase\/migrations\//.test(file.path))
      .map((file) => file.path)
    for (const filePath of dbFiles) {
      const rows = findLedgerRowsForFile(ledgerText, filePath)
      const isChangeControl = /^supabase\/(migrations|sql_checks|exec_success_migrations)\//.test(filePath) || (/^scripts\//.test(filePath) && filePath.endsWith('.sql'))
      const deferred = dbChangeDeferred(disposition, filePath)

      if (deferred) {
        obligations.database.push({ file: filePath, ledger_rows_found: rows.length, deferred_from_publication: true })
        add(
          advisories,
          'ADVISORY',
          'database',
          `${filePath} is explicitly deferred from this publication batch.`,
          'git-safe-publish.sh unstages these paths before commit when listed in publication_readiness_disposition.json; keep them locally until DB_CHANGE_PROTOCOL.md operator/reviewer evidence completes.',
          (disposition.deferred_db_changes || []).find((entry) => entry.paths?.includes(filePath)),
        )
        continue
      }

      if (isChangeControl && rows.length === 0) {
        add(blockers, 'BLOCKER', 'database', `No DB ledger row found for ${filePath}.`, 'Add/update the DB ledger row required by DB_CHANGE_PROTOCOL.md, then rerun `npm run docs:impact` and `npm run publish:ready`.')
      }
      for (const row of rows) {
        // An unapplied migration may be published when its ledger status says so truthfully; publication
        // never applies it. Only a missing or unrecognised status blocks.
        const status = extractLedgerStatus(row)
        if (isChangeControl && !LEDGER_STATUSES.has(status)) {
          add(blockers, 'BLOCKER', 'database', `DB ledger row ${ledgerRowId(row)} for ${filePath} has no recognised status (found "${status}").`, 'Set the truthful lifecycle status defined in DB_CHANGE_LEDGER.md.')
        } else if (isChangeControl && !['VERIFIED', 'DROPPED', 'ROLLED_BACK'].includes(status)) {
          add(advisories, 'ADVISORY', 'database', `${filePath}: ledger ${ledgerRowId(row)} is ${status}. Publishing the file does not apply it.`, 'Apply and verify only under DB_CHANGE_PROTOCOL.md with explicit authorization.')
        }
      }
      obligations.database.push({ file: filePath, ledger_rows_found: rows.length })
    }

    const generated = categoryByName.get('generated_artifact')
    if (generated) {
      for (const filePath of (generated.files || []).filter((filePath) =>
        files.some((file) => file.path === filePath),
      )) {
        if (isPublicationPipelineArtifact(filePath)) {
          continue
        }
        if (METADATA_PAIR.has(filePath) && metadataSnapshotMatchesManifest()) {
          continue
        }
        if (!METADATA_PAIR.has(filePath) && generatedArtifactConfirmed(disposition, filePath)) {
          continue
        }
        add(
          blockers,
          'BLOCKER',
          'generated-artifact',
          `${filePath} is a generated artifact in the pending change set.`,
          'Confirm it was regenerated by its owning command and rerun validation; do not publish hand-edited generated artifacts.',
        )
        obligations.generated_artifacts.push({ file: filePath, obligation: 'regenerate/validate generated artifact provenance' })
      }
    }

    if (
      impact.independent_review_recommended_before_publication &&
      scopedImpactFiles.some((file) => file.category !== 'generated_artifact' || !isPublicationPipelineArtifact(file.path))
    ) {
      obligations.self_heal_routing.push({ obligation: 'independent review recommended by impact report; record disposition before publication' })
    }
  }

  if (health.__read_error) {
    add(advisories, 'ADVISORY', 'health', `Cannot read ${rel(HEALTH_REPORT_PATH)}: ${health.__read_error}`, 'Run `npm run docs:validate:health` to refresh the advisory health report.')
  } else if (health.total_issues > 0) {
    add(
      advisories,
      'ADVISORY',
      'health',
      `Health report contains ${health.total_issues} advisory issue(s).`,
      'Route actionable health findings per SYNC_PROTOCOL.md. These do not block publish unless separately surfaced as impact blockers.',
      health.checks,
    )
  }

  const validationCommands = [...new Set(obligations.validation.map((item) => item.command))]
  const ready = blockers.length === 0

  const result = {
    status: ready ? 'READY' : 'NOT READY',
    read_only: true,
    blockers,
    advisories,
    obligations: {
      ...obligations,
      validation_commands: validationCommands,
    },
    next_action: ready
      ? 'Proceed with `npm run publish:safe`; it will still run its normal validation, intake, rebase, and push protections.'
      : 'Resolve the blockers above, rerun `npm run docs:impact`, then rerun `npm run publish:ready`.',
  }

  console.log(`Publish Readiness: ${result.status}`)
  console.log(`Read-only: yes`)

  if (blockers.length > 0) {
    console.log('\nUnresolved blockers:')
    blockers.forEach((blocker, idx) => {
      console.log(`${idx + 1}. [${blocker.area}] ${blocker.message}`)
      console.log(`   Next action: ${blocker.next_action}`)
    })
  } else {
    console.log('\nNo unresolved blockers.')
  }

  if (advisories.length > 0) {
    console.log('\nAdvisory issues:')
    advisories.forEach((advisory, idx) => {
      console.log(`${idx + 1}. [${advisory.area}] ${advisory.message}`)
      console.log(`   Next action: ${advisory.next_action}`)
    })
  }

  console.log('\nValidation obligations:')
  if (validationCommands.length === 0) {
    console.log('- none')
  } else {
    for (const command of validationCommands) console.log(`- ${command}`)
  }

  console.log(`\nNext action: ${result.next_action}`)

  process.exitCode = ready ? 0 : 1
}

// Run only when executed directly (npm run publish:ready), not when imported for findLedgerRowsForFile.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || error)
    process.exitCode = 1
  })
}
