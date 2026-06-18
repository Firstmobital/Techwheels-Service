# TECH-EARNINGS-001: Technician Daily Earnings Email Automation

**Plan ID:** TECH-EARNINGS-001  
**Created:** 2026-06-09  
**Priority:** HIGH  
**Owner:** Techwheels Product + Engineering  

---

## Executive Summary

Implement a controlled automation flow that sends a daily email at 11:30 AM IST with an Excel attachment containing technician-wise earnings for yesterday only, including technician bank details from Employee Master. 

Rollout is intentionally two-stage:
1. Stage A: Manual test trigger (button click) from Technician screen to validate exact Excel format, recipients, and data.
2. Stage B: Automated scheduler at 11:30 AM IST after Stage A sign-off.

The Excel schema will be treated as a strict contract from the provided sample workbook. No column assumptions are allowed.

**Risk Level:** MEDIUM  
**Estimated Duration:** 2-4 working days  
**Rollback Strategy:** Disable trigger button and scheduler; keep report generation function deployed but inactive.

---

## Final Requirement Lock

1. Report scope is yesterday only in IST.
2. One row equals one technician.
3. Bank details must come from Employee Master.
4. Recipients for current test phase:
   - shruti@indiraswitch.com
   - ritesh@indiraswitch.com
   - vinodexodus@gmail.com
5. Attachment must follow exact sample workbook column contract; do not infer columns.
6. First rollout must be button-triggered test send. Daily automation starts only after approval.

---

## Current System Facts (Verified)

1. Technician earnings logic already exists in [src/pages/TechnicianPage.tsx](src/pages/TechnicianPage.tsx):
   - Income formula: net labour (gross/1.18) multiplied by EV/PV share percent.
   - Uses technician assignments + job card closed data.
2. Employee bank fields exist in Employee Master in [src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx):
   - bank_name
   - account_number
   - ifsc
3. Transactional email infra exists in [supabase/functions/send-transactional-email/index.ts](supabase/functions/send-transactional-email/index.ts).
4. No active scheduler config is currently defined in repo-level deployment config ([vercel.json](vercel.json)).

---

## Recommendation

Use one dedicated Supabase Edge Function for report generation and sending, then invoke it from:
1. UI button (authenticated admin flow) for Stage A testing.
2. DB scheduler (pg_cron at 06:00 UTC = 11:30 IST) for Stage B automation.

Why this is recommended:
1. Keeps business logic server-side and secure.
2. Reuses existing Supabase + email stack.
3. Prevents client-side Excel/email dependency for scheduled jobs.
4. Supports same code path for test send and scheduled send.

### Project Structuring Recommendation (Email Templates)

Use a dedicated template layer and keep sender/orchestrator responsibilities separate.

1. Template folder (shared app layer):
   - [src/lib/emailTemplates/index.ts](src/lib/emailTemplates/index.ts)
   - [src/lib/emailTemplates/technicianDailyEarningsTemplate.ts](src/lib/emailTemplates/technicianDailyEarningsTemplate.ts)
2. Universal sender remains unchanged and generic:
   - [supabase/functions/send-transactional-email/index.ts](supabase/functions/send-transactional-email/index.ts)
3. Report orchestrator edge function composes template + attachment and calls universal sender:
   - `technician-daily-earnings-report` edge function (to be created)

Responsibility split:
1. Template file: subject/html/text rendering only.
2. Orchestrator/report function: data fetch, yesterday IST filtering, Excel generation, recipient resolution.
3. Universal sender: delivery (Resend), attachment transport, audit logging.

---

## Implementation Tasks

### Phase 0: Excel Contract Freeze (No-Assumption Gate)
- [ ] Obtain canonical sample workbook in repository path (versioned artifact).
- [ ] Parse sheet name, header row, column order, and required data formatting from sample.
- [ ] Produce a column contract table (exact headers, order, type, format rules).
- [ ] Product sign-off on contract before any coding of exporter mapping.

Output artifact:
- [ ] docs/Implementation_plans/webversion/categories/operations/evidence/TECH-EARNINGS-001_EXCEL_CONTRACT.md

### Phase 1: Backend Report Generator + Email Sender
- [ ] Create edge function: `technician-daily-earnings-report`.
- [ ] Use `buildTechnicianDailyEarningsTemplate` from [src/lib/emailTemplates/technicianDailyEarningsTemplate.ts](src/lib/emailTemplates/technicianDailyEarningsTemplate.ts) for subject/html/text payload.
- [ ] Inputs:
  - run_mode: `test` or `scheduled`
  - run_date_ist (optional override for test)
  - recipients (optional override in test only)
- [ ] Compute IST yesterday date window:
  - start_ist: YYYY-MM-DD 00:00:00+05:30
  - end_ist: YYYY-MM-DD 23:59:59.999+05:30
