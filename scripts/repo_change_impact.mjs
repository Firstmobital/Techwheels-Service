// Repository Change Impact Analysis
//
// Advisory, read-only tool. It is NOT a new authority and NOT a governance
// document. It does not invent a classification scheme — it operationalizes
// the union of categories already named across:
//   - .instructions.md                          Section 2 (Task Decision Framework)
//   - docs/DOCS_IMPACT_MATRIX.md                 (code-area -> required doc updates)
//   - docs/shared/reference/SYNC_PROTOCOL.md     Classification table + Artifact Types
//   - docs/shared/reference/DATABASE_TRUTH.md    (DB authority hierarchy + change-control artifacts)
//   - docs/shared/reference/catalog/task_library/TRANSACTION_FRAMEWORK.md  (Stage 4 validation commands)
//
// It answers, for the repository's current pending Git changes:
//   1. What files changed?
//   2. What category does each file belong to?
//   3. Which authority owns each category?
//   4. What repository artifacts may need updating?
//   5. What validation commands should run?
//   6. What practical verification is recommended?
//   7. Are there unknown or unmapped files?
//   8. Is independent ("ChatGPT" / human) review recommended before publication?
//
// Design constraints (deliberate, do not relax without re-reading the brief
// that produced this script):
//   - Read-only. Runs exactly one git command (`git status --porcelain`).
//     Never runs `git add/commit/checkout/reset/push`.
//   - Writes only its own report, to docs/shared/evidence/repo_change_impact_report.json
//     — same convention as scripts/repo_health_audit.mjs. Never modifies any
//     other file.
//   - Never modifies scripts/git-safe-publish.sh and is not called by it.
//     This is an advisory pre-check an agent may run before Validation/
//     Publication (Repository Transaction Framework Stage 4/5) — it is not
//     wired into either stage's control flow and never blocks them.
//   - Exit code is always 0 on a successful run. This is intentionally an
//     information tool, not a second blocking gate — turning it into one
//     would duplicate npm run docs:validate's role.

import { execSync } from 'child_process'
import fs from 'fs/promises'
import path from 'path'

const ROOT = process.cwd()
const REPORT_PATH = path.resolve(ROOT, 'docs/shared/evidence/repo_change_impact_report.json')

// ---------------------------------------------------------------------------
// Category metadata — Phase 2 Change Impact Model.
//
// Every "owningAuthority" cites a file/section that already exists; nothing
// here defines a new rule. Where the brief's minimum 11 categories did not
// have a clean home for a path, the closest already-named category in
// .instructions.md Section 2 or SYNC_PROTOCOL's Classification table was
// used instead of inventing one (this added `configuration` and `ci_cd`,
// both already named in .instructions.md Section 2 items 6-7).
// ---------------------------------------------------------------------------

