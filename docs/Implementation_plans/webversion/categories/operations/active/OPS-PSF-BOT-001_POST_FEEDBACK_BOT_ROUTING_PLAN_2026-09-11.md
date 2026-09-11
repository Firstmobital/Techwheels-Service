# OPS-PSF-BOT-001: Post-service feedback bot routing

**Plan ID:** OPS-PSF-BOT-001  
**Created:** 2026-09-11  
**Last Updated:** 2026-09-11  
**Priority:** HIGH  
**Owner:** Operations Team + Platform Team  
**Status:** Active (DBL-0049 VERIFIED in linked project; metadata dump refresh pending)  
**Platform:** webversion  
**Category:** operations  
**Ledger:** DBL-0049

---

## Executive Summary

Automatically create a `public.post_feedback_bot_data` work item when a `public.post_service_feedback_messages` row becomes eligible for CRE complaint handling (`status = 'responded'`, `rating` not null and `<= 3`, `cre_status = 'open'`). The event source is the messages table, not the `post_service_feedback_cre_queue` view. Idempotency is enforced with `source_feedback_message_id` unique against `post_service_feedback_messages.id`.

**Risk Level:** 🟡 MEDIUM  
**Estimated Duration:** 1 session  
**Rollback Strategy:** Drop the trigger and functions, then drop the unique/FK and `source_feedback_message_id` column. Existing bot rows remain.

---

## Objectives

1. Route eligible PSF message rows into `post_feedback_bot_data` on INSERT or UPDATE.
2. Never create duplicate bot rows for the same source message.
3. Backfill currently eligible historical rows without duplicating bot work already present.
4. Leave `post_service_feedback_cre_queue` unchanged (all responded ratings; bot routing is narrower).

---

## Context & Background

Audit of `supabase/backups/full_metadata.sql` (primary) plus live linked-project queries on 2026-09-11:

- `post_feedback_bot_data` exists with PK only. No source-message column, no unique business key, RLS disabled, dormant `admin_unrestricted_all_ops_v1` policy, `GRANT ALL` to anon/authenticated/service_role.
- No trigger on `post_service_feedback_messages`. Existing PSF functions (`invoke_post_service_feedback_daily`, `psf_add_remark`, `psf_mark_resolved`, cron reschedule) do not route to the bot table. **Cannot extend an existing routing trigger; a new trigger is required.**
- Live counts: 33 eligible open low-rating rows; 33 bot rows; 33 unique matches on `(mobile_number, vehicle_registration_number, rating)`. CRE queue view has 462 responded rows (any rating).

---

## Implementation Tasks

### Phase 1: Schema and trigger
- [x] **Task 1.1:** Add `source_feedback_message_id bigint`, unique constraint, FK to `post_service_feedback_messages(id)`.
- [x] **Task 1.2:** Trigger/function on `post_service_feedback_messages` AFTER INSERT OR UPDATE OF `status, rating, cre_status` with eligibility WHEN clause. `ON CONFLICT DO NOTHING`. Not `SECURITY DEFINER`.
- [x] **Task 1.3:** Idempotent historical attach + backfill.

### Phase 2: Verification
- [x] **Task 2.1:** Paired sql_checks (SELECT-only).
- [x] **Task 2.2:** Controlled Tests A–I against the linked database, with cleanup.

### Phase 3: Docs / promotion
- [x] **Task 3.1:** Ledger, CURRENT_STATE, CHANGE_LOG, plan indexes.
- [x] **Task 3.2:** Promoted. Metadata dump not refreshed (no `SUPABASE_DB_*` in `.env.local`); composite truth is dump + `post_dump_verified_promotions.md`.

---

## Activity Tracker

```
✅ 1.1 | Source column + unique + FK | Agent | 2026-09-11 | 2026-09-11 | DBL-0049
✅ 1.2 | Trigger/function | Agent | 2026-09-11 | 2026-09-11 | SECURITY INVOKER
✅ 1.3 | Historical attach/backfill | Agent | 2026-09-11 | 2026-09-11 | 33 attached, 0 inserted
✅ 2.1 | sql_checks | Agent | 2026-09-11 | 2026-09-11 | promoted
✅ 2.2 | Tests A-I | Agent | 2026-09-11 | 2026-09-11 | all passed
✅ 3.1 | Docs | Agent | 2026-09-11 | 2026-09-11 |
✅ 3.2 | Promote | Agent | 2026-09-11 | 2026-09-11 | dump refresh pending
```

---

## Field mapping (locked from audit)

| Destination | Source | Evidence |
|---|---|---|
| `source_feedback_message_id` | `m.id` | bigint PK |
| `vehicle_registration_number` | `m.vehicle_registration_number` | CRE queue |
| `mobile_number` | `m.mobile_number` | CRE queue |
| `customer_name` | `m.customer_name` | CRE queue |
| `rating` | `m.rating` | CRE queue |
| `feedback_text` | `m.feedback_text` | CRE queue |
| `service_advisor_name` | `COALESCE(em.employee_name, jc.sr_assigned_to)` | CRE queue |
| `branch` | `jc.branch_label` | CRE queue |
| `service_type` | `jc.sr_type` | CRE queue |
| `chassis_no` | `jc.chassis_number` | JC column; 33/33 match to existing bot rows |

Intentionally NULL at insert (no repo rule / destination type or fill evidence does not support a mapping):

- `mode` (5/33 existing rows are `PSF Feedback`; 28 NULL)
- `complaint_date_time` (text; 0/33 filled; `responded_at` is timestamptz — not assumed)
- `primary_complaint_area`, `sub_area`, `type`, `problem_area` (0/33 filled; no source column)
- `model`, `powertrain_type` (JC has neither column; existing bot rows match `all_service_data` 32/33 — unresolved whether the robot enriches after insert)
- `robot_status`, `robot_timestamp` (bot-owned; 32/33 already `Done`)

---

## Trigger condition

```sql
AFTER INSERT OR UPDATE OF status, rating, cre_status
ON public.post_service_feedback_messages
FOR EACH ROW
WHEN (
  NEW.status = 'responded'
  AND NEW.rating IS NOT NULL
  AND NEW.rating <= 3
  AND NEW.cre_status = 'open'
)
```

Do not delete or sync-away bot rows when `cre_status` later leaves `open`.

---

## Success Criteria

- ✅ Exactly one bot row per eligible source message (Tests A, B, G, H).
- ✅ Ratings 4/5, non-open CRE, and non-responded status create no bot row (Tests C–F).
- ✅ Mapped fields match source/join (Test I).
- ✅ Historical eligible rows represented without duplicates.
- ✅ CRE queue view definition unchanged.

---

## Related Documentation

- `docs/shared/reference/DB_CHANGE_PROTOCOL.md`
- `docs/shared/reference/DB_CHANGE_LEDGER.md` (DBL-0049)
- `docs/shared/reference/DATABASE_TRUTH.md`

---

**Last Updated:** 2026-09-11 by Cursor Agent  
**Status:** 🟢 COMPLETED (metadata dump refresh remaining)
