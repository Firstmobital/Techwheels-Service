-- SUPABASE-002 Phase 8: fill all_service_data.contact_phones from contact_details
-- when the target phone is NULL/blank. Match on normalized chassis_no.
-- Source gate: contact_status is Customer. Never overwrite a non-blank phone.

CREATE INDEX IF NOT EXISTS idx_contact_details_customer_chassis_norm
  ON public.contact_details (upper(btrim(chassis_no)))
  WHERE lower(btrim(COALESCE(contact_status, ''))) = 'customer'
    AND NULLIF(btrim(cell_phone_no), '') IS NOT NULL;

COMMENT ON INDEX public.idx_contact_details_customer_chassis_norm IS
  'Normalized chassis lookup for Customer contact_details rows that have a phone.';

CREATE OR REPLACE FUNCTION public.lookup_customer_phone_from_contact_details(p_chassis_key text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT NULLIF(btrim(c.cell_phone_no), '')
  FROM public.contact_details c
  WHERE NULLIF(upper(btrim(c.chassis_no)), '')
        = NULLIF(upper(btrim(COALESCE(p_chassis_key, ''))), '')
    AND lower(btrim(COALESCE(c.contact_status, ''))) = 'customer'
    AND NULLIF(btrim(c.cell_phone_no), '') IS NOT NULL
  ORDER BY c.created_at DESC NULLS LAST, c.id DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.lookup_customer_phone_from_contact_details(text) IS
  'Latest Customer contact_details.cell_phone_no for a normalized chassis. Returns NULL when no eligible source row exists.';

CREATE OR REPLACE FUNCTION public.refresh_all_service_data_from_contact_details(
  p_chassis_key text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_chassis_norm text;
  v_phone text;
BEGIN
  v_chassis_norm := NULLIF(upper(btrim(COALESCE(p_chassis_key, ''))), '');
  IF v_chassis_norm IS NULL THEN
    RETURN;
  END IF;

  v_phone := public.lookup_customer_phone_from_contact_details(v_chassis_norm);
  IF v_phone IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.all_service_data t
  SET
    contact_phones = v_phone,
    last_updated_at = now()
  WHERE upper(NULLIF(btrim(t.chassis_no), '')) = v_chassis_norm
    AND NULLIF(btrim(t.contact_phones), '') IS NULL
    AND t.contact_phones IS DISTINCT FROM v_phone;
END;
$$;

COMMENT ON FUNCTION public.refresh_all_service_data_from_contact_details(text) IS
  'Fill-null sync: write contact_details Customer phone onto matching all_service_data.contact_phones only when the target is NULL or blank.';

CREATE OR REPLACE FUNCTION public.trg_fill_all_service_data_contact_phones_from_contact_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_phone text;
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.contact_phones, '')), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NULLIF(btrim(COALESCE(NEW.chassis_no, '')), '') IS NULL THEN
    RETURN NEW;
  END IF;

  v_phone := public.lookup_customer_phone_from_contact_details(NEW.chassis_no);
  IF v_phone IS NOT NULL THEN
    NEW.contact_phones := v_phone;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fill_all_service_data_contact_phones_from_contact_details() IS
  'Before write on all_service_data: fill NEW.contact_phones from Customer contact_details when the incoming phone is NULL or blank.';

DROP TRIGGER IF EXISTS trg_fill_all_service_data_contact_phones_from_contact_details
  ON public.all_service_data;

CREATE TRIGGER trg_fill_all_service_data_contact_phones_from_contact_details
  BEFORE INSERT OR UPDATE OF chassis_no, contact_phones
  ON public.all_service_data
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fill_all_service_data_contact_phones_from_contact_details();

CREATE OR REPLACE FUNCTION public.trg_refresh_all_service_data_from_contact_details()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_all_service_data_from_contact_details(OLD.chassis_no);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.chassis_no IS DISTINCT FROM NEW.chassis_no THEN
    PERFORM public.refresh_all_service_data_from_contact_details(OLD.chassis_no);
  END IF;

  PERFORM public.refresh_all_service_data_from_contact_details(NEW.chassis_no);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_refresh_all_service_data_from_contact_details() IS
  'After write on contact_details, fill matching all_service_data.contact_phones when that target phone is NULL or blank. Delete does not clear target phones.';

