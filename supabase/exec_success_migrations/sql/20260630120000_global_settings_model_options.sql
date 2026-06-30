-- Global vehicle model catalog: one row per model name, not scoped by dealer.
-- Replaces per-dealer UNIQUE (dealer_code, model_name) with global uniqueness.
--
-- Rollback (manual, if needed before constraint hardening):
--   DROP INDEX IF EXISTS public.settings_model_options_model_name_global_unique;
--   ALTER TABLE public.settings_model_options DROP CONSTRAINT IF EXISTS settings_model_options_dealer_code_global_only;
--   ALTER TABLE public.settings_model_options ALTER COLUMN dealer_code SET DEFAULT public.my_dealer_code();
--   ALTER TABLE public.settings_model_options ADD CONSTRAINT settings_model_options_dealer_model_unique UNIQUE (dealer_code, model_name);

begin;

-- 1) Remove cross-dealer duplicate rows (keep lowest sort_order, then smallest id).
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(btrim(model_name))
      order by sort_order asc, id asc
    ) as rn
  from public.settings_model_options
)
delete from public.settings_model_options as m
using ranked as r
where m.id = r.id
  and r.rn > 1;

-- 2) Detach catalog rows from dealer scope.
update public.settings_model_options
set
  dealer_code = 'GLOBAL',
  model_name = btrim(regexp_replace(model_name, '\s+', ' ', 'g'))
where dealer_code is distinct from 'GLOBAL'
   or model_name is distinct from btrim(regexp_replace(model_name, '\s+', ' ', 'g'));

alter table public.settings_model_options
  alter column dealer_code set default 'GLOBAL';

alter table public.settings_model_options
  drop constraint if exists settings_model_options_dealer_model_unique;

alter table public.settings_model_options
  add constraint settings_model_options_dealer_code_global_only
  check (dealer_code = 'GLOBAL');

create unique index if not exists settings_model_options_model_name_global_unique
  on public.settings_model_options (lower(btrim(model_name)))
  where is_active = true;

comment on table public.settings_model_options is
  'Global vehicle model catalog for dropdowns and normalization. Rows are not dealer-scoped; dealer_code is fixed to GLOBAL.';

comment on column public.settings_model_options.dealer_code is
  'Legacy column retained for compatibility. Must always be GLOBAL; models apply system-wide.';

-- 3) Normalize writes and enforce GLOBAL dealer_code at row level.
create or replace function public.settings_model_options_normalize_v1()
returns trigger
language plpgsql
as $$
begin
  new.dealer_code := 'GLOBAL';
  new.model_name := btrim(regexp_replace(new.model_name, '\s+', ' ', 'g'));

  if length(new.model_name) = 0 then
    raise exception 'Model name cannot be empty';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_settings_model_options_normalize_v1 on public.settings_model_options;

create trigger trg_settings_model_options_normalize_v1
  before insert or update of model_name, dealer_code
  on public.settings_model_options
  for each row
  execute function public.settings_model_options_normalize_v1();

-- 4) Settings CRUD is global (settings module / admin), not dealer-scoped.
drop policy if exists settings_model_options_delete_v1 on public.settings_model_options;
drop policy if exists settings_model_options_insert_v1 on public.settings_model_options;
drop policy if exists settings_model_options_select_v1 on public.settings_model_options;
drop policy if exists settings_model_options_update_v1 on public.settings_model_options;

create policy settings_model_options_select_v1
  on public.settings_model_options
  for select
  to authenticated
  using (
    public.is_admin()
    or public.has_module_view('settings'::text)
  );

create policy settings_model_options_insert_v1
  on public.settings_model_options
  for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.has_module_view('settings'::text)
      and dealer_code = 'GLOBAL'
    )
  );

create policy settings_model_options_update_v1
  on public.settings_model_options
  for update
  to authenticated
  using (
    public.is_admin()
    or public.has_module_view('settings'::text)
  )
  with check (
    public.is_admin()
    or (
      public.has_module_view('settings'::text)
      and dealer_code = 'GLOBAL'
    )
  );

create policy settings_model_options_delete_v1
  on public.settings_model_options
  for delete
  to authenticated
  using (
    public.is_admin()
    or public.has_module_view('settings'::text)
  );

-- 5) Canonical read RPC for all clients (web, mobile, scripts).
create or replace function public.get_canonical_model_names()
returns table (
  model_name text,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.model_name,
    m.sort_order
  from public.settings_model_options as m
  where m.is_active = true
  order by m.sort_order asc, m.model_name asc;
$$;

comment on function public.get_canonical_model_names() is
  'Returns the global active vehicle model catalog (one row per model name).';

grant execute on function public.get_canonical_model_names() to authenticated;
grant execute on function public.get_canonical_model_names() to service_role;

commit;
