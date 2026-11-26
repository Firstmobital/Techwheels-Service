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

// ---------------------------------------------------------------------------
// End-to-end publication (scripts/git-safe-publish.sh) against a dummy bare remote.
// All approvals below are SIMULATED fixture data, never real review evidence.
// ---------------------------------------------------------------------------
const SAFE = path.join(HERE, 'git-safe-publish.sh')
const REPORTS = [
  'docs/shared/evidence/repo_change_impact_report.json',
  'docs/shared/evidence/repo_health_audit_report.json',
  'docs/Implementation_plans/retention_validation_report.json',
]
const DISPOSITION = 'docs/shared/evidence/publication_readiness_disposition.json'
// Answers "y" to every [y/N] prompt (or "n" to the one matching DECLINE) on a pseudo-terminal.
const PTY = `
import os,pty,select,sys,time
decline=os.environ.get('DECLINE','')
pid,fd=pty.fork()
if pid==0: os.execvp('bash',['bash','scripts/git-safe-publish.sh'])
out=b'';seen=0;t=time.time()
while time.time()-t<90:
    r,_,_=select.select([fd],[],[],0.5)
    if r:
        try: c=os.read(fd,4096)
        except OSError: break
        if not c: break
        out+=c
    if out.count(b'[y/N] ')>seen:
        seen=out.count(b'[y/N] ')
        line=out[:out.rfind(b'[y/N] ')].split(b'\\n')[-1].decode(errors='replace')
        os.write(fd,b'n\\n' if decline and decline in line else b'y\\n')
_,st=os.waitpid(pid,0)
sys.stdout.write(out.decode(errors='replace'));sys.exit(os.waitstatus_to_exitcode(st))
`
const publish = (cwd, env = {}) => {
  const r = spawnSync('python3', ['-c', PTY], { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
  return { code: r.status, out: r.stdout }
}
const remoteHead = (fx) => sh(fx.remote, 'rev-parse', 'main')

function makePublishRepo({ validateFails = false } = {}) {
  const fx = makeRepo()
  const w = fx.work
  fs.mkdirSync(path.join(w, 'scripts'), { recursive: true })
  for (const f of [SAFE, IMPACT, READY]) fs.copyFileSync(f, path.join(w, 'scripts', path.basename(f)))
  // Stub validators rewrite their reports with fresh content on every run, like the real ones.
  write(w, 'scripts/stub.mjs', `import fs from 'node:fs'
fs.mkdirSync('docs/Implementation_plans', { recursive: true })
fs.writeFileSync(process.argv[2], JSON.stringify({ generated_at: process.hrtime.bigint().toString() }))
process.exitCode = Number(process.argv[3] || 0)
`)
  write(w, 'package.json', JSON.stringify({ scripts: {
    'docs:validate': `node scripts/stub.mjs ${REPORTS[2]} ${validateFails ? 1 : 0}`,
    'docs:validate:health': `node scripts/stub.mjs ${REPORTS[1]}`,
    'publish:ready': 'node scripts/publish_readiness_check.mjs',
  } }))
  write(w, REPORTS[2], '{}\n')
  sh(w, 'add', '-A')
  sh(w, 'commit', '-q', '-m', 'tooling')
  sh(w, 'push', '-q', 'origin', 'main')
  return fx
}
// Commit a change, then record SIMULATED approvals bound to that content in a second commit.
const RISKY = ['src/lib/payrollTotals.ts', 'src/lib/authGuard.ts']
function reviewedChange(w, { approve = true, omit = null, status = 'completed', files = RISKY } = {}) {
  files.forEach((f, i) => write(w, f, `export const v${i} = ${i}\n`))
  sh(w, 'add', '--', ...files)
  sh(w, 'commit', '-q', '-m', 'change')
  const disposition = { reviews: [{ category: 'high_risk', status: 'pending', files: files.filter((f) => f !== omit) }] }
  write(w, DISPOSITION, JSON.stringify(disposition))
  if (approve) {
    const fp = spawnSync('node', ['scripts/publish_readiness_check.mjs', '--review-fingerprint', 'high_risk'], { cwd: w, encoding: 'utf8' }).stdout.trim()
    Object.assign(disposition.reviews[0], { status, reviewer: 'SIMULATED APPROVER', outcome: 'SIMULATED approval', reviewed_content_sha256: fp })
    write(w, DISPOSITION, JSON.stringify(disposition))
  }
  sh(w, 'add', '--', DISPOSITION)
  sh(w, 'commit', '-q', '-m', 'disposition')
}

function publishScenario(id, title, fn, options) {
  const fx = makePublishRepo(options)
  let pass = false
  let detail = ''
  try {
    fn(fx)
    pass = true
  } catch (e) {
    detail = e.message
  }
  results.push({ id, title, pass, detail })
  fs.rmSync(fx.base, { recursive: true, force: true })
}
const untouched = (fx, before) => expect(remoteHead(fx) === before, 'dummy remote changed')
const tail = (r) => `exit ${r.code}\n${r.out.split('\n').slice(-25).join('\n')}`

publishScenario(15, 'wrong branch is rejected before any change', (fx) => {
  reviewedChange(fx.work)
  sh(fx.work, 'switch', '-q', '-c', 'governance/x')
  const before = remoteHead(fx)
  const head = sh(fx.work, 'rev-parse', 'HEAD')
  const status = sh(fx.work, 'status', '--porcelain')
  const r = publish(fx.work)
  expect(r.code === 1 && /publishes only local 'main' to origin\/main/.test(r.out), tail(r))
  expect(sh(fx.work, 'rev-parse', 'HEAD') === head && sh(fx.work, 'status', '--porcelain') === status, 'work changed')
  untouched(fx, before)
})
publishScenario(16, 'main tracking another upstream is rejected', (fx) => {
  sh(fx.work, 'push', '-q', 'origin', 'main:other')
  sh(fx.work, 'branch', '-q', '--set-upstream-to=origin/other', 'main')
  const r = publish(fx.work)
  expect(r.code === 1 && /must track origin\/main/.test(r.out), tail(r))
})
publishScenario(17, 'reviewed change set publishes; regenerated reports are not committed; review stays valid', (fx) => {
  reviewedChange(fx.work)
  const reviewedHead = sh(fx.work, 'rev-parse', 'HEAD')
  const r = publish(fx.work)
  expect(r.code === 0, tail(r))
  expect(remoteHead(fx) === reviewedHead, 'published head differs from the reviewed head')
  expect(sh(fx.work, 'status', '--porcelain') === '', 'tree dirty after publish: ' + sh(fx.work, 'status', '--porcelain'))
  expect(/Publication branch: main -> destination: origin\/main/.test(r.out), 'destination not stated')
})
publishScenario(18, 'user edit to a report that existed before the run is kept, not committed', (fx) => {
  reviewedChange(fx.work)
  const reviewedHead = sh(fx.work, 'rev-parse', 'HEAD')
  write(fx.work, REPORTS[1], '{"user":"edit"}\n')
  const r = publish(fx.work)
  expect(r.code === 0, tail(r))
  expect(remoteHead(fx) === reviewedHead, 'extra commit published')
  expect(fs.readFileSync(path.join(fx.work, REPORTS[1]), 'utf8') === '{"user":"edit"}\n', 'user edit lost')
})
publishScenario(19, 'high-risk change with only a pending entry blocks publication', (fx) => {
  reviewedChange(fx.work, { approve: false })
  const before = remoteHead(fx)
  const r = publish(fx.work)
  expect(r.code === 7 && /High-risk change needs approval/.test(r.out), tail(r))
  untouched(fx, before)
})
publishScenario(20, 'file edited after review: stale review blocks publication', (fx) => {
  reviewedChange(fx.work)
  commit(fx.work, 'src/lib/payrollTotals.ts', 'export const v0 = 999\n', 'late change')
  const before = remoteHead(fx)
  const r = publish(fx.work)
  expect(r.code === 7 && /approval is stale/.test(r.out), tail(r))
  untouched(fx, before)
})
publishScenario(21, 'new high-risk file added after approval blocks publication', (fx) => {
  reviewedChange(fx.work)
  commit(fx.work, 'src/lib/bankExport.ts', 'export const c = 3\n', 'late file')
  const before = remoteHead(fx)
  const r = publish(fx.work)
  expect(r.code === 7, tail(r))
  untouched(fx, before)
})
publishScenario(22, 'approval that omits a high-risk file blocks publication', (fx) => {
  reviewedChange(fx.work, { omit: 'src/lib/authGuard.ts' })
  const before = remoteHead(fx)
  const r = publish(fx.work)
  expect(r.code === 7 && /no recorded approval covers it\) for 1 file\(s\): src\/lib\/authGuard\.ts/.test(r.out), tail(r))
  untouched(fx, before)
})
publishScenario(23, 'remote divergence: stops after intake, nothing pushed', (fx) => {
  reviewedChange(fx.work)
  const other = clone(fx, 'other')
  commit(other, 'remote.txt', 'r\n', 'remote change')
  sh(other, 'push', '-q', 'origin', 'main')
  const before = remoteHead(fx)
  const r = publish(fx.work)
  expect(r.code === 4 && /Push withheld/.test(r.out), tail(r))
  untouched(fx, before)
})
publishScenario(24, 'failing mandatory validator blocks publication', (fx) => {
  reviewedChange(fx.work)
  const before = remoteHead(fx)
  const r = publish(fx.work)
  expect(r.code === 2, tail(r))
  untouched(fx, before)
}, { validateFails: true })
publishScenario(25, 'declining the push prompt publishes nothing', (fx) => {
  reviewedChange(fx.work)
  const before = remoteHead(fx)
  const r = publish(fx.work, { DECLINE: 'Push to origin main' })
  expect(r.code === 1 && /Aborted by user before push/.test(r.out), tail(r))
  untouched(fx, before)
})

publishScenario(26, 'routine change publishes on technical validation without any review entry', (fx) => {
  commit(fx.work, 'src/lib/format.ts', 'export const f = 1\n', 'routine')
  const head = sh(fx.work, 'rev-parse', 'HEAD')
  const r = publish(fx.work)
  expect(r.code === 0 && remoteHead(fx) === head, tail(r))
})
publishScenario(27, 'explicit user approval satisfies a high-risk change', (fx) => {
  reviewedChange(fx.work, { status: 'user_approved' })
  const head = sh(fx.work, 'rev-parse', 'HEAD')
  const r = publish(fx.work)
  expect(r.code === 0 && remoteHead(fx) === head, tail(r))
})
const MIG = 'supabase/migrations/29990101000000_fixture.sql'
const ledgerRow = (status) => `# ledger\n| ID | Date | Change Summary | Type | Migration File | Owner | Reviewer | Status | Applied Env | Validation Evidence | Authority Ref |\n| DBL-9999 | d | s | schema | 29990101000000_fixture.sql | o | r | ${status} | N/A | e | a |\n`
const dbCase = (id, title, status, expected) =>
  publishScenario(id, title, (fx) => {
    if (status !== null) commit(fx.work, 'docs/shared/reference/DB_CHANGE_LEDGER.md', ledgerRow(status), 'ledger')
    reviewedChange(fx.work, { files: [MIG] })
    const before = remoteHead(fx)
    const r = publish(fx.work)
    if (expected) expect(r.code === 0 && /Publishing the file does not apply it/.test(r.out), tail(r))
    else {
      expect(r.code === 7 && /DB ledger row|No DB ledger row/.test(r.out), tail(r))
      untouched(fx, before)
    }
  })
dbCase(28, 'unapplied migration with a truthful PROPOSED ledger row publishes', 'PROPOSED', true)
dbCase(29, 'migration without a ledger row blocks publication', null, false)
dbCase(30, 'migration with an unrecognised ledger status blocks publication', 'DONE-ISH', false)
publishScenario(31, 'metadata snapshot that does not match its manifest blocks publication', (fx) => {
  commit(fx.work, 'supabase/backups/full_metadata.sql', '-- edited\n', 'snapshot')
  commit(fx.work, 'supabase/evidence/authoritative_metadata_manifest.json', '{"sha256":"0"}\n', 'manifest')
  const before = remoteHead(fx)
  const r = publish(fx.work)
  expect(r.code === 7 && /generated artifact/.test(r.out), tail(r))
  untouched(fx, before)
})
publishScenario(32, 'failing build blocks publication', (fx) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(fx.work, 'package.json'), 'utf8'))
  pkg.scripts.build = 'node -e "process.exit(1)"'
  commit(fx.work, 'package.json', JSON.stringify(pkg), 'broken build')
  const before = remoteHead(fx)
  const r = publish(fx.work)
  expect(r.code === 2 && /build failed/.test(r.out), tail(r))
  untouched(fx, before)
})

let failed = 0
for (const r of results) {
  if (!r.pass) failed++
  console.log(`${r.pass ? 'PASS' : 'FAIL'} ${String(r.id).padStart(2, '0')} ${r.title}${r.pass ? '' : ' :: ' + r.detail}`)
}
console.log(`\n${results.length - failed}/${results.length} scenarios passed`)
process.exitCode = failed ? 1 : 0
