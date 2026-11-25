// Practical verification harness for publication-readiness outgoing-change assessment.
// Builds throw-away git repositories (with a bare "remote") in the OS temp dir and runs the
// repository's own scripts/repo_change_impact.mjs and scripts/publish_readiness_check.mjs there.
// Never touches the real repository's history, remotes, or working tree.
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const IMPACT = path.join(HERE, 'repo_change_impact.mjs')
const READY = path.join(HERE, 'publish_readiness_check.mjs')
const results = []

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
function write(root, rel, text) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, text)
}
function commit(root, rel, text, msg) {
  write(root, rel, text)
  sh(root, 'add', '--', rel)
  sh(root, 'commit', '-q', '-m', msg)
}
function makeRepo() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pubready-'))
  const remote = path.join(base, 'remote.git')
  const work = path.join(base, 'work')
  fs.mkdirSync(work)
  sh(base, 'init', '-q', '--bare', remote)
  sh(work, 'init', '-q', '-b', 'main')
  sh(work, 'config', 'user.email', 'fixture@example.invalid')
  sh(work, 'config', 'user.name', 'fixture')
  write(work, 'docs/shared/reference/DB_CHANGE_LEDGER.md', '# ledger\n')
  write(work, 'docs/shared/evidence/repo_health_audit_report.json', '{}\n')
  write(work, 'docs/shared/evidence/publication_readiness_disposition.json', '{}\n')
  write(work, 'docs/shared/evidence/repo_change_impact_report.json', '{}\n')
  write(work, 'README.md', 'base\n')
  sh(work, 'add', '-A')
  sh(work, 'commit', '-q', '-m', 'base')
  sh(work, 'remote', 'add', 'origin', remote)
  sh(work, 'push', '-q', '-u', 'origin', 'main')
  return { base, work, remote }
}
function clone(fx, name) {
  const other = path.join(fx.base, name)
  sh(fx.base, 'clone', '-q', fx.remote, other)
  sh(other, 'config', 'user.email', 'fixture@example.invalid')
  sh(other, 'config', 'user.name', 'fixture')
  return other
}
const impact = (cwd, ...args) => spawnSync('node', [IMPACT, ...args], { cwd, encoding: 'utf8' })
const readiness = (cwd) => {
  const r = spawnSync('node', [READY], { cwd, encoding: 'utf8' })
  const areas = [...r.stdout.matchAll(/^\d+\. \[([a-z_]+)\] (.*)$/gm)].map((m) => ({ area: m[1], msg: m[2] }))
  return { status: r.stdout.match(/Publish Readiness: (\w+)/)?.[1], areas, out: r.stdout }
}
const has = (r, area, re) => r.areas.some((a) => a.area === area && (!re || re.test(a.msg)))
const range = (w) => `origin/main..HEAD`
const impactReport = (w) => JSON.parse(fs.readFileSync(path.join(w, 'docs/shared/evidence/repo_change_impact_report.json'), 'utf8'))

function scenario(id, title, fn) {
  const fx = makeRepo()
  let pass = false
  let detail = ''
  try {
    detail = fn(fx) || ''
    pass = true
  } catch (e) {
    detail = e.message
  }
  results.push({ id, title, pass, detail })
  fs.rmSync(fx.base, { recursive: true, force: true })
}
function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}

