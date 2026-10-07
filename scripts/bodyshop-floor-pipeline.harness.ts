/**
 * Manual QA harness — temp assignment rows, no DB.
 * Run: npx tsx scripts/bodyshop-floor-pipeline.harness.ts
 */
import assert from 'node:assert/strict'
import {
  computeBodyshopFloorFlowSteps,
} from '../mobile/src/lib/bodyshopFloorWork/floorFlowSteps'
import {
  arePipelineWorkStepsFinished,
  isFloorWorkTaskAtActivePipelineStep,
  isFloorWorkTaskVisible,
  resolveActivePipelineStepIndex,
  isWorkerQcTurn,
  canUploadFloorWorkPhotos,
} from '../src/lib/bodyshopFloorWork/pipeline.ts'
import type { BodyshopFloorWorkTask } from '../src/lib/bodyshopFloorWork/roles.ts'
import {
  resolveBodyshopFloorSinceIso,
  calendarDaysSince,
  floorAgeLabel,
} from '../src/lib/bodyshopFloorAge.ts'

type Row = Record<string, unknown>

function task(
  jc: string,
  role: BodyshopFloorWorkTask['floorRole'],
  code: string,
): BodyshopFloorWorkTask {
  return {
    jobCardNumber: jc,
    repairCardId: 1,
    dealerCode: 'TEST',
    floorRole: role,
    assignedEmployeeCode: code,
    employeeName: 'Test Worker',
    assignedAt: '2026-10-05T10:00:00+05:30',
    isSupport: false,
  }
}

/** All primary lanes assigned; worker steps marked completed (for QC / incharge queue tests). */
function pipelineWorkerDoneRow(over: Row = {}): Row {
  return baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    technician_employee_code: 'E003',
    technician_work_status: 'completed',
    rubbing_work_status: 'completed',
    ...over,
  })
}

function baseRow(over: Row = {}): Row {
  return {
    job_card_number: 'JC-TEST-001',
    bs_floor_completed_at: null,
    dentor_employee_code: 'E001',
    dentor_employee_name: 'Dentor One',
    dentor_work_status: 'work_inprocess',
    dentor_helper_employee_code: 'NOT_REQUIRED',
    dentor_helper_employee_name: 'Not Required',
    dentor_helper_work_status: 'not_required',
    painter_employee_code: 'E002',
    painter_employee_name: 'Painter One',
    painter_work_status: 'work_inprocess',
    painter_helper_employee_code: null,
    painter_helper_work_status: null,
    technician_employee_code: 'E003',
    technician_work_status: 'work_inprocess',
    rubbing_employee_code: 'E004',
    rubbing_employee_name: 'Rubbing One',
    rubbing_work_status: 'work_inprocess',
    ...over,
  }
}

let passed = 0
let failed = 0

function check(name: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed += 1
    console.error(`  ✗ ${name}`)
    console.error(`    ${e instanceof Error ? e.message : e}`)
  }
}

console.log('\nBodyshop floor pipeline harness (temp data)\n')

check('empty row — pipeline not finished', () => {
  assert.equal(arePipelineWorkStepsFinished({}), false)
  assert.equal(resolveActivePipelineStepIndex({}), 0)
})

check('no worker slots assigned — not QC-ready', () => {
  const row = baseRow({
    dentor_employee_code: null,
    painter_employee_code: null,
    rubbing_employee_code: null,
  })
  assert.equal(arePipelineWorkStepsFinished(row), false)
})

check('denter helper NOT_REQUIRED skips helper in step 0', () => {
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'work_inprocess',
  })
  assert.equal(resolveActivePipelineStepIndex(row), 1)
})

check('full pipeline done — QC phase (no bs_floor yet)', () => {
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    technician_employee_code: 'E003',
    technician_work_status: 'completed',
    rubbing_work_status: 'completed',
  })
  assert.equal(arePipelineWorkStepsFinished(row), true)
})

check('dentor / painter / technician each get QC after their step Done', () => {
  const row = pipelineWorkerDoneRow()
  const dentorTask = task('JC-TEST-001', 'DENTOR', 'E001')
  const painterTask = task('JC-TEST-001', 'PAINTER', 'E002')
  const rubbingTask = task('JC-TEST-001', 'RUBBING', 'E004')
  assert.equal(isWorkerQcTurn(dentorTask, row, {}, 'pending'), true)
  assert.equal(isWorkerQcTurn(painterTask, row, {}, 'pending'), true)
  assert.equal(isWorkerQcTurn(rubbingTask, row, {}, 'pending'), false)
})

check('repair card QC pass — no worker QC turn', () => {
  const row = pipelineWorkerDoneRow()
  const dentorTask = task('JC-TEST-001', 'DENTOR', 'E001')
  assert.equal(isWorkerQcTurn(dentorTask, row, {}, 'pass'), false)
})

