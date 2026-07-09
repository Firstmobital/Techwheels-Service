# Updation Reminder — Import-Driven WhatsApp Automation

Project: Techwheels Service
Feature: Chassis-list import → 2x WhatsApp reminder (3-day gap) → Flow booking form → service_bookings
Started: 2026-07-09
Status: Implemented — pending manual Meta Flow/Template setup

---

## Executive Summary

Staff need to run "updation" campaigns (Tata Motors recall/software/hardware update drives): import a chassis-number sheet, resolve each chassis to a customer via `all_service_data`, and send two WhatsApp reminders 3 days apart, each offering a "Book My Visit" form (date, preferred time, branch) that creates a `service_bookings` row. This mirrors the existing Auto Service Reminder / EW Service Reminder / EW Renewal / Post-Service Feedback automations already in `WhatsAppAutomationsPage`, but is import-triggered rather than date-scan-triggered, and uses its own WhatsApp template + Flow rather than the shared `service_booking_cta` Flow.

## Source File Validated

`Pending_Updation_First_Mobital_1_1.xlsx` (Tata "Pending Updation" export): two sheets (`Sheet1` full list, `Soff` the subset to import), 16 columns including `UpdationCode`, `UpdationName`, `ChassisNo`, `Model`. Validated 523 `Soff` chassis numbers against production `all_service_data`: 509 exact matches (97.3%), 497 of those with a usable phone number, 14 unmatched — confirms exact-match-only chassis lookup is sufficient (no fuzzy fallback needed).

## Architecture

1. **New WhatsApp Flow** — authored in-repo as `docs/web/cross-cutting/wa_templates/reference/updation_booking_flow.json` (3 fields: `booking_date`, `preferred_time`, `branch`, deterministic field names so no auto-generated `screen_0_X_<hash>` keys). Published manually in Meta WhatsApp Manager (no Flow-creation API exists in this repo — same as the pre-existing `service_booking_cta` Flow). Steps documented in `docs/web/cross-cutting/wa_templates/reference/updation_reminder_wa.md`.
2. **Database** — `supabase/migrations/20260709180000_updation_reminders.sql`: `updation_import_batches` + `updation_reminders` tables, `wa_agent_config.updation_reminder_*` columns, `invoke_updation_reminder_daily()` / `reschedule_updation_reminder_cron()` + trigger (same pattern as `20260707080000_configurable_post_service_feedback_send_time.sql`). Applied to project `jmdndcphkmaljhwgzqxq` and verified via `supabase/sql_checks/20260709180000_updation_reminders_checks.sql`.
3. **Edge function** — `supabase/functions/wa-updation-reminder/index.ts`: `action: 'import'` resolves a chassis list, buckets matched-with-phone / matched-no-phone / unmatched, records a batch row, inserts reminder 1 (sent immediately) + reminder 2 (scheduled `+gap_days`); default/cron mode sweeps due reminder-2 rows, skipping anyone already booked or opted out. Deployed with `verify_jwt: false` (matches sibling reminder functions).
4. **wa-webhook** — new branch (before the legacy `service_booking_cta` handler) detects the new Flow's `booking_date` key in `nfm_reply.response_json`, creates a `service_bookings` row (`booking_source: 'WhatsApp Updation Reminder'`), and links `booking_id` back onto every unlinked `updation_reminders` row for that chassis (both reminder 1 and 2), so the day-N sweep skips already-booked customers.
5. **Frontend** — `src/pages/UpdationReminderPage.tsx`: multi-sheet file import with sheet picker, 3-bucket match summary (with downloadable unmatched/no-phone lists), config editor (template, language, variable map, send time, gap days), manual sweep runner, test-send, and a filterable reminder log table. Wired in as a new tab in `src/pages/WhatsAppAutomationsPage.tsx` (reuses the existing `/auto-service-reminder` route/permission — no new route needed).

## Outstanding Manual Step

The WhatsApp Flow and message template cannot be created via API from this repo (confirmed: no `/flows` Graph API calls exist anywhere in `supabase/functions/`). Before reminders can send live:
1. Publish the Flow JSON in Meta WhatsApp Manager (steps in `updation_reminder_wa.md`).
2. Create + submit the WA template in the app's Templates tab, with a `FLOW` button referencing the published Flow ID.
3. Once approved, select it in Updation Reminder → Configuration.

## Verification Performed

- Migration applied + verified via Supabase MCP (`apply_migration`, `execute_sql` against the checks file) — tables, constraints, indexes, config columns, cron job (`updation-reminder-daily-ist`, `30 4 * * *` = 10:00 IST) all confirmed.
- `get_advisors` (security) confirmed no new regressions beyond the same RLS-disabled / SECURITY DEFINER posture already accepted for every sibling reminder table/function.
- `wa-updation-reminder` and `wa-webhook` both deployed successfully (ACTIVE status, no boot errors).
- `npx tsc --noEmit` and `npm run build` pass with the new/changed frontend files.
- Live end-to-end send/booking test is blocked on the manual Meta Flow/template step above — to be run by staff after publishing, using the page's "Send Test Message" button and a real Flow submission.

## Related Files

- `supabase/migrations/20260709180000_updation_reminders.sql`
- `supabase/sql_checks/20260709180000_updation_reminders_checks.sql`
- `supabase/functions/wa-updation-reminder/index.ts`
- `supabase/functions/wa-webhook/index.ts` (UPDATION REMINDER branch)
- `src/pages/UpdationReminderPage.tsx`
- `src/pages/WhatsAppAutomationsPage.tsx`
- `docs/web/cross-cutting/wa_templates/reference/updation_booking_flow.json`
- `docs/web/cross-cutting/wa_templates/reference/updation_reminder_wa.md`