const CATEGORIES = {
  application_code: {
    label: 'Application code',
    owningAuthority: '.instructions.md Section 2 item 1; docs/DOCS_IMPACT_MATRIX.md; docs/shared/README.md; docs/shared/reference/CURRENT_STATE.md',
    requiredDocUpdates: 'Per docs/DOCS_IMPACT_MATRIX.md row for the matched path: CURRENT_STATE.md snapshot fields, CHANGE_LOG.md entry, README.md section if architecture/logic/contracts changed.',
    requiredValidation: ['npm run docs:validate'],
    practicalVerification: 'Standard feature/bug-fix verification for the changed behavior. If the change touches business logic, the Cross-Platform Parity Protocol (SYNC_PROTOCOL.md) applies: run `npx --prefix mobile tsc --noEmit -p mobile/tsconfig.json` if mobile parity is affected, and the Practical Verification Gate does not apply unless the file is also a script/automation.',
    publishSafeWithoutReview: false,
    reviewRecommended: true,
    reviewReason: 'Business-logic changes require an explicit Web-Mobile Parity declaration before merge (SYNC_PROTOCOL.md Merge Guard); standard code review otherwise.',
  },
  database_schema_truth: {
    label: 'Database / schema truth (incl. change-control artifacts)',
    owningAuthority: 'docs/shared/reference/DATABASE_TRUTH.md; docs/shared/reference/DB_CHANGE_PROTOCOL.md; docs/shared/reference/DB_CHANGE_LEDGER.md; .instructions.md Section 2 item 2 / Section 8',
    requiredDocUpdates: 'DB_CHANGE_LEDGER.md row (DATABASE_TRUTH.md table: scripts/0N_*.sql, supabase/migrations/**, supabase/sql_checks/**, supabase/exec_success_migrations/** are change-control artifacts, not truth dumps).',
    requiredValidation: ['npm run docs:validate'],
    practicalVerification: 'Apply + verify migration per DB_CHANGE_PROTOCOL.md workflow; never hand-edit a truth dump (DATABASE_TRUTH.md Inspection Rule 7).',
    publishSafeWithoutReview: false,
    reviewRecommended: true,
    reviewReason: 'Schema/RLS/function changes are the highest-risk category in this repository\'s own DB_CHANGE_PROTOCOL.md.',
  },
  repository_authority: {
    label: 'Repository authority (the operating contract itself)',
    owningAuthority: 'The file is itself an authority; governed by .instructions.md Sections 1, 3, 5, 6 (placement/minimalism/no-duplicate-authority) and docs/STRUCTURE_GUIDE.md.',
    requiredDocUpdates: 'None by default beyond the file itself — but check whether the edit invalidates any other authority\'s cross-reference (SYNC_PROTOCOL.md Index Update Rule).',
    requiredValidation: ['npm run docs:validate', 'npm run docs:validate:health'],
    practicalVerification: 'SYNC_PROTOCOL.md Practical Verification Gate, "For prompts/task contracts": dry-run reasoning test against a realistic example; confirm authority routing, Artifact Intake result, and validation commands named are still accurate.',
    publishSafeWithoutReview: false,
    reviewRecommended: true,
    reviewReason: 'Governs every future agent\'s behavior in this repository — always review.',
  },
  documentation_reference_truth: {
    label: 'Documentation / reference truth',
    owningAuthority: 'docs/STRUCTURE_GUIDE.md (placement, Sections 2-3, 14); the specific reference doc\'s own domain.',
    requiredDocUpdates: 'SYNC_PROTOCOL.md Index Update Rule if the doc is new/moved/materially changed (update the owning category README.md and docs/MASTER_INDEX.md if it introduces a new section that index doesn\'t list).',
    requiredValidation: ['npm run docs:validate', 'npm run docs:validate:health'],
    practicalVerification: 'Not applicable unless the doc is itself a script/contract/prompt (then use the repository_authority verification instead).',
    publishSafeWithoutReview: true,
    reviewRecommended: false,
    reviewReason: 'Safe for wording/clarity edits. Recommend review only if the edit redefines a policy/protocol meaning rather than clarifying existing text.',
  },
  implementation_plan: {
    label: 'Implementation plan',
    owningAuthority: 'docs/Implementation_plans/INDEX.md + platform IMPLEMENTATION_TRACKER.md; docs/STRUCTURE_GUIDE.md Sections 3.5/5/7/19/30.',
    requiredDocUpdates: 'Platform INDEX.md / IMPLEMENTATION_TRACKER.md if status changed; promotion-before-removal summary (STRUCTURE_GUIDE.md Section 28) if any item became Done+Verified.',
    requiredValidation: ['npm run docs:validate:plans'],
    practicalVerification: 'STRUCTURE_GUIDE.md Section 30 Mandatory Plan Update Protocol: pre-read gate, update-scope gate, cross-file consistency gate, then `npm run docs:validate:plans`.',
    publishSafeWithoutReview: true,
    reviewRecommended: false,
    reviewReason: 'Safe for routine progress updates. Recommend review if an item is marked Done+Verified without a completed promotion summary.',
  },
  evidence: {
    label: 'Evidence',
    owningAuthority: 'The relevant module/category/plan evidence/ folder (docs/STRUCTURE_GUIDE.md Sections 2-3).',
    requiredDocUpdates: 'None beyond the evidence file itself, unless it underpins a promotion claim (STRUCTURE_GUIDE.md Section 28).',
    requiredValidation: ['npm run docs:validate:health'],
    practicalVerification: 'Confirm the evidence reflects an actually-run command/test — No Assumption Protocol (.instructions.md Section 4); never fabricated.',
    publishSafeWithoutReview: true,
    reviewRecommended: false,
    reviewReason: 'Low risk on its own. Recommend review only if it is being cited to justify a promotion or Done+Verified status.',
  },
  runbook: {
    label: 'Runbook',
    owningAuthority: 'The owning runbooks/ doc for that module/domain (docs/STRUCTURE_GUIDE.md placement rules).',
    requiredDocUpdates: 'None beyond itself.',
    requiredValidation: ['npm run docs:validate:health'],
    practicalVerification: 'Dry-run the documented procedure if safe to do so.',
    publishSafeWithoutReview: true,
    reviewRecommended: false,
    reviewReason: 'Safe for clarifications. Recommend review if it changes operational/rollback steps for a production system.',
  },
  validation_script: {
    label: 'Validation script (a docs:validate* gate)',
    owningAuthority: 'docs/shared/reference/catalog/task_library/TRANSACTION_FRAMEWORK.md Stage 4; SYNC_PROTOCOL.md Practical Verification Gate.',
    requiredDocUpdates: 'None unless its documented behavior/exit-code contract changes — then update whichever authority describes that contract (e.g. STRUCTURE_GUIDE.md Section 24).',
    requiredValidation: ['node --check <file> (or bash -n for .sh)', 'npm run docs:validate', 'npm run docs:validate:health'],
    practicalVerification: 'SYNC_PROTOCOL.md Practical Verification Gate, "For scripts" (mandatory): syntax check, success-path test if safe, failure-path test if safe, verify no unintended application-code change.',
    publishSafeWithoutReview: false,
    reviewRecommended: true,
    reviewReason: 'Other transactions depend on this gate — always review.',
  },
  automation_script: {
    label: 'Automation script (general repository automation)',
    owningAuthority: 'docs/shared/reference/catalog/task_library/TRANSACTION_FRAMEWORK.md (names scripts/git-safe-publish.sh for Stage 5); SYNC_PROTOCOL.md Practical Verification Gate.',
    requiredDocUpdates: 'None unless its documented behavior changes — then update whichever authority names it.',
    requiredValidation: ['node --check <file> (or bash -n for .sh)'],
    practicalVerification: 'SYNC_PROTOCOL.md Practical Verification Gate, "For scripts" (mandatory). If the file is scripts/git-safe-publish.sh specifically, the five additional script-specific checks in that Gate also apply (no push during test; stops on validation failure; stops on rebase conflict; prints AUDIT_PROMPT; does not scan local_folder/backups/).',
    publishSafeWithoutReview: false,
    reviewRecommended: true,
    reviewReason: 'Always review — repository automation, and at maximum sensitivity if the file is scripts/git-safe-publish.sh (the Publication mechanism for every transaction type).',
  },
  generated_artifact: {
    label: 'Generated artifact',
    owningAuthority: 'SYNC_PROTOCOL.md Generated Artifact Rule; docs/shared/reference/DATABASE_TRUTH.md for DB dumps/manifests specifically.',
    requiredDocUpdates: 'None — never hand-edit a generated artifact.',
    requiredValidation: ['npm run docs:validate:health'],
    practicalVerification: 'Identify the generator script, re-run it, and confirm the regenerated output\'s manifest/hash matches (repo_health_audit.mjs Check 6 does this for supabase/backups/full_metadata.sql specifically).',
    publishSafeWithoutReview: true,
    reviewRecommended: false,
    reviewReason: 'Safe if produced by its own generator in this same change. Recommend review only if it appears hand-edited (drift) rather than regenerated.',
  },
  configuration: {
    label: 'Configuration',
    owningAuthority: '.instructions.md Section 2 item 6; SYNC_PROTOCOL.md Classification table row "Configuration".',
    requiredDocUpdates: 'CHANGE_LOG.md entry if an env var or config dependency changed (SYNC_PROTOCOL.md Update Triggers).',
    requiredValidation: ['npm run docs:validate'],
    practicalVerification: 'Confirm the app still builds/starts with the new configuration if the change is behavior-affecting.',
    publishSafeWithoutReview: true,
    reviewRecommended: false,
    reviewReason: 'Recommend review if it touches secret/credential-shaped values or changes a build/CI-relevant script entry; not needed for cosmetic comments.',
  },
  ci_cd: {
    label: 'CI/CD',
    owningAuthority: '.instructions.md Section 2 item 7 (.github/workflows -> .github/CODEOWNERS -> .github/pull_request_template.md).',
    requiredDocUpdates: 'None beyond itself, unless it changes which validation commands CI runs — then cross-check docs/STRUCTURE_GUIDE.md Section 24 ("CI gate should run npm run docs:validate:ci").',
    requiredValidation: ['npm run docs:validate:ci'],
    practicalVerification: 'Confirm the workflow still references real npm scripts present in package.json.',
    publishSafeWithoutReview: false,
    reviewRecommended: true,
    reviewReason: 'Affects merge gating for everyone — always review.',
  },
  unknown_unmapped: {
    label: 'Unknown / unmapped',
    owningAuthority: 'None yet. .instructions.md Section 5 (New File Decision Tree); SYNC_PROTOCOL.md Classification table row "Other".',
    requiredDocUpdates: 'Classify first via the New File Decision Tree before any doc update is attempted.',
    requiredValidation: ['npm run docs:validate'],
    practicalVerification: 'Not determinable until classified.',
    publishSafeWithoutReview: false,
    reviewRecommended: true,
    reviewReason: 'Always flagged for human classification — this tool found no matching rule for the path.',
  },
}

