-- Read-only checks for:
-- 20260616183000_bodyshop_sa_stage_policy_hardening.sql

-- 1) Core bodyshop tables have RLS enabled.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'bodyshop_repair_cards',
    'bodyshop_intake_vehicle_photos',
    'bodyshop_repair_card_documents'
  )
order by c.relname;

-- 2) Required non-delete policies exist on bodyshop_repair_cards.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename = 'bodyshop_repair_cards'
  and policyname in (
    'bodyshop_repair_cards_select_rbac_v2',
    'bodyshop_repair_cards_insert_rbac_v2',
    'bodyshop_repair_cards_update_rbac_v2'
  )
order by policyname;

-- 3) Required non-delete policies exist on intake photo metadata table.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename = 'bodyshop_intake_vehicle_photos'
  and policyname in (
    'bodyshop_intake_vehicle_photos_select_rbac_v3',
    'bodyshop_intake_vehicle_photos_insert_rbac_v3',
    'bodyshop_intake_vehicle_photos_update_rbac_v3'
  )
order by policyname;

-- 4) Required non-delete policies exist on bodyshop document metadata table.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename = 'bodyshop_repair_card_documents'
  and policyname in (
    'bodyshop_repair_card_documents_select_rbac_v3',
    'bodyshop_repair_card_documents_insert_rbac_v3',
    'bodyshop_repair_card_documents_update_rbac_v3'
  )
order by policyname;

-- 5) Storage policies that gate autodoc uploads by dealer scope are present.
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname in (
    'autodoc objects: own dealer insert',
    'autodoc objects: own dealer update',
    'autodoc objects: own dealer read'
  )
order by policyname;
