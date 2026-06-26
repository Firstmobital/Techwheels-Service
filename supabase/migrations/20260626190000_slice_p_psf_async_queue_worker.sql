begin;

create or replace function public.enqueue_psf_import_run(
  p_branch_slot text,
  p_source_file_name text,
  p_rows jsonb
)
returns table (
  import_run_id bigint,
  status text,
  total_rows integer,
  staged_rows integer,
  error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id bigint;
  v_total_rows integer := 0;
  v_staged_rows integer := 0;
begin
  v_total_rows := coalesce(jsonb_array_length(coalesce(p_rows, '[]'::jsonb)), 0);

  insert into public.psf_import_runs (
    status,
    branch_slot,
    source_file_name,
    total_rows,
    started_at,
    completed_at,
    error_message
  )
  values (
    'queued',
    p_branch_slot,
    p_source_file_name,
    v_total_rows,
    null,
    null,
    null
  )
  returning id into v_run_id;

  if v_total_rows > 0 then
    insert into public.psf_import_staging (
      import_run_id,
      row_number,
      branch,
      branch_label,
      location,
      portal,
      invoice_date,
      job_card_number,
      sr_type,
      chassis_number,
      final_labour_amount,
      final_spares_amount,
      total_invoice_amount,
      parent_product_line,
      product_line,
      created_date_time,
      closed_date_time,
      first_name,
      last_name,
      sr_assigned_to,
      employee_code,
      vehicle_registration_number,
      vehicle_sale_date,
      account_phone_number,
      lubs_revenue,
      kms_run,
      last_service_km,
      last_service_date,
      source_row
    )
    select
      v_run_id,
      src.ordinality::integer,
      nullif(btrim(src.row ->> 'branch'), ''),
      nullif(btrim(src.row ->> 'branch_label'), ''),
      nullif(btrim(src.row ->> 'location'), ''),
      public.psf_normalize_portal(src.row ->> 'portal'),
      public.psf_try_date(src.row ->> 'invoice_date'),
      nullif(upper(btrim(src.row ->> 'job_card_number')), ''),
      nullif(btrim(src.row ->> 'sr_type'), ''),
      nullif(upper(btrim(src.row ->> 'chassis_number')), ''),
      public.psf_try_numeric(src.row ->> 'final_labour_amount'),
      public.psf_try_numeric(src.row ->> 'final_spares_amount'),
      public.psf_try_numeric(src.row ->> 'total_invoice_amount'),
      nullif(btrim(src.row ->> 'parent_product_line'), ''),
      nullif(btrim(src.row ->> 'product_line'), ''),
      public.psf_try_timestamptz(src.row ->> 'created_date_time'),
      public.psf_try_timestamptz(src.row ->> 'closed_date_time'),
      nullif(btrim(src.row ->> 'first_name'), ''),
      nullif(btrim(src.row ->> 'last_name'), ''),
      nullif(btrim(src.row ->> 'sr_assigned_to'), ''),
      nullif(upper(btrim(src.row ->> 'employee_code')), ''),
      nullif(upper(btrim(src.row ->> 'vehicle_registration_number')), ''),
      public.psf_try_date(src.row ->> 'vehicle_sale_date'),
      nullif(btrim(src.row ->> 'account_phone_number'), ''),
      public.psf_try_numeric(src.row ->> 'lubs_revenue'),
      public.psf_try_numeric(src.row ->> 'kms_run'),
      public.psf_try_numeric(src.row ->> 'last_service_km'),
      public.psf_try_date(src.row ->> 'last_service_date'),
      src.row
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) with ordinality as src(row, ordinality);
  end if;

  select count(*) into v_staged_rows
  from public.psf_import_staging s
  where s.import_run_id = v_run_id;

  update public.psf_import_runs
  set staged_rows = v_staged_rows
  where id = v_run_id;

  return query
  select
    v_run_id,
    'queued'::text,
    v_total_rows,
    v_staged_rows,
    null::text;
exception
  when others then
    if v_run_id is not null then
      update public.psf_import_runs
      set
        status = 'failed',
        error_message = sqlerrm,
        completed_at = now()
      where id = v_run_id;
    end if;

    return query
    select
      coalesce(v_run_id, 0),
      'failed'::text,
      coalesce(v_total_rows, 0),
      coalesce(v_staged_rows, 0),
      sqlerrm;
end;
$$;