DROP TRIGGER IF EXISTS trg_refresh_all_service_data_from_contact_details
  ON public.contact_details;

CREATE TRIGGER trg_refresh_all_service_data_from_contact_details
  AFTER INSERT OR DELETE OR UPDATE OF chassis_no, cell_phone_no, contact_status
  ON public.contact_details
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_refresh_all_service_data_from_contact_details();

CREATE OR REPLACE FUNCTION public.reconcile_all_service_data_from_contact_details_chunked(
  p_limit integer DEFAULT 1000
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_limit integer := GREATEST(1, COALESCE(p_limit, 1000));
  v_rows integer := 0;
BEGIN
  UPDATE public.all_service_data t
  SET
    contact_phones = s.phone,
    last_updated_at = now()
  FROM (
    SELECT t2.id, w.phone
    FROM (
      SELECT DISTINCT ON (upper(btrim(c.chassis_no)))
        upper(btrim(c.chassis_no)) AS chassis_norm,
        NULLIF(btrim(c.cell_phone_no), '') AS phone
      FROM public.contact_details c
      WHERE lower(btrim(COALESCE(c.contact_status, ''))) = 'customer'
        AND NULLIF(btrim(c.cell_phone_no), '') IS NOT NULL
        AND NULLIF(upper(btrim(c.chassis_no)), '') IS NOT NULL
      ORDER BY upper(btrim(c.chassis_no)), c.created_at DESC NULLS LAST, c.id DESC
    ) w
    JOIN public.all_service_data t2
      ON upper(NULLIF(btrim(t2.chassis_no), '')) = w.chassis_norm
    WHERE NULLIF(btrim(t2.contact_phones), '') IS NULL
      AND t2.contact_phones IS DISTINCT FROM w.phone
    ORDER BY t2.id
    LIMIT v_limit
  ) s
  WHERE t.id = s.id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.reconcile_all_service_data_from_contact_details_chunked(integer) IS
  'Timeout-safe fill-null backfill: update up to N all_service_data rows whose contact_phones is NULL/blank from the latest Customer contact_details phone on the same chassis.';

REVOKE ALL ON FUNCTION public.lookup_customer_phone_from_contact_details(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_all_service_data_from_contact_details(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_fill_all_service_data_contact_phones_from_contact_details() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.trg_refresh_all_service_data_from_contact_details() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_all_service_data_from_contact_details_chunked(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.lookup_customer_phone_from_contact_details(text)
  TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_all_service_data_from_contact_details(text)
  TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.trg_fill_all_service_data_contact_phones_from_contact_details()
  TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.trg_refresh_all_service_data_from_contact_details()
  TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_all_service_data_from_contact_details_chunked(integer)
  TO postgres, service_role;

-- One-shot historical fill (idempotent: only NULL/blank target phones).
UPDATE public.all_service_data t
SET
  contact_phones = w.phone,
  last_updated_at = now()
FROM (
  SELECT DISTINCT ON (upper(btrim(c.chassis_no)))
    upper(btrim(c.chassis_no)) AS chassis_norm,
    NULLIF(btrim(c.cell_phone_no), '') AS phone
  FROM public.contact_details c
  WHERE lower(btrim(COALESCE(c.contact_status, ''))) = 'customer'
    AND NULLIF(btrim(c.cell_phone_no), '') IS NOT NULL
    AND NULLIF(upper(btrim(c.chassis_no)), '') IS NOT NULL
  ORDER BY upper(btrim(c.chassis_no)), c.created_at DESC NULLS LAST, c.id DESC
) w
WHERE upper(NULLIF(btrim(t.chassis_no), '')) = w.chassis_norm
  AND NULLIF(btrim(t.contact_phones), '') IS NULL
  AND t.contact_phones IS DISTINCT FROM w.phone;
