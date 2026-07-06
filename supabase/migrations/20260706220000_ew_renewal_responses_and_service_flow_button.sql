-- Wire up customer replies to the EW automations:
--   1) ew_renewal_reminders gains responded_at / customer_response so a
--      "Renew Now" tap can be recorded and surfaced as an interested lead.
--   2) ew_service_reminder_v1's "Book Now" button is switched from a static
--      QUICK_REPLY to the same WhatsApp Flow (date/time/branch picker)
--      already used by the approved auto-reminder template
--      ("service_due_reminder_flow", flow_id 1329781145787136), and its
--      "Call Us" button is switched to the same PHONE_NUMBER button (direct
--      dial — generates no webhook event) rather than a QUICK_REPLY.
-- This migration is additive-only; it does not modify any existing table data
-- other than the still-in-draft ew_service_reminder_v1 template row.

begin;

-- ─── 1. ew_renewal_reminders: customer response tracking ────────────────────
alter table public.ew_renewal_reminders
  add column if not exists responded_at     timestamptz,
  add column if not exists customer_response text;

comment on column public.ew_renewal_reminders.responded_at is
  'Set when the customer taps "Renew Now" on the WhatsApp reminder — marks them as an interested lead for staff follow-up.';
comment on column public.ew_renewal_reminders.customer_response is
  'The button title the customer tapped (e.g. "Renew Now").';

create index if not exists idx_err_responded_at
  on public.ew_renewal_reminders (responded_at desc)
  where responded_at is not null;

-- ─── 2. ew_service_reminder_v1: reuse the ASR booking Flow + phone button ──
update public.wa_templates
set buttons = '[
  {"text": "Book Now", "type": "FLOW", "flow_id": 1329781145787136, "flow_action": "NAVIGATE", "navigate_screen": "QUESTION_ONE"},
  {"text": "Call Us", "type": "PHONE_NUMBER", "phone_number": "+917045181062"}
]'::jsonb
where name = 'ew_service_reminder_v1';

commit;
