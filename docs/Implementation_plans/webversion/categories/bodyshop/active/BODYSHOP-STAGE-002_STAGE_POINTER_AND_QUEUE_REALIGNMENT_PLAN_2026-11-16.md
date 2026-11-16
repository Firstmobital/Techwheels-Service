# Stage Pointer and Queue Realignment Plan

**Plan ID:** BODYSHOP-STAGE-002
**Created:** 2026-11-16
**Priority:** CRITICAL
**Owner:** Bodyshop Team + Platform Team
**Status:** PLAN ONLY. No code or DB change is authorised until this plan is approved.

---

## Executive Summary

Since 3 Nov 2026 the Repair Tracker has shown stage counts that disagree with the card labels. The Stage Queue tiles for stages 15, 16 and 18 are driven by billing and settlement data. The label on each card, and stages 1-14 and 17, are driven by the `current_stage` pointer. After the manual "Mark Stage Done" button was removed, nothing moves the pointer past 15, so the two have drifted apart.

On top of that, the 14 Nov historical backfill forged customer survey approval and manager verification on every active card created before 1 Nov, and a new reconcile function was exposed to anonymous callers.

This plan fixes the queue rules, makes the pointer follow the data, adds a real audit trail, reverses the backfill damage, and closes the security gaps. It is ordered so the low-risk fixes ship first and the data-changing work waits for a backup comparison.

**Risk Level:** HIGH (pointer data and survey audit trail)
**Rollback Strategy:** Phase 1 and 4 are code/grant changes and revert by redeploy or re-grant. Phase 2 and 3 run only after a snapshot exists and are reversible from it.

---

## Evidence (audit findings, 2026-11-16)

Timeline of changes (all repo commits):

| When | Commit | Change |
|---|---|---|
| 2026-09-04 / 09-19 | bc59dea3, 1c69611a | Stage 15/16/18 queues made data-driven (`bodyshopSettlement.ts`), including the `hasAnyBillingData` gate on Billing |
| 2026-11-03 | 79a29109 | Manual "Mark Stage Done → next" buttons removed (web + mobile). No path moves a pointer past 15 any more |
| 2026-11-05 | 5c331007 | Customer survey approval advances the pointer |
| 2026-11-14 13:08 | 90de1799 | New `bodyshop_reconcile_repair_card_current_stage` + triggers; page calls it on every card open |
| 2026-11-14 14:27 | 82de18ce | Historical backfill migration `20261114140000` |

June 2026 sample (user-supplied query, 59 cards):

| Pointer | Billed | DO received | DO pay | Customer pay | Count | Real state |
|---|---|---|---|---|---|---|
| 15 | no | no | pending | pending | 12 | Ready for billing. Billing tile shows 0 because of the `hasAnyBillingData` gate |
| 15 | yes | yes | pending/partial | pending | 6 | Payment stage, labelled Billing |
| 15 | yes | yes | pending | received | 1 | Payment stage, labelled Billing |
| 15 | yes | yes | received | received | 1 | Finished, in no queue |
| 18 | yes | yes | mixed | mixed | 39 | Payment, correct |

Other findings:

- No stage history table exists. The reconcile function writes no audit row. The backfill set `updated_at = now()` on every row it touched, destroying last-modified evidence.
- The reconcile function never lowers a pointer and is capped at 15.
- `bodyshop_reconcile_repair_card_current_stage` is `SECURITY DEFINER`, `row_security` off, with `GRANT EXECUTE TO anon` and no auth check.
- The backfill sets `customer_survey_approval_status='approved'`, `doc_survey_approval=true`, a fabricated `survey_date`, and manager-verify `verified` by `historical_backfill_survey_gates`, on all active cards created before 1 Nov (several hundred).
- Reconcile treats floor assignment as manager verification, and treats pointer >= 10 as survey evidence. Both are circular.
- Reconcile matches assignments by job-card number as well as card id.
- Unexplained: the Payment tile showed 42 and the list 55, against 59 in the table. Needs tracing against the date window and filters.

---

## Objectives

1. One definition of "which stage(s) is this card in", used by tiles, list filter and card label.
2. The pointer follows billing and settlement data automatically and can reach 16, 17 and 18.
3. Every pointer change is recorded with who, why, old and new value.
4. The forged survey approvals are reversed or relabelled.
5. No unauthenticated caller can change a pointer; opening a card never writes.

