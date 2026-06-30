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

import { execSync } from 'child_process'
import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

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

function getUnpushedCommitFiles() {
  try {
    const upstream = execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', { cwd: ROOT, encoding: 'utf8' }).trim()
    if (!upstream) return []
    const raw = execSync(`git diff --name-only ${upstream}..HEAD --`, { cwd: ROOT, encoding: 'utf8' })
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
  if (mode === 'pending_working_tree_changes') return true
  if (readinessScope === 'published baseline') return mode === 'incoming_commit_range'
  return readinessScope === 'unpushed commits' && mode === 'incoming_commit_range'
}

function skipImpactFileSetComparison(readinessScope) {
  return readinessScope === 'unpushed commits' || readinessScope === 'published baseline'
}

function fingerprintChangeSet(files) {
  return crypto.createHash('sha256').update(files.join('\n')).digest('hex')
}

function add(list, severity, area, message, nextAction, evidence = null) {
  list.push({ severity, area, message, next_action: nextAction, evidence })
}

function timestampPrefix(filePath) {
  const match = path.basename(filePath).match(/^(\d{14})_/)
  return match ? match[1] : null
}

function findLedgerRowsForFile(ledgerText, filePath) {
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

function reviewDispositionComplete(disposition, category) {
  return (disposition.reviews || []).some(
    (entry) => entry.category === category && entry.status === 'completed' && entry.outcome,
  )
}

function generatedArtifactConfirmed(disposition, filePath) {
  return (disposition.generated_artifacts || []).some(
    (entry) => entry.path === filePath && entry.generator_command && entry.regenerated_at_utc,
  )
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

function dispositionMatchesChangeSet(disposition, comparableFiles) {
  if (!disposition || disposition.__read_error) return false
  if (!Array.isArray(disposition.change_set_files)) return false
  return sameSet([...disposition.change_set_files].sort(), comparableFiles)
}

async function main() {
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
  const dispositionReady = dispositionMatchesChangeSet(disposition, comparableReadinessFiles)

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

  if (disposition.__read_error) {
    add(
      blockers,
      'BLOCKER',
      'review',
      `Cannot read ${rel(DISPOSITION_PATH)}: ${disposition.__read_error}`,
      'Create/update the publication readiness disposition evidence required by SYNC_PROTOCOL.md Evidence routing and TRANSACTION_FRAMEWORK.md Stage 5.',
    )
  } else if (!dispositionReady) {
    add(
      blockers,
      'BLOCKER',
      'review',
      'Publication readiness disposition does not match the current change set.',
      'Update docs/shared/evidence/publication_readiness_disposition.json so change_set_files matches the pending files, then rerun `npm run publish:ready`.',
      {
        expected_fingerprint: fingerprintChangeSet(comparableReadinessFiles),
        disposition_files: disposition.change_set_files || [],
      },
    )
  }

  if (!impact.__read_error && impactModeAccepted(impact.mode, readinessScope)) {
    const categories = impact.categories_present || []
    const categoryByName = new Map(categories.map((cat) => [cat.category, cat]))
    const unknown = impact.unknown_or_unmapped_files || []
    const files = impact.files || []

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
      if (category.review_recommended) {
        if (dispositionReady && reviewDispositionComplete(disposition, category.category)) {
          continue
        }
        add(
          blockers,
          'BLOCKER',
          'review',
          `${category.label} requires independent review before publication.`,
          `Complete and record the review/routing expected by ${category.owning_authority}, then rerun \`npm run docs:impact\` and \`npm run publish:ready\`.`,
          category.files,
        )
      }

      for (const command of category.required_validation || []) {
        obligations.validation.push({ category: category.category, command })
      }
      if (category.practical_verification && category.practical_verification !== 'Not applicable unless the doc is itself a script/contract/prompt (then use the repository_authority verification instead).') {
        obligations.practical_verification.push({ category: category.category, expected: category.practical_verification })
      }
    }

    const dbFiles = files.filter((file) => file.category === 'database_schema_truth').map((file) => file.path)
    for (const filePath of dbFiles) {
      const rows = findLedgerRowsForFile(ledgerText, filePath)
      const isChangeControl = /^supabase\/(migrations|sql_checks|exec_success_migrations)\//.test(filePath) || (/^scripts\//.test(filePath) && filePath.endsWith('.sql'))
      const deferred = dispositionReady && dbChangeDeferred(disposition, filePath)

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
        const status = extractLedgerStatus(row)
        if (!['VERIFIED', 'DROPPED', 'ROLLED_BACK'].includes(status)) {
          add(
            blockers,
            'BLOCKER',
            'database',
            `DB ledger row for ${filePath} is ${status || 'missing status'}, not VERIFIED/DROPPED/ROLLED_BACK.`,
            'Complete DB_CHANGE_PROTOCOL.md operator/reviewer evidence or explicitly defer publication of this DB change.',
            row,
          )
        }
      }
      obligations.database.push({ file: filePath, ledger_rows_found: rows.length })
    }

    const generated = categoryByName.get('generated_artifact')
    if (generated) {
      for (const filePath of generated.files || []) {
        if (isPublicationPipelineArtifact(filePath)) {
          continue
        }
        if (dispositionReady && generatedArtifactConfirmed(disposition, filePath)) {
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

    if (impact.independent_review_recommended_before_publication) {
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

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
