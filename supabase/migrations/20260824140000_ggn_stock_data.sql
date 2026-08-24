-- PARTS-001 / DBL-0025
-- GGN Stock warehouse snapshot + parts_requests match/display columns.
-- Reversible: DROP TABLE ggn_stock_data; DROP the new columns and helper functions.
-- Execution: apply in SQL editor / supabase db push on the preview project first.

-- 1) Warehouse snapshot (Plant 4770). Free Stock may be negative.
CREATE TABLE IF NOT EXISTS public.ggn_stock_data (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  part_number text NOT NULL,
  part_description text,
  plant text,
  storage_location text,
  free_stock numeric NOT NULL,
  source_file_name text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by uuid,
  source_row_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ggn_stock_data_part_number_key UNIQUE (part_number)
);

COMMENT ON TABLE public.ggn_stock_data IS
  'Latest GGN (Plant 4770) stock report. Replaced on each Import → Parts Reports → GGN Stock upload. Column P Free Stock drives Available / Not Available.';

COMMENT ON COLUMN public.ggn_stock_data.part_number IS 'Normalized Material (column A).';
COMMENT ON COLUMN public.ggn_stock_data.free_stock IS 'Column P Free Stock. May be negative. > 0 = Available; <= 0 = Not Available.';

CREATE INDEX IF NOT EXISTS idx_ggn_stock_data_part_number
  ON public.ggn_stock_data USING btree (part_number);

ALTER TABLE public.ggn_stock_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_unrestricted_all_ops_v1 ON public.ggn_stock_data;
CREATE POLICY admin_unrestricted_all_ops_v1 ON public.ggn_stock_data
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ggn_stock_select_rbac_v1 ON public.ggn_stock_data;
CREATE POLICY ggn_stock_select_rbac_v1 ON public.ggn_stock_data
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_module_view('parts_inventory')
    OR public.has_module_view('parts_spm')
    OR public.has_module_view('job_cards')
  );

DROP POLICY IF EXISTS ggn_stock_insert_rbac_v1 ON public.ggn_stock_data;
CREATE POLICY ggn_stock_insert_rbac_v1 ON public.ggn_stock_data
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.has_module_modify('parts_inventory')
    OR public.has_module_modify('job_cards')
  );

DROP POLICY IF EXISTS ggn_stock_update_rbac_v1 ON public.ggn_stock_data;
CREATE POLICY ggn_stock_update_rbac_v1 ON public.ggn_stock_data
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.has_module_modify('parts_inventory')
    OR public.has_module_modify('job_cards')
  )
  WITH CHECK (
    public.is_admin()
    OR public.has_module_modify('parts_inventory')
    OR public.has_module_modify('job_cards')
  );

DROP POLICY IF EXISTS ggn_stock_delete_rbac_v1 ON public.ggn_stock_data;
CREATE POLICY ggn_stock_delete_rbac_v1 ON public.ggn_stock_data
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.has_module_delete('parts_inventory')
    OR public.has_module_modify('job_cards')
    OR public.has_module_modify('parts_inventory')
  );

GRANT ALL ON TABLE public.ggn_stock_data TO authenticated;
GRANT ALL ON TABLE public.ggn_stock_data TO service_role;
GRANT ALL ON SEQUENCE public.ggn_stock_data_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ggn_stock_data_id_seq TO service_role;

-- 2) Request display + GGN status columns
ALTER TABLE public.parts_requests
  ADD COLUMN IF NOT EXISTS matched_order_number text,
  ADD COLUMN IF NOT EXISTS matched_order_status_label text,
  ADD COLUMN IF NOT EXISTS ggn_stock_status text;

ALTER TABLE public.parts_requests
  DROP CONSTRAINT IF EXISTS parts_requests_ggn_stock_status_check;

ALTER TABLE public.parts_requests
  ADD CONSTRAINT parts_requests_ggn_stock_status_check
  CHECK (ggn_stock_status IS NULL OR ggn_stock_status = ANY (ARRAY['Available'::text, 'Not Available'::text]));

