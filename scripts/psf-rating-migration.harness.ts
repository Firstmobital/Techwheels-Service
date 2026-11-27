import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PSF_FOLLOWUP_MAX,
  PSF_MAX_STARS,
  PSF_POSITIVE_MIN,
  PSF_STAR_LEVELS,
  psfComputeAverageRating,
  psfFormatRatingExport,
  psfFormatRatingText,
  psfNormalizeRating,
  psfRatingClassification,
  psfStarGlyphs,
} from '../src/lib/postServiceFeedbackDisplay.ts'
import {
  inferPsfTemplateRatingScale,
  isPsfFlowPayload,
  parsePsfFlowResponse,
  resolvePsfWebhookTarget,
} from '../supabase/functions/_shared/psfRating.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0
function test(name: string, fn: () => void) {
  fn()
  passed += 1
  console.log(`✓ ${name}`)
}

// 1. UI display & classification helpers (genuine 1-10, no doubling)
test('constants match approved 10-star business rules', () => {
  assert.equal(PSF_MAX_STARS, 10)
  assert.equal(PSF_FOLLOWUP_MAX, 7)
  assert.equal(PSF_POSITIVE_MIN, 8)
  assert.deepEqual(PSF_STAR_LEVELS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
})

test('star glyphs render exact filled count for all 1..10 values without multiplication', () => {
  const expected: Record<number, string> = {
    1: '★☆☆☆☆☆☆☆☆☆',
    2: '★★☆☆☆☆☆☆☆☆',
    3: '★★★☆☆☆☆☆☆☆',
    4: '★★★★☆☆☆☆☆☆',
    5: '★★★★★☆☆☆☆☆',
    6: '★★★★★★☆☆☆☆',
    7: '★★★★★★★☆☆☆',
    8: '★★★★★★★★☆☆',
    9: '★★★★★★★★★☆',
    10: '★★★★★★★★★★',
  }
  for (const [k, stars] of Object.entries(expected)) {
    const n = Number(k)
    const g = psfStarGlyphs(n)
    assert.ok(g, `glyphs missing for ${n}`)
    assert.equal(`${g.filled}${g.empty}`, stars)
    assert.equal(psfFormatRatingText(n), `${n}/10`)
    assert.equal(psfFormatRatingExport(n), `${stars} (${n}/10)`)
  }
})

test('classification: 1-4 Poor/Red/Follow-up, 5-7 Average/Amber/Follow-up, 8-10 Positive/Green/Positive', () => {
  for (const n of [1, 2, 3, 4]) {
    const c = psfRatingClassification(n)
    assert.equal(c?.tier, 'poor')
    assert.equal(c?.label, 'Poor')
    assert.equal(c?.operational, 'needs_followup')
    assert.equal(c?.colorClass, 'text-red-600')
  }
  for (const n of [5, 6, 7]) {
    const c = psfRatingClassification(n)
    assert.equal(c?.tier, 'average')
    assert.equal(c?.label, 'Average')
    assert.equal(c?.operational, 'needs_followup')
    assert.equal(c?.colorClass, 'text-amber-600')
  }
  for (const n of [8, 9, 10]) {
    const c = psfRatingClassification(n)
    assert.equal(c?.tier, 'positive')
    assert.equal(c?.label, 'Positive')
    assert.equal(c?.operational, 'positive')
    assert.equal(c?.colorClass, 'text-green-600')
  }
})

test('invalid and null ratings are rejected/excluded from display and averages', () => {
  for (const bad of [null, undefined, 0, 11, -1, 5.5, Number.NaN]) {
    assert.equal(psfNormalizeRating(bad as number | null | undefined), null)
    assert.equal(psfStarGlyphs(bad as number | null | undefined), null)
    assert.equal(psfRatingClassification(bad as number | null | undefined), null)
    assert.equal(psfFormatRatingText(bad as number | null | undefined), '—')
  }
  // Average excludes nulls and does not double
  assert.equal(psfComputeAverageRating([1, 5, 7, 9, 10, null, undefined]), 6.4)
  assert.equal(psfComputeAverageRating([null, null]), null)
})

// 2. Meta Flow JSON validation
test('10-star Meta Flow JSON has valid v7.3 structure and all 10 individual options', () => {
  const flowPath = path.join(repoRoot, 'docs/web/cross-cutting/wa_templates/reference/post_service_feedback_10star_flow.json')
  const flow = JSON.parse(readFileSync(flowPath, 'utf8'))
  assert.equal(flow.version, '7.3')
  assert.equal(flow.screens.length, 1)
  assert.equal(flow.screens[0].id, 'FEEDBACK_10_STAR')
  const form = flow.screens[0].layout.children[0]
  const radio = form.children.find((c: { type: string; name: string }) => c.type === 'RadioButtonsGroup' && c.name === 'rating_10')
  assert.ok(radio, 'RadioButtonsGroup rating_10 must exist')
  assert.equal(radio.required, true)
  const ids = radio['data-source'].map((o: { id: string }) => o.id)
  assert.deepEqual(ids, ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'])
  for (const opt of radio['data-source']) {
    assert.ok(opt.title.length <= 30, `Meta option title exceeds 30 chars: ${opt.title}`)
  }
  const footer = form.children.find((c: { type: string }) => c.type === 'Footer')
  assert.equal(footer['on-click-action'].payload.flow_version, 'psf_10_star_v2')
  assert.equal(footer['on-click-action'].payload.rating_scale, '10')
  assert.equal(footer['on-click-action'].payload.rating_10, '${form.rating_10}')
})

// 3. WhatsApp template scale inference
test('inferPsfTemplateRatingScale identifies legacy 5-star vs new 10-star templates', () => {
  assert.equal(
    inferPsfTemplateRatingScale('post_service_feedback_v1', [
      { type: 'FLOW', flow_id: 1914603942514334, navigate_screen: 'RECOMMEND', text: 'Submit Feedback' },
    ]),
    5,
  )
  assert.equal(inferPsfTemplateRatingScale('post_service_feedback_v1', null), 5)
  assert.equal(
    inferPsfTemplateRatingScale('post_service_feedback_v2', [
      { type: 'FLOW', flow_id: '2914603942514999', navigate_screen: 'FEEDBACK_10_STAR', text: 'Submit Feedback' },
    ]),
    10,
  )
})

// 4. WhatsApp webhook Flow payload parsing — all 10 native values + legacy 5-star transition + invalid rejections
test('new 10-star Flow responses 1..10 store verbatim and set review link only for 8..10', () => {
  for (let n = 1; n <= 10; n++) {
    const res = parsePsfFlowResponse(
      { flow_version: 'psf_10_star_v2', rating_scale: '10', rating_10: String(n), remarks: `Score ${n}` },
      10,
    )
    assert.equal(res.ok, true, `rating ${n} should succeed`)
    if (res.ok) {
      assert.equal(res.sourceScale, 10)
      assert.equal(res.rawRating, n)
      assert.equal(res.storedRating, n)
      assert.equal(res.convertedFromLegacy, false)
      assert.equal(res.sendReviewLink, n >= 8)
      assert.equal(res.remarks, `Score ${n}`)
    }
  }
})

test('legacy 5-star Flow responses convert 1->2, 2->4, 3->6, 4->8, 5->10', () => {
  const pairs: Array<[number, number, boolean]> = [
    [1, 2, false],
    [2, 4, false],
    [3, 6, false],
    [4, 8, true],
    [5, 10, true],
  ]
  for (const [oldVal, newVal, expectReview] of pairs) {
    const res = parsePsfFlowResponse(
      { screen_0_Choose_one_0: `Option (${oldVal}/5)`, screen_0_Remarks_1: 'Legacy reply' },
      5,
    )
    assert.equal(res.ok, true)
    if (res.ok) {
      assert.equal(res.sourceScale, 5)
      assert.equal(res.rawRating, oldVal)
      assert.equal(res.storedRating, newVal)
      assert.equal(res.convertedFromLegacy, true)
      assert.equal(res.sendReviewLink, expectReview)
    }
  }
})

test('legacy request returning 5 -> 10/10 vs new request returning 5 -> 5/10 (zero guesswork)', () => {
  const legacy5 = parsePsfFlowResponse({ screen_0_Choose_one_0: '5' }, 5)
  assert.equal(legacy5.ok, true)
  if (legacy5.ok) {
    assert.equal(legacy5.storedRating, 10)
    assert.equal(legacy5.convertedFromLegacy, true)
    assert.equal(legacy5.sendReviewLink, true)
  }

  const new5 = parsePsfFlowResponse(
    { flow_version: 'psf_10_star_v2', rating_scale: '10', rating_10: '5', remarks: 'Average' },
    10,
  )
  assert.equal(new5.ok, true)
  if (new5.ok) {
    assert.equal(new5.storedRating, 5)
    assert.equal(new5.convertedFromLegacy, false)
    assert.equal(new5.sendReviewLink, false)
  }

  // Bare "5" with no payload scale AND no DB request_rating_scale must be rejected, never guessed
  const ambiguous = parsePsfFlowResponse({ screen_0_Choose_one_0: '5' }, null)
  assert.equal(ambiguous.ok, false)
  if (!ambiguous.ok) {
    assert.equal(ambiguous.reason, 'unknown_scale')
  }
})

test('invalid ratings 0, 11, negative, decimal, out-of-range legacy 6/5 are rejected', () => {
  for (const bad of ['0', '11', '-1', '5.5', 'abc', '0/10', '11/10']) {
    const res = parsePsfFlowResponse(
      { flow_version: 'psf_10_star_v2', rating_scale: '10', rating_10: bad },
      10,
    )
    assert.equal(res.ok, false, `Expected ${bad} to be rejected`)
  }
  const badLegacy = parsePsfFlowResponse({ screen_0_Choose_one_0: 'Bad (6/5)' }, 5)
  assert.equal(badLegacy.ok, false)

  // Non-PSF flows must not trigger PSF handler
  assert.equal(isPsfFlowPayload({ screen_0_Service_Date_0: '2026-11-28' }), false)
  assert.equal(isPsfFlowPayload({ screen_0_Service_Date_2d2cde: '2026-11-28' }), false)
})

// 5. Multi-request correlation, ambiguity retention, conflict rejection, and already-rated isolation
test('exact context.id matches intended visit even when same phone has multiple open requests', () => {
  const legacyRow = { id: 101, rating: null, request_rating_scale: 5, wa_message_id: 'wamid.OLD' }
  const newRow = { id: 202, rating: null, request_rating_scale: 10, wa_message_id: 'wamid.NEW' }

  const resOld = resolvePsfWebhookTarget({
    flowFields: { screen_0_Choose_one_0: 'Excellent (5/5)', screen_0_Remarks_1: 'Older visit' },
    contextRow: legacyRow,
    unratedRowsForPhone: [newRow, legacyRow],
  })
  assert.equal(resOld.action, 'update')
  if (resOld.action === 'update') {
    assert.equal(resOld.targetRowId, 101)
    assert.equal(resOld.matchStrategy, 'exact_context_id')
    assert.equal(resOld.parsed.storedRating, 10)
    assert.equal(resOld.parsed.convertedFromLegacy, true)
  }

  const resNew = resolvePsfWebhookTarget({
    flowFields: { flow_version: 'psf_10_star_v2', rating_scale: '10', rating_10: '5', remarks: 'Newer visit' },
    contextRow: newRow,
    unratedRowsForPhone: [newRow, legacyRow],
  })
  assert.equal(resNew.action, 'update')
  if (resNew.action === 'update') {
    assert.equal(resNew.targetRowId, 202)
    assert.equal(resNew.matchStrategy, 'exact_context_id')
    assert.equal(resNew.parsed.storedRating, 5)
    assert.equal(resNew.parsed.convertedFromLegacy, false)
  }
})

test('repeated response to an already-rated request never spills into another open request for same phone', () => {
  const alreadyRated = { id: 101, rating: 8, request_rating_scale: 5, wa_message_id: 'wamid.OLD' }
  const otherOpen = { id: 202, rating: null, request_rating_scale: 5, wa_message_id: 'wamid.OTHER' }

  const res = resolvePsfWebhookTarget({
    flowFields: { screen_0_Choose_one_0: 'Poor (1/5)', screen_0_Remarks_1: 'Resubmitted old flow' },
    contextRow: alreadyRated,
    unratedRowsForPhone: [otherOpen],
  })
  assert.equal(res.action, 'skip_already_rated')
  if (res.action === 'skip_already_rated') {
    assert.equal(res.matchedRowId, 101)
    assert.equal(res.existingRating, 8)
  }
})

test('phone fallback without context.id updates ONLY when target is unambiguous by scale', () => {
  const legacyRow = { id: 101, rating: null, request_rating_scale: 5 }
  const newRow = { id: 202, rating: null, request_rating_scale: 10 }

  // 1 legacy + 1 new open, legacy payload -> unambiguous match to legacy row
  const resLegacy = resolvePsfWebhookTarget({
    flowFields: { screen_0_Choose_one_0: 'Great (4/5)', screen_0_Remarks_1: 'No context id' },
    contextRow: null,
    unratedRowsForPhone: [newRow, legacyRow],
  })
  assert.equal(resLegacy.action, 'update')
  if (resLegacy.action === 'update') {
    assert.equal(resLegacy.targetRowId, 101)
    assert.equal(resLegacy.matchStrategy, 'unambiguous_phone_and_scale')
    assert.equal(resLegacy.parsed.storedRating, 8)
  }

  // 1 legacy + 1 new open, new 10-star payload -> unambiguous match to new row
  const resNew = resolvePsfWebhookTarget({
    flowFields: { flow_version: 'psf_10_star_v2', rating_scale: '10', rating_10: '7', remarks: 'Needs call' },
    contextRow: null,
    unratedRowsForPhone: [newRow, legacyRow],
  })
  assert.equal(resNew.action, 'update')
  if (resNew.action === 'update') {
    assert.equal(resNew.targetRowId, 202)
    assert.equal(resNew.matchStrategy, 'unambiguous_phone_and_scale')
    assert.equal(resNew.parsed.storedRating, 7)
  }

  // 2 open legacy requests without context.id -> AMBIGUOUS, retained for review (never assigns wrong visit)
  const legacyRow2 = { id: 103, rating: null, request_rating_scale: 5 }
  const resAmbigLegacy = resolvePsfWebhookTarget({
    flowFields: { screen_0_Choose_one_0: 'Poor (2/5)', screen_0_Remarks_1: 'Which visit?' },
    contextRow: null,
    unratedRowsForPhone: [legacyRow2, legacyRow],
  })
  assert.equal(resAmbigLegacy.action, 'retain_for_review')
  if (resAmbigLegacy.action === 'retain_for_review') {
    assert.equal(resAmbigLegacy.reason, 'ambiguous_multiple_requests')
    assert.deepEqual(resAmbigLegacy.candidateIds, [103, 101])
  }

  // 2 open new 10-star requests without context.id -> AMBIGUOUS, retained for review
  const newRow2 = { id: 204, rating: null, request_rating_scale: 10 }
  const resAmbigNew = resolvePsfWebhookTarget({
    flowFields: { flow_version: 'psf_10_star_v2', rating_scale: '10', rating_10: '9', remarks: 'Which visit?' },
    contextRow: null,
    unratedRowsForPhone: [newRow2, newRow],
  })
  assert.equal(resAmbigNew.action, 'retain_for_review')
  if (resAmbigNew.action === 'retain_for_review') {
    assert.equal(resAmbigNew.reason, 'ambiguous_multiple_requests')
    assert.deepEqual(resAmbigNew.candidateIds, [204, 202])
  }

  // Bare rating without scale marker and 2 pending rows -> AMBIGUOUS, retained for review
  const resAmbigBare = resolvePsfWebhookTarget({
    flowFields: { screen_0_Choose_one_0: '5', screen_0_Remarks_1: 'Bare' },
    contextRow: null,
    unratedRowsForPhone: [newRow, legacyRow],
  })
  assert.equal(resAmbigBare.action, 'retain_for_review')
  if (resAmbigBare.action === 'retain_for_review') {
    assert.equal(resAmbigBare.reason, 'ambiguous_multiple_requests')
  }
})

test('conflicting request and payload rating scales are rejected and retained for review', () => {
  // Exact context match where DB says scale=5 but payload says scale=10
  const conflict1 = resolvePsfWebhookTarget({
    flowFields: { flow_version: 'psf_10_star_v2', rating_scale: '10', rating_10: '5' },
    contextRow: { id: 101, rating: null, request_rating_scale: 5 },
    unratedRowsForPhone: [],
  })
  assert.equal(conflict1.action, 'retain_for_review')
  if (conflict1.action === 'retain_for_review') {
    assert.equal(conflict1.reason, 'scale_conflict')
    assert.equal(conflict1.matchedRowId, 101)
  }

  // Exact context match where DB says scale=10 but payload says (4/5)
  const conflict2 = resolvePsfWebhookTarget({
    flowFields: { screen_0_Choose_one_0: 'Very Good (4/5)' },
    contextRow: { id: 202, rating: null, request_rating_scale: 10 },
    unratedRowsForPhone: [],
  })
  assert.equal(conflict2.action, 'retain_for_review')
  if (conflict2.action === 'retain_for_review') {
    assert.equal(conflict2.reason, 'scale_conflict')
  }

  // Phone fallback where only pending row has opposite scale
  const conflict3 = resolvePsfWebhookTarget({
    flowFields: { flow_version: 'psf_10_star_v2', rating_scale: '10', rating_10: '7' },
    contextRow: null,
    unratedRowsForPhone: [{ id: 101, rating: null, request_rating_scale: 5 }],
  })
  assert.equal(conflict3.action, 'retain_for_review')
  if (conflict3.action === 'retain_for_review') {
    assert.equal(conflict3.reason, 'scale_conflict')
    assert.deepEqual(conflict3.candidateIds, [101])
  }

  // Unmatched phone (0 pending rows) -> retained for review, not silently dropped
  const unmatched = resolvePsfWebhookTarget({
    flowFields: { flow_version: 'psf_10_star_v2', rating_scale: '10', rating_10: '9', remarks: 'Great!' },
    contextRow: null,
    unratedRowsForPhone: [],
  })
  assert.equal(unmatched.action, 'retain_for_review')
  if (unmatched.action === 'retain_for_review') {
    assert.equal(unmatched.reason, 'unmatched_no_pending_row')
  }
})

console.log(`\nALL ${passed} PSF HARNESS TESTS PASSED`)
