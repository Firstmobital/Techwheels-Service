-- 2026-06-08
-- Purpose: Unify dealer-scope row visibility across modules/pages.
-- Rule precedence:
--   1) If JWT dealer_codes array exists and is non-empty, use those codes.
--   2) Otherwise, fallback to active user_employee_links dealer_code mappings.
-- Contract: page access remains module-permission based; row visibility uses
--           the same dealer-scope resolution across policy families.

BEGIN;

-- -----------------------------------------------------------------------------
-- Canonical dealer-scope helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_effective_dealer_codes()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'auth', 'public'
AS $$
  WITH jwt_codes AS (
    SELECT ARRAY(
      SELECT DISTINCT upper(btrim(value))
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(auth.jwt() -> 'user_metadata' -> 'dealer_codes') = 'array'
            THEN auth.jwt() -> 'user_metadata' -> 'dealer_codes'
          WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'dealer_codes') = 'array'
            THEN auth.jwt() -> 'app_metadata' -> 'dealer_codes'
          ELSE '[]'::jsonb
        END
      ) AS t(value)
      WHERE btrim(value) <> ''
    ) AS codes
  ),
  mapped_codes AS (
    SELECT ARRAY(
      SELECT DISTINCT upper(btrim(coalesce(uel.dealer_code, '')))
      FROM public.user_employee_links uel
      WHERE uel.user_id = auth.uid()
        AND uel.is_active = true
        AND btrim(coalesce(uel.dealer_code, '')) <> ''
      ORDER BY 1
    ) AS codes
  )
  SELECT CASE
    WHEN COALESCE(array_length((SELECT codes FROM jwt_codes), 1), 0) > 0
      THEN (SELECT codes FROM jwt_codes)
    ELSE COALESCE((SELECT codes FROM mapped_codes), ARRAY[]::text[])
  END;
$$;

CREATE OR REPLACE FUNCTION public.dealer_code_in_scope(p_dealer_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(public.my_effective_dealer_codes()) AS dc(code)
    WHERE upper(btrim(coalesce(dc.code, ''))) = upper(btrim(coalesce(p_dealer_code, '')))
  );
$$;

CREATE OR REPLACE FUNCTION public.sa_code_in_scope(p_sa_employee_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.dealer_code_in_scope(split_part(coalesce(p_sa_employee_code, ''), '_', 1))
    OR public.dealer_code_in_scope(split_part(coalesce(p_sa_employee_code, ''), '_', 2));
$$;

COMMENT ON FUNCTION public.my_effective_dealer_codes() IS
'Canonical dealer scope list: JWT dealer_codes (if non-empty) else active mapping dealer codes.';

COMMENT ON FUNCTION public.dealer_code_in_scope(p_dealer_code text) IS
'Returns true if provided dealer code is within current user effective dealer scope.';

COMMENT ON FUNCTION public.sa_code_in_scope(p_sa_employee_code text) IS
'Returns true when SA employee code embeds a dealer code within current user effective dealer scope.';

-- -----------------------------------------------------------------------------
-- Service Reception + Floor Incharge aligned scope
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS service_reception_select_floor_incharge ON public.service_reception_entries;
CREATE POLICY service_reception_select_floor_incharge ON public.service_reception_entries
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('floor_incharge'::text)
    AND sa_employee_code IS NOT NULL
    AND public.user_has_floor_incharge_scope_for_sa_code(sa_employee_code)
    AND public.sa_code_in_scope(sa_employee_code)
  )
);

DROP POLICY IF EXISTS service_reception_select_rbac ON public.service_reception_entries;
CREATE POLICY service_reception_select_rbac ON public.service_reception_entries
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('reception'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

DROP POLICY IF EXISTS service_reception_insert_rbac ON public.service_reception_entries;
CREATE POLICY service_reception_insert_rbac ON public.service_reception_entries
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_modify('reception'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

DROP POLICY IF EXISTS service_reception_update_rbac ON public.service_reception_entries;
CREATE POLICY service_reception_update_rbac ON public.service_reception_entries
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_modify('reception'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_modify('reception'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

DROP POLICY IF EXISTS service_reception_delete_rbac ON public.service_reception_entries;
CREATE POLICY service_reception_delete_rbac ON public.service_reception_entries
FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_delete('reception'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

-- -----------------------------------------------------------------------------
-- Parts Orders + Settings model options dealer scope
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS service_parts_order_select_rbac_v1 ON public.service_parts_order_data;
CREATE POLICY service_parts_order_select_rbac_v1 ON public.service_parts_order_data
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('parts_orders'::text)
    AND (dealer_code IS NULL OR public.dealer_code_in_scope(dealer_code))
  )
);

DROP POLICY IF EXISTS service_parts_order_insert_rbac_v1 ON public.service_parts_order_data;
CREATE POLICY service_parts_order_insert_rbac_v1 ON public.service_parts_order_data
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_modify('parts_orders'::text)
    AND (dealer_code IS NULL OR public.dealer_code_in_scope(dealer_code))
  )
);

DROP POLICY IF EXISTS service_parts_order_update_rbac_v1 ON public.service_parts_order_data;
CREATE POLICY service_parts_order_update_rbac_v1 ON public.service_parts_order_data
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_modify('parts_orders'::text)
    AND (dealer_code IS NULL OR public.dealer_code_in_scope(dealer_code))
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_modify('parts_orders'::text)
    AND (dealer_code IS NULL OR public.dealer_code_in_scope(dealer_code))
  )
);

