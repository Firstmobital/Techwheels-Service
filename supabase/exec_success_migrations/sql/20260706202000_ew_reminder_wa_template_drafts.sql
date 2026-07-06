-- Seed draft wa_templates rows for the two new EW reminder automations.
-- These are drafts only (status='draft') — an admin still needs to review/edit
-- the copy in the WA Agent → Templates tab and submit them to Meta for approval
-- before ew_renewal_enabled / ew_service_reminder_enabled can be turned on.
-- This migration is additive-only and idempotent (skips insert if a row with
-- the same name already exists).

begin;

insert into public.wa_templates (
  name, display_name, category, language, status,
  header_type, header_text, body_text, footer_text,
  buttons, variable_examples, campaign_type
)
select
  'ew_renewal_reminder_v1',
  'EW Renewal Reminder',
  'UTILITY',
  'en',
  'draft',
  null, null,
  'Hi {{1}}, the Extended Warranty on your {{2}} ({{3}}) expires on {{4}}. Renew now to stay protected!',
  'Techwheels Service',
  '[{"type":"QUICK_REPLY","text":"Renew Now"}]'::jsonb,
  '[
    {"name":"name",        "example_value":"Rahul Sharma"},
    {"name":"model",       "example_value":"Nexon"},
    {"name":"reg_no",      "example_value":"RJ14AB1234"},
    {"name":"ew_end_date", "example_value":"15 Jul"}
  ]'::jsonb,
  'ew_reminder'
where not exists (
  select 1 from public.wa_templates where name = 'ew_renewal_reminder_v1'
);

insert into public.wa_templates (
  name, display_name, category, language, status,
  header_type, header_text, body_text, footer_text,
  buttons, variable_examples, campaign_type
)
select
  'ew_service_reminder_v1',
  'EW Service Reminder',
  'UTILITY',
  'en',
  'draft',
  null, null,
  'Hi {{1}}, your {{2}} ({{3}})''s Extended Warranty ends on {{4}}. Book a service before it expires to make the most of your coverage!',
  'Techwheels Service',
  '[{"type":"QUICK_REPLY","text":"Book Now"},{"type":"QUICK_REPLY","text":"Call Us"}]'::jsonb,
  '[
    {"name":"name",        "example_value":"Rahul Sharma"},
    {"name":"model",       "example_value":"Nexon"},
    {"name":"reg_no",      "example_value":"RJ14AB1234"},
    {"name":"ew_end_date", "example_value":"20 Jul"}
  ]'::jsonb,
  'ew_service_reminder'
where not exists (
  select 1 from public.wa_templates where name = 'ew_service_reminder_v1'
);

commit;
