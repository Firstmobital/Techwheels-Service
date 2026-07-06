alter table public.job_card_closed_data
  add column if not exists dms_final_labour_amount numeric,
  add column if not exists dms_total_invoice_amount numeric;

comment on column public.job_card_closed_data.dms_final_labour_amount is
  'Mirrored from latest matching psf_revenue_dms.final_labour_amount by job card/location/portal.';

comment on column public.job_card_closed_data.dms_total_invoice_amount is
  'Mirrored from latest matching psf_revenue_dms.total_invoice_amount by job card/location/portal.';

create index if not exists idx_jc_closed_dms_sync_key
  on public.job_card_closed_data (upper(btrim(job_card_number)), location, portal);

create index if not exists idx_psf_revenue_dms_sync_key
  on public.psf_revenue_dms (upper(btrim(job_card_number)), location, portal, invoice_date desc, id desc);

create or replace function public.latest_psf_revenue_dms_for_job_card(
  p_job_card_number text,
  p_location text default null,
  p_portal text default null
)
returns table (
  final_labour_amount numeric,
  total_invoice_amount numeric
)
language sql
stable
as $$
  select
    d.final_labour_amount,
    d.total_invoice_amount
  from public.psf_revenue_dms d
  where upper(btrim(d.job_card_number)) = upper(btrim(p_job_card_number))
    and coalesce(btrim(d.job_card_number), '') <> ''
    and (
      coalesce(btrim(p_location), '') = ''
      or d.location = p_location
    )
    and (
      coalesce(btrim(p_portal), '') = ''
      or d.portal = p_portal
    )
  order by d.invoice_date desc nulls last, d.id desc
  limit 1
$$;

create or replace function public.apply_dms_revenue_to_job_card_closed_row()
returns trigger
language plpgsql
as $$
declare
  v_dms record;
begin
  if coalesce(btrim(NEW.job_card_number), '') = '' then
    NEW.dms_final_labour_amount := null;
    NEW.dms_total_invoice_amount := null;
    return NEW;
  end if;

  select *
    into v_dms
  from public.latest_psf_revenue_dms_for_job_card(
    NEW.job_card_number,
    NEW.location,
    NEW.portal
  );

  if found then
    NEW.dms_final_labour_amount := v_dms.final_labour_amount;
    NEW.dms_total_invoice_amount := v_dms.total_invoice_amount;
  else
    NEW.dms_final_labour_amount := null;
    NEW.dms_total_invoice_amount := null;
  end if;

  return NEW;
end;
$$;

create or replace function public.refresh_job_card_closed_dms_revenue(
  p_job_card_number text,
  p_location text default null,
  p_portal text default null
)
returns integer
language plpgsql
as $$
declare
  v_updated integer := 0;
begin
  if coalesce(btrim(p_job_card_number), '') = '' then
    return 0;
  end if;

  with target as (
    select
      jc.id,
      d.final_labour_amount,
      d.total_invoice_amount
    from public.job_card_closed_data jc
    left join lateral public.latest_psf_revenue_dms_for_job_card(
      jc.job_card_number,
      jc.location,
      jc.portal
    ) d on true
    where upper(btrim(jc.job_card_number)) = upper(btrim(p_job_card_number))
      and (
        coalesce(btrim(p_location), '') = ''
        or jc.location = p_location
      )
      and (
        coalesce(btrim(p_portal), '') = ''
        or jc.portal = p_portal
      )
  )
  update public.job_card_closed_data jc
     set dms_final_labour_amount = target.final_labour_amount,
         dms_total_invoice_amount = target.total_invoice_amount
    from target
   where jc.id = target.id
     and (
       jc.dms_final_labour_amount is distinct from target.final_labour_amount
       or jc.dms_total_invoice_amount is distinct from target.total_invoice_amount
     );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

create or replace function public.trg_refresh_job_card_closed_dms_revenue()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_job_card_closed_dms_revenue(
      OLD.job_card_number,
      OLD.location,
      OLD.portal
    );
    return OLD;
  end if;

  if tg_op = 'UPDATE'
     and (
       OLD.job_card_number is distinct from NEW.job_card_number
       or OLD.location is distinct from NEW.location
       or OLD.portal is distinct from NEW.portal
     ) then
    perform public.refresh_job_card_closed_dms_revenue(
      OLD.job_card_number,
      OLD.location,
      OLD.portal
    );
  end if;

  perform public.refresh_job_card_closed_dms_revenue(
    NEW.job_card_number,
    NEW.location,
    NEW.portal
  );

  return NEW;
end;
$$;

drop trigger if exists trg_apply_dms_revenue_to_job_card_closed_row
  on public.job_card_closed_data;

create trigger trg_apply_dms_revenue_to_job_card_closed_row
  before insert or update of job_card_number, location, portal
  on public.job_card_closed_data
  for each row
  execute function public.apply_dms_revenue_to_job_card_closed_row();

drop trigger if exists trg_refresh_job_card_closed_dms_revenue
  on public.psf_revenue_dms;

create trigger trg_refresh_job_card_closed_dms_revenue
  after insert or update of job_card_number, location, portal, invoice_date, final_labour_amount, total_invoice_amount or delete
  on public.psf_revenue_dms
  for each row
  execute function public.trg_refresh_job_card_closed_dms_revenue();

create table if not exists public.psf_revenue_dms_backfill_progress (
  id boolean primary key default true,
  last_psf_revenue_dms_id bigint not null default 0,
  updated_rows integer not null default 0,
  processed_source_rows integer not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint psf_revenue_dms_backfill_progress_singleton check (id)
);

insert into public.psf_revenue_dms_backfill_progress (id)
values (true)
on conflict (id) do nothing;

create or replace function public.backfill_job_card_closed_dms_revenue_batch(
  p_batch_size integer default 1000
)
returns table (
  processed_source_rows integer,
  updated_job_card_rows integer,
  last_psf_revenue_dms_id bigint,
  is_complete boolean
)
language plpgsql
as $$
declare
  v_start_after bigint := 0;
  v_last_id bigint := 0;
  v_processed integer := 0;
  v_updated integer := 0;
  v_total_updated integer := 0;
  v_batch_size integer := greatest(1, least(coalesce(p_batch_size, 1000), 10000));
  r record;
begin
  select p.last_psf_revenue_dms_id
    into v_start_after
  from public.psf_revenue_dms_backfill_progress p
  where p.id = true
  for update;

  for r in
    select d.id, d.job_card_number, d.location, d.portal
    from public.psf_revenue_dms d
    where d.id > v_start_after
      and coalesce(btrim(d.job_card_number), '') <> ''
    order by d.id
    limit v_batch_size
  loop
    v_processed := v_processed + 1;
    v_last_id := r.id;

    select public.refresh_job_card_closed_dms_revenue(r.job_card_number, r.location, r.portal)
      into v_updated;
    v_total_updated := v_total_updated + coalesce(v_updated, 0);
  end loop;

  update public.psf_revenue_dms_backfill_progress p
     set last_psf_revenue_dms_id = case when v_processed > 0 then v_last_id else p.last_psf_revenue_dms_id end,
         processed_source_rows = p.processed_source_rows + v_processed,
         updated_rows = p.updated_rows + v_total_updated,
         completed_at = case when v_processed = 0 then now() else null end,
         updated_at = now()
   where p.id = true;

  return query
  select
    v_processed,
    v_total_updated,
    case when v_processed > 0 then v_last_id else v_start_after end,
    v_processed = 0;
end;
$$;
