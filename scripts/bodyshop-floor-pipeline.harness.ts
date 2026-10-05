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
  isWorkerQcTurn,
  resolveWorkerQcResponsibleRole,
  resolveActivePipelineStepIndex,
} from '../src/lib/bodyshopFloorWork/pipeline.ts'
import type { BodyshopFloorWorkTask } from '../src/lib/bodyshopFloorWork/roles.ts'

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
    technician_employee_code: null,
    technician_work_status: null,
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
  assert.equal(resolveActivePipelineStepIndex({}), null)
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
    technician_employee_code: null,
    rubbing_work_status: 'completed',
  })
  assert.equal(arePipelineWorkStepsFinished(row), true)
  assert.equal(resolveWorkerQcResponsibleRole(row), 'RUBBING')
})

check('rubbing NOT_REQUIRED — technician is QC owner if last active slot', () => {
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    technician_employee_code: 'E003',
    technician_work_status: 'completed',
    rubbing_employee_code: 'NOT_REQUIRED',
    rubbing_employee_name: 'Not Required',
    rubbing_work_status: 'not_required',
  })
  assert.equal(arePipelineWorkStepsFinished(row), true)
  assert.equal(resolveWorkerQcResponsibleRole(row), 'TECHNICIAN')
})

check('only rubbing assignee sees worker QC turn', () => {
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    rubbing_work_status: 'completed',
  })
  const rubbingTask = task('JC-TEST-001', 'RUBBING', 'E004')
  const dentorTask = task('JC-TEST-001', 'DENTOR', 'E001')
  assert.equal(isWorkerQcTurn(rubbingTask, row, 'pending'), true)
  assert.equal(isWorkerQcTurn(dentorTask, row, 'pending'), false)
})

check('QC pass — no worker QC turn', () => {
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    rubbing_work_status: 'completed',
  })
  const rubbingTask = task('JC-TEST-001', 'RUBBING', 'E004')
  assert.equal(isWorkerQcTurn(rubbingTask, row, 'pass'), false)
})

check('active pipeline — dentor visible, not QC turn', () => {
  const row = baseRow()
  const dentorTask = task('JC-TEST-001', 'DENTOR', 'E001')
  assert.equal(isFloorWorkTaskAtActivePipelineStep(dentorTask, row), true)
  assert.equal(isWorkerQcTurn(dentorTask, row, 'pending'), false)
  assert.equal(isFloorWorkTaskVisible(dentorTask, row, 'pending'), true)
})

check('after bs_floor_completed — worker QC hidden', () => {
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    rubbing_work_status: 'completed',
    bs_floor_completed_at: '2026-10-05T12:00:00Z',
  })
  const rubbingTask = task('JC-TEST-001', 'RUBBING', 'E004')
  assert.equal(isWorkerQcTurn(rubbingTask, row, 'pending'), false)
})

check('QC fail — rubbing can retry QC', () => {
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    rubbing_work_status: 'completed',
  })
  const rubbingTask = task('JC-TEST-001', 'RUBBING', 'E004')
  assert.equal(isWorkerQcTurn(rubbingTask, row, 'fail'), true)
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
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    rubbing_work_status: 'completed',
  })
  assert.equal(inchargeInQcQueue(row, 'pending'), true)
  assert.equal(inchargeInRiQueue(row, 'pending', 'pending'), false)
})

check('incharge RI tab — after worker QC pass + floor complete', () => {
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    rubbing_work_status: 'completed',
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
  const row = baseRow({
    dentor_work_status: 'completed',
    painter_work_status: 'completed',
    technician_work_status: 'completed',
    rubbing_work_status: 'completed',
  })
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