// ---------------------------------------------------------------------------
// Path -> category rules, evaluated in order; first match wins. Each test
// cites the authority text that justifies the bucket (see CATEGORIES above
// for the full citation; comments here are just the routing reason).
// ---------------------------------------------------------------------------

const REPOSITORY_AUTHORITY_EXACT = new Set([
  '.instructions.md',
  'docs/STRUCTURE_GUIDE.md',
  'docs/shared/reference/SYNC_PROTOCOL.md',
  'docs/shared/reference/DATABASE_TRUTH.md',
  'docs/shared/reference/catalog/task_library/TRANSACTION_FRAMEWORK.md',
  'docs/shared/reference/catalog/task_library/INDEX.md',
  'docs/DOCS_IMPACT_MATRIX.md',
  'docs/MASTER_INDEX.md',
])

const DB_PROCESS_DOC_EXACT = new Set([
  'docs/shared/reference/DB_CHANGE_PROTOCOL.md',
  'docs/shared/reference/DB_TRUTH_PROTOCOL.md',
  'docs/shared/reference/DB_CHANGE_LEDGER.md',
])

const VALIDATION_SCRIPT_EXACT = new Set([
  'scripts/repo_health_audit.mjs',
  'scripts/docs_plan_retention_validate.mjs',
])

const GENERATED_ARTIFACT_EXACT = new Set([
  'supabase/evidence/authoritative_dump_manifest.json',
  'supabase/evidence/authoritative_metadata_manifest.json',
  'docs/Implementation_plans/retention_validation_report.json',
  'docs/shared/evidence/repo_health_audit_report.json',
  'docs/shared/evidence/repo_change_impact_report.json',
])