Principle kept from the old behaviour: a vehicle may be in several queues at once. Tiles are worklists, not exclusive buckets.

---

## Implementation Tasks

### Phase 0: Evidence and safety (no code change)
- [ ] **0.1** OPTIONAL: if a Supabase backup from before 2026-11-14 14:27 IST exists, restore it into a scratch schema (never over production) as a cross-check. The plan does not depend on it.
- [ ] **0.2** Skip 0.4 and 0.5 diffs if no backup is available.
- [ ] **0.3** Snapshot current `bodyshop_repair_cards` and `bodyshop_stage_worklist_projection` into dated tables.
- [ ] **0.4** Diff `current_stage` and the survey columns between backup and now. Output: list of cards whose pointer moved, and their old/new values.
- [ ] **0.5** Trace the 42 / 55 / 59 count difference against the page's date window and filters.
- [ ] **0.6** Business sign-off on the stage definitions below (Phase 1).

**Exit criteria:** a written list of pointer changes since 14 Nov, and confirmation of whether the backup is usable for Phase 3.

### Phase 1: Queue rules and label (web + mobile, no data change)
- [ ] **1.1** Keep the existing Stage 15 rule (`hasAnyBillingData && !billed`). The gate existed before 2026-09-04 (commit bc59dea3^), so it is original behaviour and is NOT being removed. The 12 unbilled pointer-15 cars are invisible in the Billing tile today and were before too; they are handled by the pointer fix in Phase 2, not by changing the tile rule.
- [ ] **1.2** Stage 16 and 18 rules unchanged. Concurrency (a card in 15/16/18 together, and alongside 14) is original behaviour and stays.
- [ ] **1.3** Stage 17 (Delivery) queue becomes data-driven: both payments received and not delivered. Fully paid cars stay there until delivery is built (separate plan). This restores the old "payment done moves the car to Delivery" behaviour.
- [x] **1.4** Card label and `getEffectiveStageForCard` read the same predicates as the tiles (`src/lib/bodyshopBillingStage.ts`), so a card cannot say Billing while counted as Payment.
- [ ] **1.5** Mobile: `bodyshop-repair.tsx` groups and labels by the pointer only and has no data-driven tiles, so there is nothing to mirror. Mobile is corrected by the Phase 2 pointer fix.
- [x] **1.6** Harness `scripts/bodyshop-stage-queue.harness.ts` (`npm run test:bodyshop-stage-queue`) covers 15, 16, 17, 18 and the June sample rows.

**Exit criteria:** June sample shows the fully paid car in Delivery (stage 17), label and tile agree for every card, and any active card in zero queues is listed with a reason (for example pointer 15 with no billing data yet).

### Phase 2: Pointer follows data (migration, after Phase 0)
- [ ] **2.1** Create `bodyshop_repair_card_stage_history` (card id, from, to, reason, actor, source, created_at). RLS: read for bodyshop roles and admin, insert via trusted functions only.
- [ ] **2.2** Add `bodyshop_derive_stage(card)` implementing the Phase 1 predicates in SQL.
- [ ] **2.3** Extend the reconcile function: pointer moves up only.
  - 15 to 16 when billed.
  - 16 to 18 when DO received.
  - Writes a history row on every change.
  - Stage 17 is set only by an explicit action (2.5).
- [ ] **2.4** Fire it from a trigger on billing and settlement columns (`parts_entry_status`, `billed_amount`, `do_status`, `do_amount`, payment statuses).
- [ ] **2.5** Delivered handling is OUT OF SCOPE (separate plan). Fully paid cars stay in the Delivery queue meanwhile.
- [ ] **2.6** One-time baseline: insert a history row per active card with its current pointer (reason `baseline_2026-11-16`).
- [ ] **2.7** Backfill pointers for existing cards by running the new derive logic once, in a transaction, reporting row counts before commit.

**Exit criteria:** pointer and tiles agree for all active June to Oct cards; history table has one row per change.

### Phase 3: Reverse the survey backfill (after Phase 0)
Backup-free approach (backup is used only if available, as a cross-check). Already-advanced pointers are accepted as they are; no pointer is lowered.