scenario(1, 'in sync, clean tree: nothing outgoing, no publication-state blocker', ({ work }) => {
  impact(work, '--range', range(work))
  const r = readiness(work)
  expect(!has(r, 'publication_state'), 'unexpected publication_state blocker')
})
scenario(2, 'clean tree + unpushed commit + no range report: not accepted', ({ work }) => {
  commit(work, 'src/a.ts', 'export const a=1\n', 'local a')
  const r = readiness(work)
  expect(has(r, 'impact') || r.status !== 'READY', 'stack assessed as ready without range evidence')
})
scenario(3, 'clean tree + unpushed commit + working-tree report (original defect): blocked', ({ work }) => {
  commit(work, 'src/a.ts', 'export const a=1\n', 'local a')
  impact(work) // working-tree mode, sees a clean tree
  expect(impactReport(work).mode === 'pending_working_tree_changes', 'fixture did not produce working-tree report')
  const r = readiness(work)
  expect(has(r, 'impact', /not accepted/), 'working-tree report was accepted for unpushed scope')
  expect(r.status !== 'READY', 'status READY')
})
scenario(4, 'unpushed commit + fresh range report: impact and state accepted', ({ work }) => {
  commit(work, 'src/a.ts', 'export const a=1\n', 'local a')
  impact(work, '--range', range(work))
  const r = readiness(work)
  expect(!has(r, 'publication_state'), 'publication_state blocker')
  expect(!has(r, 'impact'), 'impact blocker: ' + JSON.stringify(r.areas))
})
scenario(5, 'range report records resolved SHAs', ({ work }) => {
  commit(work, 'src/a.ts', 'export const a=1\n', 'local a')
  impact(work, '--range', range(work))
  const rep = impactReport(work)
  expect(rep.commit_range_resolved?.head_sha === sh(work, 'rev-parse', 'HEAD'), 'head sha missing/mismatch')
  expect(rep.commit_range_resolved?.merge_base_sha === sh(work, 'rev-parse', 'origin/main'), 'merge-base mismatch')
})
scenario(6, 'new commit after range report: stale evidence blocks', ({ work }) => {
  commit(work, 'src/a.ts', 'export const a=1\n', 'local a')
  impact(work, '--range', range(work))
  commit(work, 'src/b.ts', 'export const b=1\n', 'local b')
  const r = readiness(work)
  expect(has(r, 'impact'), 'stale report not blocked')
})
scenario(7, 'behind upstream only: publication_state blocker', (fx) => {
  const other = clone(fx, 'other')
  commit(other, 'remote.txt', 'r\n', 'remote change')
  sh(other, 'push', '-q', 'origin', 'main')
  sh(fx.work, 'fetch', '-q', 'origin')
  commit(fx.work, 'src/a.ts', 'export const a=1\n', 'local a')
  impact(fx.work, '--range', range(fx.work))
  const r = readiness(fx.work)
  expect(has(r, 'publication_state', /behind/), 'no behind/diverged blocker')
})
scenario(8, 'diverged: remote-only files excluded from outgoing set', (fx) => {
  const other = clone(fx, 'other')
  commit(other, 'remote-only.txt', 'r\n', 'remote change')
  sh(other, 'push', '-q', 'origin', 'main')
  sh(fx.work, 'fetch', '-q', 'origin')
  commit(fx.work, 'src/a.ts', 'export const a=1\n', 'local a')
  impact(fx.work, '--range', range(fx.work))
  const files = impactReport(fx.work).files.map((f) => f.path)
  expect(files.includes('src/a.ts') && !files.includes('remote-only.txt'), 'outgoing set wrong: ' + files)
  const r = readiness(fx.work)
  expect(has(r, 'publication_state', /diverged/), 'diverged not flagged')
})
scenario(9, 'uncommitted + unpushed: blocker', ({ work }) => {
  commit(work, 'src/a.ts', 'export const a=1\n', 'local a')
  impact(work, '--range', range(work))
  write(work, 'src/dirty.ts', 'export const d=1\n')
  const r = readiness(work)
  expect(has(r, 'publication_state', /Uncommitted/), 'uncommitted+unpushed not flagged')
})
scenario(10, 'range report file set tampered: mismatch blocks', ({ work }) => {
  commit(work, 'src/a.ts', 'export const a=1\n', 'local a')
  impact(work, '--range', range(work))
  const p = path.join(work, 'docs/shared/evidence/repo_change_impact_report.json')
  const rep = JSON.parse(fs.readFileSync(p, 'utf8'))
  rep.files = rep.files.concat([{ path: 'src/ghost.ts', category: 'application_code' }])
  fs.writeFileSync(p, JSON.stringify(rep))
  const r = readiness(work)
  expect(has(r, 'impact', /does not match/), 'file-set mismatch not flagged')
})
scenario(11, 'TS harness classified as automation_script', ({ work }) => {
  commit(work, 'scripts/demo.harness.ts', 'export {}\n', 'harness')
  impact(work, '--range', range(work))
  const f = impactReport(work).files.find((x) => x.path === 'scripts/demo.harness.ts')
  expect(f?.category === 'automation_script', 'category: ' + f?.category)
})
scenario(12, 'non-harness TS in scripts stays unmapped (no over-broadening)', ({ work }) => {
  commit(work, 'scripts/other.ts', 'export {}\n', 'other')
  impact(work, '--range', range(work))
  const f = impactReport(work).files.find((x) => x.path === 'scripts/other.ts')
  expect(f?.category !== 'automation_script', 'over-broad classification')
})
scenario(13, 'working-tree only (nothing unpushed): working-tree report accepted', ({ work }) => {
  write(work, 'src/w.ts', 'export const w=1\n')
  impact(work)
  const r = readiness(work)
  expect(!has(r, 'impact', /not accepted/), 'working-tree report rejected for working-tree scope')
})
scenario(14, 'pipeline artifact-only dirt + unpushed: not an uncommitted blocker', ({ work }) => {
  commit(work, 'src/a.ts', 'export const a=1\n', 'local a')
  impact(work, '--range', range(work)) // rewrites the tracked report -> artifact-only dirt
  const r = readiness(work)
  expect(!has(r, 'publication_state', /Uncommitted/), 'artifact-only dirt flagged')
})

let failed = 0
for (const r of results) {
  if (!r.pass) failed++
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${String(r.id).padStart(2, '0')} ${r.title}${r.pass ? '' : ' :: ' + r.detail}`)
}
console.log(`\n${results.length - failed}/${results.length} scenarios passed`)
process.exitCode = failed ? 1 : 0
