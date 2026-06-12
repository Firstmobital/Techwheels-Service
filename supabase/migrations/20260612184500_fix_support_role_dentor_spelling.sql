begin;

-- Fix support role spelling mismatch in DB constraint.
-- Keep backward compatibility by accepting legacy DENTER while enabling DENTOR.
alter table if exists public.job_card_support_assignments
  drop constraint if exists job_card_support_assignments_support_role_check;

alter table public.job_card_support_assignments
  add constraint job_card_support_assignments_support_role_check
  check (
    upper(btrim(support_role)) = any (
      array['DET'::text, 'ELECTRICIAN'::text, 'DENTER'::text, 'DENTOR'::text, 'TECHNICIAN'::text]
    )
  );

comment on column public.job_card_support_assignments.support_role is
  'Support role: DET, ELECTRICIAN, DENTOR (legacy DENTER accepted), or TECHNICIAN. Multiple people per job card allowed.';

commit;