COMMENT ON COLUMN public.parts_requests.matched_order_number IS
  'Auto Order No. from a date-valid Order Sheet row (sap_order_number then crm_order_number). SPM parts_order_number overrides this in the UI.';
COMMENT ON COLUMN public.parts_requests.matched_order_status_label IS
  'Order Status display label from the date-valid Order Sheet row (Dispatched / Invoiced / Challan / Confirmed / Order Pending).';
COMMENT ON COLUMN public.parts_requests.ggn_stock_status IS
  'GGN warehouse availability from ggn_stock_data.free_stock. NULL = No Data.';

-- 3) Lookup helper (SECURITY DEFINER so advisor RPCs can read GGN without table SELECT)
CREATE OR REPLACE FUNCTION public.ggn_stock_status_for_part(p_part_number text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_pn text := upper(replace(btrim(coalesce(p_part_number, '')), ' ', ''));
  v_qty numeric;
begin
  if v_pn = '' then
    return null;
  end if;

  select free_stock into v_qty
  from public.ggn_stock_data
  where part_number = v_pn;

  if not found then
    return null;
  end if;

  if v_qty > 0 then
    return 'Available';
  end if;

  return 'Not Available';
end;
$$;

GRANT EXECUTE ON FUNCTION public.ggn_stock_status_for_part(text) TO authenticated, service_role;

-- 4) Refresh all request GGN badges after a sheet upload. Does not flip advisor_seen.
CREATE OR REPLACE FUNCTION public.refresh_parts_requests_ggn_stock()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_updated integer := 0;
begin
  if not (
    public.is_admin()
    or public.has_module_modify('parts_inventory')
    or public.has_module_modify('job_cards')
    or public.has_module_modify('parts_spm')
  ) then
    raise exception 'Insufficient permissions';
  end if;

  update public.parts_requests pr
  set ggn_stock_status = public.ggn_stock_status_for_part(pr.parts_number)
  where coalesce(btrim(pr.parts_number), '') <> '';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  return v_updated;
end;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_parts_requests_ggn_stock() TO authenticated, service_role;