create or replace function public.process_psf_import_run(
  p_import_run_id bigint
)
returns table (
  import_run_id bigint,
  status text,
  total_rows integer,
  staged_rows integer,
  valid_rows integer,
  inserted_rows integer,
  updated_rows integer,
  skipped_rows integer,
  rejected_rows integer,
  error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id bigint := p_import_run_id;
  v_total_rows integer := 0;
  v_staged_rows integer := 0;
  v_valid_rows integer := 0;
  v_inserted_rows integer := 0;
  v_updated_rows integer := 0;
  v_skipped_rows integer := 0;
  v_rejected_rows integer := 0;
begin
  if v_run_id is null then
    raise exception 'import_run_id is required';
  end if;

  update public.psf_import_runs
  set
    status = 'running',
    started_at = coalesce(started_at, now()),
    completed_at = null,
    error_message = null
  where id = v_run_id
    and public.psf_import_runs.status in ('queued', 'running');

  select r.total_rows
  into v_total_rows
  from public.psf_import_runs r
  where r.id = v_run_id;

  if v_total_rows is null then
    raise exception 'psf_import_runs id % not found', v_run_id;
  end if;

  select count(*) into v_staged_rows
  from public.psf_import_staging s
  where s.import_run_id = v_run_id;

  with staged as (
    select
      s.*,
      nullif(btrim(em.location), '') as em_location,
      public.psf_normalize_portal(em.fuel_type) as em_portal,
      coalesce(
        nullif(btrim(em.location), ''),
        public.psf_fallback_location(s.employee_code),
        nullif(btrim(s.location), '')
      ) as resolved_location,
      coalesce(
        public.psf_normalize_portal(em.fuel_type),
        public.psf_fallback_portal(s.employee_code),
        public.psf_normalize_portal(s.portal)
      ) as resolved_portal
    from public.psf_import_staging s
    left join public.employee_master em
      on upper(btrim(coalesce(em.employee_code, ''))) = upper(btrim(coalesce(s.employee_code, '')))
    where s.import_run_id = v_run_id
  ),
  valid_dedup as (
    select distinct on (
      upper(btrim(coalesce(resolved_location, ''))),
      upper(btrim(coalesce(resolved_portal, ''))),
      upper(btrim(coalesce(job_card_number, ''))),
      invoice_date
    )
      *
    from staged
    where
      resolved_location is not null and btrim(resolved_location) <> ''
      and resolved_portal in ('PV', 'EV')
      and job_card_number is not null and btrim(job_card_number) <> ''
      and invoice_date is not null
    order by
      upper(btrim(coalesce(resolved_location, ''))),
      upper(btrim(coalesce(resolved_portal, ''))),
      upper(btrim(coalesce(job_card_number, ''))),
      invoice_date,
      row_number desc
  ),
  existing as (
    select
      v.id as staging_id,
      t.id as target_id,
      (
        t.branch is distinct from v.resolved_location
        or t.branch_label is distinct from v.resolved_location
        or t.location is distinct from v.resolved_location
        or t.portal is distinct from v.resolved_portal
        or t.sr_type is distinct from v.sr_type
        or t.chassis_number is distinct from v.chassis_number
        or t.final_labour_amount is distinct from v.final_labour_amount
        or t.final_spares_amount is distinct from v.final_spares_amount
        or t.total_invoice_amount is distinct from v.total_invoice_amount
        or t.parent_product_line is distinct from v.parent_product_line
        or t.product_line is distinct from v.product_line
        or t.created_date_time is distinct from v.created_date_time
        or t.closed_date_time is distinct from v.closed_date_time
        or t.first_name is distinct from v.first_name
        or t.last_name is distinct from v.last_name
        or t.sr_assigned_to is distinct from v.sr_assigned_to
        or t.employee_code is distinct from v.employee_code
        or t.vehicle_registration_number is distinct from v.vehicle_registration_number
        or t.vehicle_sale_date is distinct from v.vehicle_sale_date
        or t.account_phone_number is distinct from v.account_phone_number
        or t.lubs_revenue is distinct from v.lubs_revenue
        or t.kms_run is distinct from v.kms_run
        or t.last_service_km is distinct from v.last_service_km
        or t.last_service_date is distinct from v.last_service_date
      ) as needs_update
    from valid_dedup v
    join public.job_card_closed_data t
      on t.location = v.resolved_location
      and t.portal = v.resolved_portal
      and upper(btrim(t.job_card_number)) = upper(btrim(v.job_card_number))
      and t.invoice_date = v.invoice_date
  ),
  do_update as (
    update public.job_card_closed_data t
    set
      branch = v.resolved_location,
      branch_label = v.resolved_location,
      location = v.resolved_location,
      portal = v.resolved_portal,
      job_card_number = v.job_card_number,
      sr_type = v.sr_type,
      chassis_number = v.chassis_number,
      final_labour_amount = v.final_labour_amount,
      final_spares_amount = v.final_spares_amount,
      total_invoice_amount = v.total_invoice_amount,
      parent_product_line = v.parent_product_line,
      product_line = v.product_line,
      created_date_time = v.created_date_time,
      closed_date_time = v.closed_date_time,
      invoice_date = v.invoice_date,
      first_name = v.first_name,
      last_name = v.last_name,
      sr_assigned_to = v.sr_assigned_to,
      employee_code = v.employee_code,
      vehicle_registration_number = v.vehicle_registration_number,
      vehicle_sale_date = v.vehicle_sale_date,
      account_phone_number = v.account_phone_number,
      lubs_revenue = v.lubs_revenue,
      kms_run = v.kms_run,
      last_service_km = v.last_service_km,
      last_service_date = v.last_service_date
    from valid_dedup v
    join existing e
      on e.staging_id = v.id
    where
      e.target_id = t.id
      and e.needs_update
    returning t.id
  ),
  do_insert as (
    insert into public.job_card_closed_data (
      branch,
      branch_label,
      location,
      portal,
      job_card_number,
      sr_type,
      chassis_number,
      final_labour_amount,
      final_spares_amount,
      total_invoice_amount,
      parent_product_line,
      product_line,
      created_date_time,
      closed_date_time,
      invoice_date,
      first_name,
      last_name,
      sr_assigned_to,
      employee_code,
      vehicle_registration_number,
      vehicle_sale_date,
      account_phone_number,
      lubs_revenue,
      kms_run,
      last_service_km,
      last_service_date
    )
    select
      v.resolved_location,
      v.resolved_location,
      v.resolved_location,
      v.resolved_portal,
      v.job_card_number,
      v.sr_type,
      v.chassis_number,
      v.final_labour_amount,
      v.final_spares_amount,
      v.total_invoice_amount,
      v.parent_product_line,
      v.product_line,
      v.created_date_time,
      v.closed_date_time,
      v.invoice_date,
      v.first_name,
      v.last_name,
      v.sr_assigned_to,
      v.employee_code,
      v.vehicle_registration_number,
      v.vehicle_sale_date,
      v.account_phone_number,
      v.lubs_revenue,
      v.kms_run,
      v.last_service_km,
      v.last_service_date
    from valid_dedup v
    left join existing e
      on e.staging_id = v.id
    where e.staging_id is null
    returning id
  )
  select
    (select count(*) from valid_dedup),
    (select count(*) from do_insert),
    (select count(*) from do_update),
    (select count(*) from existing where not needs_update)
  into
    v_valid_rows,
    v_inserted_rows,
    v_updated_rows,
    v_skipped_rows;

  v_rejected_rows := greatest(v_staged_rows - v_valid_rows, 0);

  delete from public.psf_import_staging s
  where s.import_run_id = v_run_id;

  update public.psf_import_runs
  set
    status = 'completed',
    staged_rows = v_staged_rows,
    valid_rows = v_valid_rows,
    inserted_rows = v_inserted_rows,
    updated_rows = v_updated_rows,
    skipped_rows = v_skipped_rows,
    rejected_rows = v_rejected_rows,
    completed_at = now(),
    error_message = null
  where id = v_run_id;

  insert into public.import_metadata (table_name, last_updated_at)
  values ('job_card_closed_data', now())
  on conflict (table_name)
  do update set last_updated_at = excluded.last_updated_at;

  return query
  select
    v_run_id,
    'completed'::text,
    v_total_rows,
    v_staged_rows,
    v_valid_rows,
    v_inserted_rows,
    v_updated_rows,
    v_skipped_rows,
    v_rejected_rows,
    null::text;
exception
  when others then
    if v_run_id is not null then
      update public.psf_import_runs
      set
        status = 'failed',
        error_message = sqlerrm,
        completed_at = now()
      where id = v_run_id;
    end if;

    return query
    select
      coalesce(v_run_id, 0),
      'failed'::text,
      coalesce(v_total_rows, 0),
      coalesce(v_staged_rows, 0),
      coalesce(v_valid_rows, 0),
      coalesce(v_inserted_rows, 0),
      coalesce(v_updated_rows, 0),
      coalesce(v_skipped_rows, 0),
      coalesce(v_rejected_rows, 0),
      sqlerrm;
end;
$$;

create or replace function public.process_next_psf_import_run()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id bigint;
begin
  select r.id
  into v_run_id
  from public.psf_import_runs r
  where r.status = 'queued'
  order by r.id asc
  for update skip locked
  limit 1;

  if v_run_id is null then
    return null;
  end if;

  perform public.process_psf_import_run(v_run_id);
  return v_run_id;
end;
$$;

grant execute on function public.enqueue_psf_import_run(text, text, jsonb) to authenticated;
grant execute on function public.process_psf_import_run(bigint) to service_role;
grant execute on function public.process_next_psf_import_run() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1
      from cron.job
      where jobname = 'psf-import-queue-worker-v1'
    ) then
      perform cron.schedule(
        'psf-import-queue-worker-v1',
        '* * * * *',
        'select public.process_next_psf_import_run();'
      );
    end if;
  end if;
exception
  when others then
    -- Do not block migration if cron metadata access is restricted in this environment.
    null;
end;
$$;

commit;
