#!/usr/bin/env node
/**
 * Approval step of `npm run publish:safe` (not a separate command). When the commits waiting to be published contain
 * high-risk files without a current approval, it lists them and asks once: the owner's `y` records the approval and
 * is also the push confirmation (exit 10 tells publish:safe not to ask again; the push still waits for every gate).
 * It changes no gate: `publish:ready` still verifies the record afterwards.
 *
 * The approval is the repository owner's own act. AI agents and automation must not answer this prompt.
 * Without an interactive terminal it records nothing, and the readiness gate then blocks as before.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import readline from 'node:readline/promises'
import { reviewContentFingerprint, riskReason } from './publish_readiness_check.mjs'

const DISPOSITION = 'docs/shared/evidence/publication_readiness_disposition.json'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const stop = (message) => { console.error(message); process.exit(1) }

const commits = git('log', '--format=%h %s', 'origin/main..HEAD')
if (!commits) process.exit(0)
const files = git('diff', '--name-only', 'origin/main...HEAD').split('\n').filter(Boolean)
const reviews = JSON.parse(fs.readFileSync(DISPOSITION, 'utf8')).reviews ?? []
const covered = (file) => reviews.some(
  (r) => ['completed', 'user_approved'].includes(r.status) && r.reviewer && r.outcome && r.files?.includes(file)
    && r.reviewed_content_sha256 === reviewContentFingerprint(r.files),
)
const needed = files.filter((file) => riskReason(file) && !covered(file)).sort()

if (!needed.length) process.exit(0)
if (!process.stdin.isTTY || !process.stdout.isTTY) {
  console.log('Approval is needed, but there is no interactive terminal, so none was recorded.')
  process.exit(0)
}
// What is approved must be exactly what is committed.
if (git('status', '--porcelain', '--', ...needed)) stop('A file needing approval has uncommitted changes. Nothing was recorded.')
console.log(`\nCommits waiting to be published:\n${commits}\n`)

console.log('High-risk files that need YOUR approval:')
for (const file of needed) console.log(`  - ${file}  (${riskReason(file)})`)
console.log(`\nTo read the changes first: git diff origin/main...HEAD -- <file>`)

const name = git('config', 'user.name')
const prompt = readline.createInterface({ input: process.stdin, output: process.stdout })
const answer = (await prompt.question(`\n${name || 'Owner'}, approve these files and push to production once checks pass? [y/N] `)).trim()
prompt.close()
if (!name) stop('Set git config user.name so the approval can name you. Nothing was recorded.')
if (!/^y$/i.test(answer)) stop('Not approved. Nothing was recorded.')

const disposition = JSON.parse(fs.readFileSync(DISPOSITION, 'utf8'))
const now = new Date().toISOString()
disposition.reviews = [...(disposition.reviews ?? []), {
  category: `owner_approval_${now.replace(/[-:.TZ]/g, '').slice(0, 14)}`,
  status: 'user_approved',
  reviewer: `${name} (typed in terminal during publish:safe, ${now})`,
  outcome: `Owner approval to publish ${git('rev-parse', '--short', 'HEAD')}. This is not an independent review.`,
  files: needed,
  reviewed_content_sha256: reviewContentFingerprint(needed),
}]
fs.writeFileSync(DISPOSITION, `${JSON.stringify(disposition, null, 2)}\n`)
git('commit', '--quiet', '-m', 'Disposition: owner approval recorded during publish:safe (no independent review)', '--', DISPOSITION)
console.log('Approval recorded.')
process.exit(10)