-- 5) Stamp GGN status on create
CREATE OR REPLACE FUNCTION public.parts_request_create(
  p_registration_number text,
  p_parts_required text,
  p_parts_description text DEFAULT NULL::text,
  p_advisor_remarks text DEFAULT NULL::text,
  p_entry_date date DEFAULT NULL::date,
  p_parts_number text DEFAULT NULL::text,
  p_job_card_number text DEFAULT NULL::text,
  p_customer_name text DEFAULT NULL::text,
  p_vehicle_model text DEFAULT NULL::text,
  p_customer_mobile text DEFAULT NULL::text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_advisor_name    text;
  v_employee_code   text;
  v_dealer_code     text;
  v_branch          text;
  v_vehicle_type    text;
  v_job_card_number text;
  v_customer_name   text;
  v_vehicle_model   text;
  v_customer_mobile text;
  v_new_id          bigint;
  v_reg             text    := btrim(coalesce(p_registration_number, ''));
  v_parts_required  text    := btrim(coalesce(p_parts_required, ''));
  v_parts_number    text    := nullif(btrim(coalesce(p_parts_number, '')), '');
  v_search_term     text;
  v_parts_qty       numeric;
  v_distinct_matches int;
  v_ggn_status      text;
begin
  if v_reg = '' then raise exception 'Registration number is required'; end if;
  if v_parts_required = '' then raise exception 'Parts required is required'; end if;

  select uel.employee_code, uel.dealer_code
  into v_employee_code, v_dealer_code
  from public.user_employee_links uel
  where uel.user_id = auth.uid() and uel.is_active = true
  order by uel.is_primary desc, uel.updated_at desc limit 1;

  select em.employee_name, em.location
  into v_advisor_name, v_branch
  from public.employee_master em
  where em.employee_code = v_employee_code;

  if v_advisor_name is null then
    select coalesce(u.full_name, auth.jwt()->>'email') into v_advisor_name
    from public.users u where u.id = auth.uid();
  end if;
  v_advisor_name := coalesce(v_advisor_name, 'Unknown');

  declare
    r_vehicle_type    text; r_job_card_number text;
    r_customer_name   text; r_vehicle_model   text; r_customer_mobile text;
  begin
    select sre.portal, sre.jc_number, sre.owner_name, sre.model, sre.owner_phone
    into r_vehicle_type, r_job_card_number, r_customer_name, r_vehicle_model, r_customer_mobile
    from public.service_reception_entries sre
    where upper(btrim(sre.reg_number)) = upper(v_reg)
    order by sre.created_at desc limit 1;

    v_vehicle_type    := r_vehicle_type;
    v_job_card_number := coalesce(nullif(btrim(coalesce(p_job_card_number,  '')), ''), r_job_card_number);
    v_customer_name   := coalesce(nullif(btrim(coalesce(p_customer_name,    '')), ''), r_customer_name);
    v_vehicle_model   := coalesce(nullif(btrim(coalesce(p_vehicle_model,    '')), ''), r_vehicle_model);
    v_customer_mobile := coalesce(nullif(btrim(coalesce(p_customer_mobile,  '')), ''), r_customer_mobile);
  end;

  if v_parts_number is not null then
    select sum(on_hand_quantity) into v_parts_qty
    from public.service_parts_stock_snapshot_data
    where upper(replace(part_number,' ','')) = upper(replace(v_parts_number,' ',''));
  else
    v_search_term := nullif(btrim(coalesce(p_parts_description, '')), '');
    if v_search_term is null then v_search_term := v_parts_required; end if;
    select count(distinct part_number) into v_distinct_matches
    from public.service_parts_stock_snapshot_data
    where part_description ilike ('%' || v_search_term || '%');
    if v_distinct_matches = 1 then
      select sum(on_hand_quantity) into v_parts_qty
      from public.service_parts_stock_snapshot_data
      where part_description ilike ('%' || v_search_term || '%');
    end if;
  end if;

  if v_parts_number is not null and v_reg <> '' and v_parts_required <> '' then
    v_ggn_status := public.ggn_stock_status_for_part(v_parts_number);
  end if;

  insert into public.parts_requests (
    dealer_code, advisor_user_id, advisor_employee_code, advisor_name, branch,
    entry_date, registration_number, parts_required, parts_description, advisor_remarks,
    vehicle_type, parts_qty, parts_number, job_card_number, customer_name, vehicle_model,
    customer_mobile, ggn_stock_status
  ) values (
    v_dealer_code, auth.uid(), v_employee_code, v_advisor_name, v_branch,
    coalesce(p_entry_date, (now() at time zone 'Asia/Kolkata')::date),
    v_reg, v_parts_required,
    nullif(btrim(coalesce(p_parts_description,'')), ''),
    nullif(btrim(coalesce(p_advisor_remarks,  '')), ''),
    v_vehicle_type, v_parts_qty, v_parts_number,
    v_job_card_number, v_customer_name, v_vehicle_model, v_customer_mobile,
    v_ggn_status
  ) returning id into v_new_id;

  return v_new_id;
end;
$$;

GRANT EXECUTE ON FUNCTION public.parts_request_create(text, text, text, text, date, text, text, text, text, text)
  TO anon, authenticated, service_role;

-- 6) Stamp GGN status on advisor field updates
CREATE OR REPLACE FUNCTION public.parts_request_update_advisor_fields(
  p_id bigint,
  p_registration_number text,
  p_parts_required text,
  p_parts_description text DEFAULT NULL::text,
  p_advisor_remarks text DEFAULT NULL::text,
  p_entry_date date DEFAULT NULL::date,
  p_parts_number text DEFAULT NULL::text,
  p_customer_mobile text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_owner           uuid;
  v_current_status  text;
  v_reg             text := btrim(coalesce(p_registration_number, ''));
  v_parts_required  text := btrim(coalesce(p_parts_required, ''));
  v_vehicle_type    text; v_job_card_number text;
  v_customer_name   text; v_vehicle_model   text; v_customer_mobile text;
  v_parts_number    text;
begin
  select advisor_user_id, parts_status into v_owner, v_current_status
  from public.parts_requests where id = p_id;

  if v_owner is null then raise exception 'Parts request not found: %', p_id; end if;
  if not (v_owner = auth.uid() or public.is_admin()) then raise exception 'Insufficient permissions'; end if;
  if v_current_status = 'Done' and not public.is_admin() then
    raise exception 'This request is marked Done and can no longer be edited';
  end if;
  if v_reg = '' then raise exception 'Registration number is required'; end if;
  if v_parts_required = '' then raise exception 'Parts required is required'; end if;

  select sre.portal, sre.jc_number, sre.owner_name, sre.model, sre.owner_phone
  into v_vehicle_type, v_job_card_number, v_customer_name, v_vehicle_model, v_customer_mobile
  from public.service_reception_entries sre
  where upper(btrim(sre.reg_number)) = upper(v_reg)
  order by sre.created_at desc limit 1;

  v_customer_mobile := coalesce(
    nullif(btrim(coalesce(p_customer_mobile, '')), ''),
    v_customer_mobile
  );

  v_parts_number := coalesce(nullif(btrim(coalesce(p_parts_number,'')), ''), (
    select parts_number from public.parts_requests where id = p_id
  ));

  update public.parts_requests
  set registration_number = v_reg,
      parts_required      = v_parts_required,
      parts_description   = nullif(btrim(coalesce(p_parts_description, '')), ''),
      advisor_remarks     = nullif(btrim(coalesce(p_advisor_remarks,   '')), ''),
      entry_date          = coalesce(p_entry_date, entry_date),
      vehicle_type        = coalesce(v_vehicle_type,    vehicle_type),
      job_card_number     = coalesce(v_job_card_number, job_card_number),
      customer_name       = coalesce(v_customer_name,   customer_name),
      vehicle_model       = coalesce(v_vehicle_model,   vehicle_model),
      customer_mobile     = coalesce(v_customer_mobile, customer_mobile),
      parts_number        = coalesce(nullif(btrim(coalesce(p_parts_number,'')), ''), parts_number),
      ggn_stock_status    = public.ggn_stock_status_for_part(v_parts_number)
  where id = p_id;
end;
$$;

GRANT EXECUTE ON FUNCTION public.parts_request_update_advisor_fields(bigint, text, text, text, text, date, text, text)
  TO anon, authenticated, service_role;

-- 7) SPM update: refresh GGN when part number changes; do not overwrite auto order fields here
CREATE OR REPLACE FUNCTION public.parts_request_spm_update(
  p_id bigint,
  p_parts_number text,
  p_parts_order_date date,
  p_parts_status text,
  p_spm_remarks text,
  p_parts_qty numeric DEFAULT NULL::numeric,
  p_parts_order_number text DEFAULT NULL::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_status text := btrim(coalesce(p_parts_status, ''));
  v_parts_number text := nullif(btrim(coalesce(p_parts_number, '')), '');
begin
  if not (public.is_admin() or public.has_module_modify('parts_spm')) then
    raise exception 'Insufficient permissions';
  end if;

  if v_status = '' then
    raise exception 'Parts status is required';
  end if;

  if v_status not in (
    'Pending', 'Ordered', 'Back Order', 'In Transit',
    'Received', 'Partially Received', 'Cancelled', 'Delivered to Workshop',
    'Ready', 'Done'
  ) then
    raise exception 'Invalid parts status: %', v_status;
  end if;

  update public.parts_requests
  set parts_number = v_parts_number,
      parts_order_date = p_parts_order_date,
      parts_status = v_status,
      spm_remarks = nullif(btrim(coalesce(p_spm_remarks, '')), ''),
      parts_qty = coalesce(p_parts_qty, parts_qty),
      parts_order_number = nullif(btrim(coalesce(p_parts_order_number, '')), ''),
      ggn_stock_status = public.ggn_stock_status_for_part(v_parts_number),
      status_updated_at = now(),
      advisor_seen = false
  where id = p_id;
end;
$$;

GRANT EXECUTE ON FUNCTION public.parts_request_spm_update(bigint, text, date, text, text, numeric, text)
  TO anon, authenticated, service_role;
