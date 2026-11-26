#!/usr/bin/env node
/**
 * One command for the repository owner: `npm run publish:approve`.
 * Shows what is waiting to be published, records the owner's approval of the high-risk files (typed by the owner
 * at the prompt), then runs `npm run publish:safe`. It replaces hand-editing the disposition JSON.
 *
 * The approval is the owner's own act: this command needs an interactive terminal and is not for AI agents or
 * automation to run or answer. It does not change any publish gate. `--list` only shows what needs approval.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import readline from 'node:readline/promises'
import { reviewContentFingerprint, riskReason } from './publish_readiness_check.mjs'

const DISPOSITION = 'docs/shared/evidence/publication_readiness_disposition.json'
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const stop = (message) => { console.error(message); process.exit(1) }
const publish = () => process.exit(spawnSync('npm', ['run', 'publish:safe'], { stdio: 'inherit' }).status ?? 1)

const listOnly = process.argv.includes('--list')
if (!listOnly && (!process.stdin.isTTY || !process.stdout.isTTY)) stop('Run this yourself in a terminal. Approval cannot be piped or automated.')
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') stop('Switch to main first.')
// Everything approved must already be committed, so what is shown is exactly what is published.
if (!listOnly && git('status', '--porcelain')) stop('There are uncommitted changes. Commit them (or ask for them to be committed) first:\n' + git('status', '--short'))
git('fetch', '--quiet', 'origin', 'main')
if (Number(git('rev-list', '--count', 'HEAD..origin/main')) > 0) {
  stop('origin/main has new commits. Run `npm run publish:safe` to merge them, review them, then run this again.')
}

const commits = git('log', '--format=%h %s', 'origin/main..HEAD')
if (!commits) stop('Nothing to publish.')
const files = git('diff', '--name-only', 'origin/main..HEAD').split('\n').filter(Boolean)
const reviews = JSON.parse(fs.readFileSync(DISPOSITION, 'utf8')).reviews ?? []
const covered = (file) => reviews.some(
  (r) => ['completed', 'user_approved'].includes(r.status) && r.reviewer && r.outcome && r.files?.includes(file)
    && r.reviewed_content_sha256 === reviewContentFingerprint(r.files),
)
const needed = files.filter((file) => riskReason(file) && !covered(file)).sort()

console.log(`\nCommits waiting to be published:\n${commits}\n`)
if (!needed.length) {
  console.log('No new approval is needed.')
  if (listOnly) process.exit(0)
  publish()
}
console.log('High-risk files that need YOUR approval:')
for (const file of needed) console.log(`  - ${file}  (${riskReason(file)})`)
console.log(`\nTo read the changes first: git diff origin/main..HEAD -- <file>`)
if (listOnly) process.exit(0)

const prompt = readline.createInterface({ input: process.stdin, output: process.stdout })
const name = (await prompt.question('\nYour name (the approver): ')).trim()
const note = (await prompt.question('Note, e.g. anything still unchecked (optional): ')).trim()
const answer = (await prompt.question('Type APPROVE to approve these files and continue: ')).trim()
prompt.close()
if (!name || answer !== 'APPROVE') stop('Not approved. Nothing was changed.')

const disposition = JSON.parse(fs.readFileSync(DISPOSITION, 'utf8'))
const now = new Date().toISOString()
disposition.reviews = [...(disposition.reviews ?? []), {
  category: `owner_approval_${now.replace(/[-:.TZ]/g, '').slice(0, 14)}`,
  status: 'user_approved',
  reviewer: `${name} (typed in terminal via publish:approve, ${now})`,
  outcome: `Owner approval to publish ${git('rev-parse', '--short', 'HEAD')}. This is not an independent review.${note ? ` Note: ${note}` : ''}`,
  files: needed,
  reviewed_content_sha256: reviewContentFingerprint(needed),
}]
fs.writeFileSync(DISPOSITION, `${JSON.stringify(disposition, null, 2)}\n`)
git('commit', '--quiet', '-m', 'Disposition: owner approval recorded with publish:approve (no independent review)', '--', DISPOSITION)
console.log('Approval recorded. Starting publish:safe (it will ask you to confirm the push).\n')
publish()
