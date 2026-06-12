begin;

-- Phase B: execute only after Phase A validation confirms zero runtime usage.
drop table if exists public.service_branches cascade;

commit;