DROP POLICY IF EXISTS service_parts_order_delete_rbac_v1 ON public.service_parts_order_data;
CREATE POLICY service_parts_order_delete_rbac_v1 ON public.service_parts_order_data
FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_delete('parts_orders'::text)
    AND (dealer_code IS NULL OR public.dealer_code_in_scope(dealer_code))
  )
);

DROP POLICY IF EXISTS settings_model_options_select_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_select_v1 ON public.settings_model_options
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

DROP POLICY IF EXISTS settings_model_options_insert_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_insert_v1 ON public.settings_model_options
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

DROP POLICY IF EXISTS settings_model_options_update_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_update_v1 ON public.settings_model_options
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

DROP POLICY IF EXISTS settings_model_options_delete_v1 ON public.settings_model_options;
CREATE POLICY settings_model_options_delete_v1 ON public.settings_model_options
FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR (
    public.has_module_view('settings'::text)
    AND public.dealer_code_in_scope(dealer_code)
  )
);

-- -----------------------------------------------------------------------------
-- Vehicle / Job Card / AutoDoc family (own dealership policies)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "vehicles: own dealership select" ON public.vehicles;
CREATE POLICY "vehicles: own dealership select" ON public.vehicles
FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR public.dealer_code_in_scope(dealer_code)
);

DROP POLICY IF EXISTS "vehicles: own dealership insert" ON public.vehicles;
CREATE POLICY "vehicles: own dealership insert" ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin()
  OR public.dealer_code_in_scope(dealer_code)
);

DROP POLICY IF EXISTS "vehicles: own dealership update" ON public.vehicles;
CREATE POLICY "vehicles: own dealership update" ON public.vehicles
FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR public.dealer_code_in_scope(dealer_code)
)
WITH CHECK (
  public.is_admin()
  OR public.dealer_code_in_scope(dealer_code)
);

DROP POLICY IF EXISTS "job_cards: own dealership select" ON public.job_cards;
CREATE POLICY "job_cards: own dealership select" ON public.job_cards
FOR SELECT TO authenticated
USING (
  reg_number IN (
    SELECT v.reg_number
    FROM public.vehicles v
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "job_cards: own dealership insert" ON public.job_cards;
CREATE POLICY "job_cards: own dealership insert" ON public.job_cards
FOR INSERT TO authenticated
WITH CHECK (
  reg_number IN (
    SELECT v.reg_number
    FROM public.vehicles v
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "job_cards: own dealership update" ON public.job_cards;
CREATE POLICY "job_cards: own dealership update" ON public.job_cards
FOR UPDATE TO authenticated
USING (
  reg_number IN (
    SELECT v.reg_number
    FROM public.vehicles v
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
)
WITH CHECK (
  reg_number IN (
    SELECT v.reg_number
    FROM public.vehicles v
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "documents: own dealership select" ON public.documents;
CREATE POLICY "documents: own dealership select" ON public.documents
FOR SELECT TO authenticated
USING (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "documents: own dealership insert" ON public.documents;
CREATE POLICY "documents: own dealership insert" ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "estimate_rows: own dealership select" ON public.estimate_rows;
CREATE POLICY "estimate_rows: own dealership select" ON public.estimate_rows
FOR SELECT TO authenticated
USING (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "estimate_rows: own dealership insert" ON public.estimate_rows;
CREATE POLICY "estimate_rows: own dealership insert" ON public.estimate_rows
FOR INSERT TO authenticated
WITH CHECK (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "estimate_rows: own dealership update" ON public.estimate_rows;
CREATE POLICY "estimate_rows: own dealership update" ON public.estimate_rows
FOR UPDATE TO authenticated
USING (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
)
WITH CHECK (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "panel_photos: own dealership select" ON public.panel_photos;
CREATE POLICY "panel_photos: own dealership select" ON public.panel_photos
FOR SELECT TO authenticated
USING (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "panel_photos: own dealership insert" ON public.panel_photos;
CREATE POLICY "panel_photos: own dealership insert" ON public.panel_photos
FOR INSERT TO authenticated
WITH CHECK (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "panels: own dealership select" ON public.panels;
CREATE POLICY "panels: own dealership select" ON public.panels
FOR SELECT TO authenticated
USING (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "panels: own dealership insert" ON public.panels;
CREATE POLICY "panels: own dealership insert" ON public.panels
FOR INSERT TO authenticated
WITH CHECK (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "panels: own dealership update" ON public.panels;
CREATE POLICY "panels: own dealership update" ON public.panels
FOR UPDATE TO authenticated
USING (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
)
WITH CHECK (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "panels: own dealership delete" ON public.panels;
CREATE POLICY "panels: own dealership delete" ON public.panels
FOR DELETE TO authenticated
USING (
  job_card_id IN (
    SELECT jc.id
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE public.dealer_code_in_scope(v.dealer_code)
  )
);

DROP POLICY IF EXISTS "Users can view email logs for their dealer's job cards" ON public.email_logs;
CREATE POLICY "Users can view email logs for their dealer's job cards" ON public.email_logs
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.job_cards jc
    JOIN public.vehicles v ON v.reg_number = jc.reg_number
    WHERE jc.id = email_logs.job_card_id
      AND public.dealer_code_in_scope(v.dealer_code)
  )
);

COMMIT;