check('active pipeline — dentor visible, not QC turn', () => {
  const row = baseRow()
  const dentorTask = task('JC-TEST-001', 'DENTOR', 'E001')
  assert.equal(isFloorWorkTaskAtActivePipelineStep(dentorTask, row), true)
  assert.equal(isWorkerQcTurn(dentorTask, row, {}, 'pending'), false)
  assert.equal(isFloorWorkTaskVisible(dentorTask, row, {}, 'pending'), true)
})

check('after bs_floor_completed — worker QC hidden', () => {
  const row = pipelineWorkerDoneRow({
    bs_floor_completed_at: '2026-10-05T12:00:00Z',
  })
  const dentorTask = task('JC-TEST-001', 'DENTOR', 'E001')
  assert.equal(isWorkerQcTurn(dentorTask, row, {}, 'pending'), false)
})

check('role QC pass — that worker QC turn ends', () => {
  const row = pipelineWorkerDoneRow()
  const dentorTask = task('JC-TEST-001', 'DENTOR', 'E001')
  assert.equal(isWorkerQcTurn(dentorTask, row, { DENTOR: { floor_role: 'DENTOR', qc_status: 'pass' } }, 'pending'), false)
})

check('role QC fail — dentor can retry', () => {
  const row = pipelineWorkerDoneRow()
  const dentorTask = task('JC-TEST-001', 'DENTOR', 'E001')
  assert.equal(isWorkerQcTurn(dentorTask, row, { DENTOR: { floor_role: 'DENTOR', qc_status: 'fail' } }, 'fail'), true)
})

function inchargeInQcQueue(row: Row, qcStatus: string): boolean {
  if (String(qcStatus).trim().toLowerCase() === 'pass') return false
  if (String(row.bs_floor_completed_at ?? '').trim()) return true
  return arePipelineWorkStepsFinished(row)
}

function inchargeInRiQueue(row: Row, qcStatus: string, riStatus: string): boolean {
  const bsDone = Boolean(String(row.bs_floor_completed_at ?? '').trim())
  const qcPass = String(qcStatus).trim().toLowerCase() === 'pass'
  const riDone = String(riStatus).trim().toLowerCase() === 'completed'
  return bsDone && qcPass && !riDone
}

check('incharge QC tab — pipeline done, QC pending', () => {
  const row = pipelineWorkerDoneRow()
  assert.equal(inchargeInQcQueue(row, 'pending'), true)
  assert.equal(inchargeInRiQueue(row, 'pending', 'pending'), false)
})

check('incharge RI tab — after worker QC pass + floor complete', () => {
  const row = pipelineWorkerDoneRow({
    bs_floor_completed_at: '2026-10-05T12:00:00Z',
  })
  assert.equal(inchargeInQcQueue(row, 'pass'), false)
  assert.equal(inchargeInRiQueue(row, 'pass', 'pending'), true)
})

check('floor flow — QC locked until rubbing pipeline done', () => {
  const row = baseRow({ dentor_work_status: 'work_inprocess', painter_work_status: 'completed' })
  const steps = computeBodyshopFloorFlowSteps({
    assignRow: row,
    roleAt: () => ({ employee_code: 'E1', work_status: 'completed' }),
    qcStatus: 'pending',
    riStatus: 'pending',
  })
  const qc = steps.find((s) => s.id === 'QC')
  assert.equal(qc?.state, 'locked')
})

check('floor flow — QC active then RI after pass then EDP after RI', () => {
  const row = pipelineWorkerDoneRow()
  const mid = computeBodyshopFloorFlowSteps({
    assignRow: row,
    roleAt: (role) =>
      role === 'RUBBING'
        ? { employee_code: 'R1', work_status: 'completed' }
        : { employee_code: 'X', work_status: 'completed' },
    qcStatus: 'pass',
    riStatus: 'pending',
  })
  assert.equal(mid.find((s) => s.id === 'QC')?.state, 'done')
  assert.equal(mid.find((s) => s.id === 'RI')?.state, 'active')
  assert.equal(mid.find((s) => s.id === 'EDP')?.state, 'locked')

  const afterRi = computeBodyshopFloorFlowSteps({
    assignRow: row,
    roleAt: (role) =>
      role === 'EDP'
        ? { employee_code: 'ED1', work_status: 'work_inprocess' }
        : { employee_code: 'X', work_status: 'completed' },
    qcStatus: 'pass',
    riStatus: 'completed',
  })
  assert.equal(afterRi.find((s) => s.id === 'EDP')?.state, 'active')
})

check('painter not active until dentor Done (Floor Work order)', () => {
  const row = baseRow({ dentor_work_status: 'work_inprocess', painter_work_status: 'work_inprocess' })
  const dentorTask = task('JC-TEST-001', 'DENTOR', 'E001')
  const painterTask = task('JC-TEST-001', 'PAINTER', 'E002')
  assert.equal(isFloorWorkTaskAtActivePipelineStep(dentorTask, row), true)
  assert.equal(isFloorWorkTaskAtActivePipelineStep(painterTask, row), false)
})