- [ ] **3.1** Identify rows: `bodyshop_survey_manager_verified_by = 'historical_backfill_survey_gates'`.
- [ ] **3.2** Classify each row from evidence that still exists:
  - **Genuine**: on Floor 2/3, has a floor assignment, or pointer >= 11. A DB trigger (`20261007220000`) already blocked floor placement without customer approval, so these were approved by the real flow. Keep approval; only replace the backfill marker with a neutral "approved earlier, label completed 2026-11-14" note.
  - **Forged**: no floor, no assignment, pointer <= 10. Reset `customer_survey_approval_status` to pending and manager-verify to pending (keep a real `doc_survey_approval` document row if one exists).
  - **Fabricated survey fields**: where `survay_info_updated_at IS NULL`, the survey was never entered; clear `survey_date` and any `survey_status` the backfill added.
- [ ] **3.3** Write the before/after of every changed row to a new `bodyshop_survey_backfill_repair_log` table so the repair itself is auditable.
- [ ] **3.4** Do not change pointers. Report the forged-class cards (expected: the stage-9 cards from October with no floor) so Survey and Manager Verify can process them normally.
- [ ] **3.5** Fix the circular logic in reconcile: floor assignment no longer counts as manager verification, and pointer >= 10 no longer counts as survey evidence.

**Exit criteria:** no active card carries the forged marker without a legacy label; operations has the list of questionable pointer advances.

### Phase 4: Security and side effects (can ship first with Phase 1)
- [x] **4.1** (migration `20261116120000_bodyshop_stage_reconcile_lockdown.sql`, written, NOT applied) `REVOKE EXECUTE` on `bodyshop_reconcile_repair_card_current_stage` from PUBLIC, `anon`, `authenticated`; `service_role` keeps access. The card-change trigger function is made SECURITY DEFINER so staff updates still reconcile. No in-function auth check is needed once only triggers and `service_role` can call it.
- [x] **4.2** Auto-reconcile call and `reconcileBodyshopRepairCardStage` wrapper removed from the web app (opening a card no longer writes).
- [x] **4.3** Assignments match by `repair_card_id`; job-card number is used only for assignments whose `repair_card_id` is NULL (a strict id-only match would drop legacy assignments and stop pointers advancing).
- [ ] **4.4** Review the other SECURITY DEFINER functions added since 3 Nov for the same grant pattern.

### Phase 5: Verification
- [ ] **5.1** Re-run the June SQL. Expected: Payment equals the data-driven cards, Delivery holds the fully paid car, and the 12 unbilled pointer-15 cars appear in Billing as soon as billing data is saved.
- [ ] **5.2** Query for active cards in no queue and for cards where label and tile disagree. Both must return zero.
- [ ] **5.3** Run the same checks for July to October.
- [ ] **5.4** Manual UAT: walk one car 15 to 16 to 18 to delivered, web and mobile; confirm the history rows.
- [ ] **5.5** Refresh `supabase/backups/full_metadata.sql` and add DB_CHANGE_LEDGER entries for each migration.

---

## Delivery order

1. Phase 0 (parallel with 1 and 4).
2. Phase 1 + Phase 4 (one release, no data change).
3. Phase 2 (after Phase 0 sign-off).
4. Phase 3 (after Phase 0 confirms backup).
5. Phase 5.

Estimated duration: 5-7 working days.

---

## Risks

| Risk | Mitigation |
|---|---|
| Pointer backfill moves cards operations relies on | Snapshot first; dry-run counts before commit; history table allows reversal |
| No usable pre-14 Nov backup | Phase 3 falls back to relabelling; business accepts that original values are lost |
| Classifying a forged approval as genuine (or the reverse) | Conservative rule: only reset rows with no floor, no assignment and pointer <= 10; every change logged with before/after |
| Anon revoke breaks a caller that relied on it | Search web, mobile and edge functions for the RPC name before revoking |
| Mobile and web diverge again | Single SQL derive function from Phase 2; clients read it |

---

## Open questions for business

Resolved on 2026-11-16:
1. Fully paid cars stay in the Delivery queue; delivered handling is a later plan.
2. No backup restore is required; Phase 3 uses the evidence-based classification. Already-advanced pointers are accepted.
3. Mark Delivered is deferred to the later delivery plan.
4. Concurrent billing: keep the original behaviour (a card can be in Billing, DO and Payment together, and alongside Re-Inspection). No new rule.

Still open: none blocking.

---

## Success criteria

- [ ] Tile counts, list rows and card labels match for every active card.
- [ ] No active card is in zero queues unless terminal.
- [ ] Every pointer change after go-live has a history row.
- [ ] No forged survey approvals without a legacy label.
- [ ] The reconcile RPC is not callable by `anon`.