- [ ] Fetch completed technician earnings dataset for IST yesterday only.
- [ ] Join employee bank fields from `employee_master` by technician code.
- [ ] Build Excel with strict template contract from Phase 0.
- [ ] Attach workbook and send email to recipients.
- [ ] Persist execution log with:
  - run id
  - mode
  - report date
  - row count
  - recipients
  - success/failure
  - error reason

### Phase 2: UI Test Button (Stage A)
- [ ] Add admin-only button in Technician page toolbar:
  - Label: Send Yesterday Earnings Test Email
- [ ] Button invokes edge function with `run_mode=test`.
- [ ] Show visible result toast with run id and row count.
- [ ] Prevent double-click duplicate sends via loading state.

### Phase 3: Scheduler Automation (Stage B)
- [ ] Create migration SQL for pg_cron schedule at 06:00 UTC daily.
- [ ] Cron invokes edge function in `run_mode=scheduled`.
- [ ] Scheduler must use secure secret header validation (not user JWT).
- [ ] Add kill switch env var: `TECH_EARNINGS_EMAIL_ENABLED`.

Implementation status update (2026-06-09):
1. ✅ Secure scheduled invocation path implemented in edge function via `x-tech-earnings-cron-secret` header validation.
2. ✅ Universal sender supports secure internal dispatch header `x-internal-email-secret` (env-driven) for non-user scheduled dispatch.
3. ✅ Scheduler migration scaffold added:
   - [supabase/migrations/20260610020000_schedule_technician_daily_earnings_email.sql](supabase/migrations/20260610020000_schedule_technician_daily_earnings_email.sql)
4. ✅ Paired verification checks added:
   - [supabase/sql_checks/20260610020000_schedule_technician_daily_earnings_email_checks.sql](supabase/sql_checks/20260610020000_schedule_technician_daily_earnings_email_checks.sql)
5. ⏳ Pending before executing migration: replace placeholder cron secret string in migration SQL.

### Phase 4: Verification + Hardening
- [ ] Compare generated workbook vs sample contract using automated header/order assertion.
- [ ] Verify empty-bank-detail behavior (allowed vs blocked decision).
- [ ] Verify no data outside IST yesterday window appears.
- [ ] Verify recipient list exactly matches configured list.
- [ ] Add runbook for operations and failure recovery.

---

## Data Contract and Calculation Rules

### Earnings Rule (must match Technician page logic)
For each technician line item basis:

$$
\text{TechnicianIncome} = \left(\frac{\text{GrossLabourAmount}}{1.18}\right) \times \frac{\text{SharePercent}}{100}
$$

Where:
1. SharePercent = EV percent for EV bay, PV percent otherwise.
2. Aggregation to one-row-per-technician is sum of yesterday technician income rows.

### Date Rule
1. Use IST calendar boundaries, not UTC date slicing.
2. Include only yesterday IST records.
3. Do not include today, older days, or custom ranges in scheduled mode.

---

## Security and Governance

1. Test button path requires authenticated admin user.
2. Scheduled path uses secret-based authorization (cron token), not end-user auth.
3. Recipients in scheduled mode come from server config, not client payload.
4. Audit every send attempt (success and failure).
5. Add idempotency guard to avoid duplicate sends for same date in scheduled mode.

---

## Proposed File-Level Change Plan

1. New edge function files:
   - supabase/functions/technician-daily-earnings-report/index.ts
2. New template layer (completed):
   - [src/lib/emailTemplates/index.ts](src/lib/emailTemplates/index.ts)
   - [src/lib/emailTemplates/technicianDailyEarningsTemplate.ts](src/lib/emailTemplates/technicianDailyEarningsTemplate.ts)
2. Shared helpers (if needed):
   - supabase/functions/_shared/technicianEarningsReport.ts
3. UI integration:
   - [src/pages/TechnicianPage.tsx](src/pages/TechnicianPage.tsx)
4. SQL migration (scheduler + optional log table):
   - supabase/migrations/<timestamp>_technician_daily_earnings_email_scheduler.sql
5. Documentation evidence and runbook:
   - docs/Implementation_plans/webversion/categories/operations/evidence/TECH-EARNINGS-001_EXCEL_CONTRACT.md
   - docs/Implementation_plans/webversion/categories/operations/evidence/runbooks/TECH-EARNINGS-001_DAILY_EMAIL_RUNBOOK.md

---

## Activity Tracker

### Legend
- ✅ COMPLETED
- 🔄 IN PROGRESS
- ⏳ PENDING
- ❌ BLOCKED

