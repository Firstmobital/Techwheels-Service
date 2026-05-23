-- AutoDoc dynamic labour rate cards
-- Purpose: model-wise panel labour rates (PP/PM/PS) with activatable card per city category

create table if not exists public.autodoc_rate_cards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city_category text not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  is_active boolean not null default false,
  effective_from date,
  effective_to date,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_autodoc_rate_cards_city on public.autodoc_rate_cards(city_category);
create index if not exists idx_autodoc_rate_cards_active on public.autodoc_rate_cards(city_category, is_active);

-- Ensure only one active card per city category.
create unique index if not exists uq_autodoc_rate_cards_active_city
  on public.autodoc_rate_cards(city_category)
  where is_active = true;

create table if not exists public.autodoc_panel_master (
  panel_key text primary key,
  panel_label text not null,
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.autodoc_rate_rows (
  id uuid primary key default gen_random_uuid(),
  rate_card_id uuid not null references public.autodoc_rate_cards(id) on delete cascade,
  model_name text not null,
  panel_key text not null references public.autodoc_panel_master(panel_key),
  panel_label text not null,
  pp_rate numeric(12,2),
  pm_rate numeric(12,2),
  ps_rate numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_autodoc_rate_rows unique(rate_card_id, model_name, panel_key)
);

create index if not exists idx_autodoc_rate_rows_card_model on public.autodoc_rate_rows(rate_card_id, model_name);
create index if not exists idx_autodoc_rate_rows_panel on public.autodoc_rate_rows(panel_key);

create or replace function public.autodoc_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_autodoc_rate_cards_updated_at on public.autodoc_rate_cards;
create trigger trg_autodoc_rate_cards_updated_at
before update on public.autodoc_rate_cards
for each row execute function public.autodoc_set_updated_at();

drop trigger if exists trg_autodoc_panel_master_updated_at on public.autodoc_panel_master;
create trigger trg_autodoc_panel_master_updated_at
before update on public.autodoc_panel_master
for each row execute function public.autodoc_set_updated_at();

drop trigger if exists trg_autodoc_rate_rows_updated_at on public.autodoc_rate_rows;
create trigger trg_autodoc_rate_rows_updated_at
before update on public.autodoc_rate_rows
for each row execute function public.autodoc_set_updated_at();

alter table public.autodoc_rate_cards enable row level security;
alter table public.autodoc_panel_master enable row level security;
alter table public.autodoc_rate_rows enable row level security;

-- Read access for authenticated users.
drop policy if exists autodoc_rate_cards_select on public.autodoc_rate_cards;
create policy autodoc_rate_cards_select on public.autodoc_rate_cards
for select to authenticated
using (true);

drop policy if exists autodoc_panel_master_select on public.autodoc_panel_master;
create policy autodoc_panel_master_select on public.autodoc_panel_master
for select to authenticated
using (true);

drop policy if exists autodoc_rate_rows_select on public.autodoc_rate_rows;
create policy autodoc_rate_rows_select on public.autodoc_rate_rows
for select to authenticated
using (true);

-- Admin-only writes (uses existing helper function).
drop policy if exists autodoc_rate_cards_write on public.autodoc_rate_cards;
create policy autodoc_rate_cards_write on public.autodoc_rate_cards
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists autodoc_panel_master_write on public.autodoc_panel_master;
create policy autodoc_panel_master_write on public.autodoc_panel_master
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists autodoc_rate_rows_write on public.autodoc_rate_rows;
create policy autodoc_rate_rows_write on public.autodoc_rate_rows
for all to authenticated
using (public.is_admin())
with check (public.is_admin());