const CONFIG_EXACT = new Set(['.env.example', 'package.json', 'package-lock.json'])

function classify(relPath) {
  if (REPOSITORY_AUTHORITY_EXACT.has(relPath)) {
    return { category: 'repository_authority', note: null }
  }
  if (DB_PROCESS_DOC_EXACT.has(relPath)) {
    return { category: 'database_schema_truth', note: 'DB process doc (DATABASE_TRUTH.md "Related Process Docs" — operational detail, not the authority itself).' }
  }
  if (relPath === 'scripts/git-safe-publish.sh') {
    return { category: 'automation_script', note: 'Publication mechanism (Transaction Framework Stage 5) — highest sensitivity; this tool does not modify it and was explicitly instructed not to.' }
  }
  if (VALIDATION_SCRIPT_EXACT.has(relPath)) {
    return { category: 'validation_script', note: null }
  }
  if (
    /^supabase\/migrations\//.test(relPath) ||
    /^supabase\/sql_checks\//.test(relPath) ||
    /^supabase\/exec_success_migrations\//.test(relPath) ||
    (/^scripts\//.test(relPath) && relPath.endsWith('.sql'))
  ) {
    return { category: 'database_schema_truth', note: 'Change-control artifact (DATABASE_TRUTH.md inventory table) — not a truth dump.' }
  }
  if (
    /^supabase\/backups\//.test(relPath) ||
    relPath === 'local_folder/backups/full_database.sql' ||
    /^local_folder\/backups\/chunks\//.test(relPath) ||
    GENERATED_ARTIFACT_EXACT.has(relPath)
  ) {
    return { category: 'generated_artifact', note: null }
  }
  if (/^scripts\//.test(relPath) && /\.(mjs|sh|js|py)$/.test(relPath)) {
    return { category: 'automation_script', note: null }
  }
  if (
    /^docs\/Implementation_plans\/.*\/evidence\//.test(relPath) ||
    /^docs\/(shared|web|mobile)\/.*\/evidence\//.test(relPath) ||
    /^supabase\/evidence\//.test(relPath)
  ) {
    return {
      category: 'evidence',
      note: relPath.startsWith('supabase/evidence/')
        ? 'DB-domain evidence (DATABASE_TRUTH.md Inspection Rule 6 names supabase/evidence/post_dump_verified_promotions.md specifically as part of the DB_TRUTH_PROTOCOL.md composite-truth workflow).'
        : null,
    }
  }
  if (/^docs\/Implementation_plans\//.test(relPath)) {
    return { category: 'implementation_plan', note: null }
  }
  if (/\/runbooks\//.test(relPath)) {
    return { category: 'runbook', note: null }
  }
  if (/^docs\/_unstructured_staging\//.test(relPath)) {
    return { category: 'unknown_unmapped', note: 'Transitional staging (STRUCTURE_GUIDE.md Section 2.6) — awaiting placement classification, not yet owned by any truth/implementation path.' }
  }
  if (relPath === '.github/CODEOWNERS' || relPath === '.github/pull_request_template.md' || /^\.github\/workflows\//.test(relPath)) {
    return { category: 'ci_cd', note: null }
  }
  if (CONFIG_EXACT.has(relPath) || /tsconfig.*\.json$/.test(relPath) || /^vite\.config\./.test(relPath) || /^eslint\.config\./.test(relPath)) {
    return { category: 'configuration', note: null }
  }
  if (/^src\//.test(relPath) || /^mobile\/src\//.test(relPath) || /^supabase\/functions\//.test(relPath)) {
    return { category: 'application_code', note: relPath.startsWith('supabase/functions/') ? 'Edge function — also consult .instructions.md Section 2 item 8 (Infrastructure) for deployment-specific requirements.' : null }
  }
  if (/^docs\/.*\.md$/.test(relPath)) {
    return { category: 'documentation_reference_truth', note: null }
  }
  if (relPath === 'README.md' || relPath === 'CONTRIBUTING.md') {
    return { category: 'documentation_reference_truth', note: 'Root meta doc. Scanned as part of repo_health_audit.mjs\'s broader governance-doc link-check set, but not named as an authority by .instructions.md itself.' }
  }
  return { category: 'unknown_unmapped', note: 'No rule in this tool matched this path.' }
}

// ---------------------------------------------------------------------------
// Git status parsing (porcelain v1: "XY path", or "XY old -> new" for renames)
// ---------------------------------------------------------------------------

function getGitChanges() {
  // --untracked-files=all expands wholly-new directories into individual
  // files instead of collapsing them to one directory-path line — needed
  // for per-file classification below.
  const raw = execSync('git status --porcelain --untracked-files=all', { cwd: ROOT, encoding: 'utf8' })
  const lines = raw.split('\n').filter((l) => l.length > 0)
  return lines.map((line) => {
    const statusCode = line.slice(0, 2)
    let body = line.slice(3)
    let oldPath = null
    if (body.includes(' -> ')) {
      const parts = body.split(' -> ')
      oldPath = parts[0]
      body = parts[1]
    }
    return { statusCode, path: body, oldPath }
  })
}

function describeStatus(code) {
  const trimmed = code.trim()
  if (code === '??') return 'untracked (new)'
  if (trimmed.includes('R')) return 'renamed'
  if (trimmed.includes('D')) return 'deleted'
  if (trimmed.includes('A')) return 'added (staged)'
  if (trimmed.includes('M')) return 'modified'
  return code
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const changes = getGitChanges()

  const files = changes.map((c) => {
    const { category, note } = classify(c.path)
    return {
      path: c.path,
      old_path: c.oldPath,
      git_status: describeStatus(c.statusCode),
      category,
      category_label: CATEGORIES[category].label,
      note,
    }
  })

  const categoriesPresent = [...new Set(files.map((f) => f.category))].sort()

  const categorySummary = categoriesPresent.map((cat) => {
    const meta = CATEGORIES[cat]
    const filesInCategory = files.filter((f) => f.category === cat).map((f) => f.path)
    return {
      category: cat,
      label: meta.label,
      files: filesInCategory,
      owning_authority: meta.owningAuthority,
      required_doc_updates: meta.requiredDocUpdates,
      required_validation: meta.requiredValidation,
      practical_verification: meta.practicalVerification,
      publish_safe_without_review: meta.publishSafeWithoutReview,
      review_recommended: meta.reviewRecommended,
      review_reason: meta.reviewReason,
    }
  })

  const validationCommands = [...new Set(categorySummary.flatMap((c) => c.required_validation))]
  const unknownFiles = files.filter((f) => f.category === 'unknown_unmapped').map((f) => f.path)
  const reviewRecommendedOverall = categorySummary.some((c) => c.review_recommended) || unknownFiles.length > 0

  const report = {
    generated_at_utc: new Date().toISOString(),
    advisory_only: true,
    read_only: true,
    note: 'Informational pre-check for Repository Transaction Framework Stage 4 (Validation) / Stage 5 (Publication). Does not block either stage and is not called by scripts/git-safe-publish.sh.',
    total_files_changed: files.length,
    files,
    categories_present: categorySummary,
    validation_commands_to_run: validationCommands,
    unknown_or_unmapped_files: unknownFiles,
    independent_review_recommended_before_publication: reviewRecommendedOverall,
  }

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true })
  await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')

  console.log('Repository Change Impact Analysis (advisory only) — report only, no files modified, no git state changed.')
  console.log(`Files changed: ${files.length}`)
  for (const c of categorySummary) {
    console.log(`- ${c.label} [${c.category}]: ${c.files.length} file(s)`)
  }
  if (unknownFiles.length > 0) {
    console.log(`\nUnknown/unmapped files (${unknownFiles.length}) — flagged for human classification:`)
    for (const f of unknownFiles) console.log(`  - ${f}`)
  } else {
    console.log('\nNo unknown/unmapped files.')
  }
  console.log(`\nValidation commands to run: ${validationCommands.length ? validationCommands.join(', ') : '(none — no changes detected)'}`)
  console.log(`Independent review recommended before publication: ${reviewRecommendedOverall ? 'YES' : 'no'}`)
  console.log(`Full report: ${path.relative(ROOT, REPORT_PATH)}`)
}

main().catch((error) => {
  console.error(error?.message || error)
  process.exitCode = 1
})