### Phase 0
```
⏳ 0.1 | Store canonical sample workbook in repo and lock path | Engineering | - | - | Required before exporter mapping
⏳ 0.2 | Publish exact column contract from sample | Engineering | - | - | No assumptions allowed
⏳ 0.3 | Business sign-off on column contract | Product | - | - | Gate for dev start
```

### Phase 1
```
⏳ 1.1 | Build edge function for report generation | Engineering | - | - | Reuse existing earnings logic contract
✅ 1.T | Create reusable template layer in src/lib/emailTemplates | Engineering | 2026-06-09 | 2026-06-09 | Done (subject/html/text builder)
⏳ 1.2 | Implement IST yesterday windowing | Engineering | - | - | Must be timezone-safe
⏳ 1.3 | Integrate Employee Master bank details join | Engineering | - | - | employee_code keyed mapping
⏳ 1.4 | Build Excel with exact template mapping | Engineering | - | - | Strict header/order match
⏳ 1.5 | Send via transactional email and log run | Engineering | - | - | Include recipients + row count
```

### Phase 2
```
⏳ 2.1 | Add admin-only test send button in Technician page | Engineering | - | - | Stage A rollout
⏳ 2.2 | Add UI loading/error/success states | Engineering | - | - | Prevent duplicate clicks
⏳ 2.3 | Conduct end-to-end test send to 3 recipients | Engineering + Product | - | - | Validate attachment and columns
```

### Phase 3
```
⏳ 3.1 | Add scheduler migration for daily 11:30 IST | Engineering | - | - | 06:00 UTC cron
⏳ 3.2 | Add scheduler auth secret validation | Engineering | - | - | No user JWT dependency
⏳ 3.3 | Enable production automation after approval | Product + Engineering | - | - | Post Stage A sign-off
```

### Phase 4
```
⏳ 4.1 | Add header/order parity test against sample | Engineering | - | - | Prevent drift
⏳ 4.2 | Add runbook for support and incident recovery | Engineering | - | - | Ops readiness
⏳ 4.3 | UAT closure and handoff | Product | - | - | Mark plan complete
```

---

## Dependencies and Prerequisites

- [ ] Canonical sample workbook available in repository (or controlled storage path) for exact-contract extraction.
- [ ] Confirmation of primary date field for yesterday filter (closed timestamp vs out timestamp) if conflict exists.
- [ ] Confirmation whether missing bank detail rows should be blocked or sent with blanks.
- [ ] Confirm scheduler environment supports pg_cron and outbound function invoke.

### Required Environment Variables (Runtime)

1. `TECH_EARNINGS_CRON_SECRET`
   - Used by scheduled trigger call to authenticate `runMode=scheduled` requests.
2. `INTERNAL_EMAIL_DISPATCH_SECRET`
   - Used by report function when calling universal sender in scheduled mode.
3. `TECH_EARNINGS_SCHEDULED_RECIPIENTS`
   - Comma-separated recipient list for scheduled runs.
4. `TECH_EARNINGS_TEST_RECIPIENTS` (optional)
   - Comma-separated recipient list for button-trigger test runs.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Excel column mismatch with expected format | Medium | High | Contract extraction + automated header/order parity checks |
| IST boundary bugs include wrong-day data | Medium | High | Explicit IST window conversion tests |
| Duplicate scheduled sends for same date | Medium | Medium | Idempotency key by report date + send log table |
| Missing bank details in employee master | High | Medium | Pre-send validation report + policy decision |
| Scheduler auth misuse | Low | High | Secret header validation + strict origin handling |

---

## Success Criteria

- ✅ Button-based test send delivers workbook to all 3 recipients.
- ✅ Attachment matches sample workbook column names and order exactly.
- ✅ Every row represents one technician with yesterday-only IST earnings.
- ✅ Bank details are populated from Employee Master mapping.
- ✅ Scheduler sends at 11:30 AM IST daily after enable flag is on.
- ✅ All sends are auditable and repeat-safe.

---

## Rollout Sequence

1. Lock Excel contract from sample.
2. Deliver test-button flow and validate with recipients.
3. Freeze and sign off output format.
4. Enable daily 11:30 IST scheduler.
5. Monitor first 3 days and close plan.

---

## Related Documentation

- [docs/STRUCTURE_GUIDE.md](docs/STRUCTURE_GUIDE.md)
- [docs/Implementation_plans/TEMPLATE.md](docs/Implementation_plans/TEMPLATE.md)
- [src/pages/TechnicianPage.tsx](src/pages/TechnicianPage.tsx)
- [src/pages/SettingsPage.tsx](src/pages/SettingsPage.tsx)
- [supabase/functions/send-transactional-email/index.ts](supabase/functions/send-transactional-email/index.ts)

---

**Last Updated:** 2026-06-09 by GitHub Copilot  
**Status:** 🟡 IN PROGRESS (Planning complete, implementation pending)