check('missing painter assign blocks pipeline complete (incharge must assign)', () => {
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_employee_code: null,
    painter_work_status: null,
  })
  assert.equal(resolveActivePipelineStepIndex(row), 1)
  assert.equal(arePipelineWorkStepsFinished(row), false)
})

check('floor flow — unassigned roles locked in step tracker', () => {
  const steps = computeBodyshopFloorFlowSteps({
    assignRow: undefined,
    roleAt: (role) =>
      role === 'FLOOR_INCHARGE'
        ? { employee_code: 'FI1', work_status: 'work_inprocess' }
        : null,
    qcStatus: 'pending',
    riStatus: 'pending',
  })
  assert.equal(steps.find((s) => s.id === 'FLOOR_INCHARGE')?.state, 'active')
  assert.equal(steps.find((s) => s.id === 'DENTOR')?.state, 'locked')
  assert.equal(steps.find((s) => s.id === 'PAINTER')?.state, 'locked')
})

check('floor flow — completed role shows done (blue) in step tracker', () => {
  const steps = computeBodyshopFloorFlowSteps({
    assignRow: undefined,
    roleAt: (role) =>
      role === 'DENTOR'
        ? { employee_code: 'D1', work_status: 'completed' }
        : null,
    qcStatus: 'pending',
    riStatus: 'pending',
  })
  assert.equal(steps.find((s) => s.id === 'DENTOR')?.state, 'done')
  assert.equal(steps.find((s) => s.id === 'PAINTER')?.state, 'locked')
})

check('parallel floor steps — dentor and painter both active for assignment UI', () => {
  const row = baseRow({ dentor_work_status: 'work_inprocess' })
  const steps = computeBodyshopFloorFlowSteps({
    assignRow: row,
    roleAt: (role) =>
      role === 'DENTOR'
        ? { employee_code: 'E001', work_status: 'work_inprocess' }
        : role === 'PAINTER'
          ? { employee_code: 'E002', work_status: 'work_inprocess' }
          : null,
    qcStatus: 'pending',
    riStatus: 'pending',
  })
  assert.equal(steps.find((s) => s.id === 'DENTOR')?.state, 'active')
  assert.equal(steps.find((s) => s.id === 'PAINTER')?.state, 'active')
})

check('floor work — dentor can upload photos on active dentor step', () => {
  const row = baseRow({
    dentor_employee_code: 'D001',
    dentor_work_status: 'work_inprocess',
  })
  const t = task('JC1', 'DENTOR', 'D001')
  assert.equal(canUploadFloorWorkPhotos(t, row, {}, 'pending'), true)
})

check('floor work — painter cannot upload until dentor step done', () => {
  const row = baseRow({
    dentor_employee_code: 'D001',
    dentor_work_status: 'work_inprocess',
    painter_employee_code: 'P001',
    painter_work_status: 'work_inprocess',
  })
  const t = task('JC1', 'PAINTER', 'P001')
  assert.equal(canUploadFloorWorkPhotos(t, row, {}, 'pending'), false)
})

check('floor work — painter can upload after dentor completed', () => {
  const row = baseRow({
    dentor_employee_code: 'D001',
    dentor_work_status: 'completed',
    painter_employee_code: 'P001',
    painter_work_status: 'work_inprocess',
  })
  const t = task('JC1', 'PAINTER', 'P001')
  assert.equal(canUploadFloorWorkPhotos(t, row, {}, 'pending'), true)
})

check('floor age — advisor send timestamp, not role assignment', () => {
  const since = resolveBodyshopFloorSinceIso({
    bodyshop_floor: 'Floor 2',
    bodyshop_floor_since_at: '2026-10-01T08:00:00+05:30',
    survay_info_updated_at: '2026-10-03T08:00:00+05:30',
    created_at: '2026-09-01T08:00:00+05:30',
  })
  assert.equal(since, '2026-10-01T08:00:00+05:30')
  assert.equal(resolveBodyshopFloorSinceIso({ bodyshop_floor: null, bodyshop_floor_since_at: '2026-10-01' }), null)
  const days = calendarDaysSince('2026-10-01T08:00:00+05:30')
  assert.ok(days != null && days >= 0)
  assert.ok(floorAgeLabel(0).includes('today'))
})

check('parse/join QC names — pipe delimiter round-trip', () => {
  const raw = 'Sharma, Kedar|Painter Two'
  const tokens = raw.includes('|')
    ? raw.split('|').map((s) => s.trim()).filter(Boolean)
    : [raw]
  assert.deepEqual(tokens, ['Sharma, Kedar', 'Painter Two'])
  assert.equal(tokens.join('|'), raw)
})

console.log(`\nResult: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exit(1)
