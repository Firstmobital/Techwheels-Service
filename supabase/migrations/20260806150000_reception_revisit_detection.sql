-- RECEPTION-002: Revisit detection for floor-incharge service types within 30 days.
-- When the same reg revisits reception, flag is_revisit, link prior entry,
-- and store suggested technician from the prior JC assignment.

ALTER TABLE public.service_reception_entries
  ADD COLUMN IF NOT EXISTS is_revisit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prior_reception_entry_id bigint,
  ADD COLUMN IF NOT EXISTS suggested_technician_code text,
  ADD COLUMN IF NOT EXISTS suggested_technician_name text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'service_reception_entries_prior_reception_entry_id_fkey'
  ) THEN
    ALTER TABLE public.service_reception_entries
      ADD CONSTRAINT service_reception_entries_prior_reception_entry_id_fkey
      FOREIGN KEY (prior_reception_entry_id)
      REFERENCES public.service_reception_entries(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.service_reception_entries.is_revisit IS
  'True when this intake follows a floor-incharge visit for the same reg within 30 days.';
COMMENT ON COLUMN public.service_reception_entries.prior_reception_entry_id IS
  'Prior service_reception_entries row that triggered revisit detection.';
COMMENT ON COLUMN public.service_reception_entries.suggested_technician_code IS
  'Primary technician from prior visit; used to default Floor Incharge assignment.';
COMMENT ON COLUMN public.service_reception_entries.suggested_technician_name IS
  'Display name cache for suggested_technician_code.';

CREATE INDEX IF NOT EXISTS idx_sre_revisit_prior_lookup
  ON public.service_reception_entries (
    dealer_code,
    upper(btrim(reg_number)),
    created_at DESC
  )
  WHERE service_type IN (
    'Running Repairs',
    'First Free Service',
    'Second Free Service',
    'Third Free Service',
    'Paid Service',
    'Updation',
    'E Breakdown',
    'Campaign'
  )
  AND NULLIF(btrim(jc_number), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sre_is_revisit_created
  ON public.service_reception_entries (dealer_code, is_revisit, created_at DESC)
  WHERE is_revisit = true;

CREATE OR REPLACE FUNCTION public.is_floor_incharge_service_type(p_service_type text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_service_type, '') IN (
    'Running Repairs',
    'First Free Service',
    'Second Free Service',
    'Third Free Service',
    'Paid Service',
    'Updation',
    'E Breakdown',
    'Campaign'
  );
$$;

CREATE OR REPLACE FUNCTION public.lookup_reception_revisit_prior(
  p_reg_number text,
  p_dealer_code text,
  p_exclude_entry_id bigint DEFAULT NULL
)
RETURNS TABLE (
  prior_id bigint,
  prior_sa_employee_code text,
  prior_sa_name text,
  prior_jc_number text,
  prior_service_type text,
  prior_created_at timestamptz,
  suggested_technician_code text,
  suggested_technician_name text
)
LANGUAGE sql
STABLE
AS $$
  WITH prior AS (
    SELECT
      sre.id,
      sre.sa_employee_code,
      sre.sa_name,
      sre.jc_number,
      sre.service_type,
      sre.created_at
    FROM public.service_reception_entries sre
    WHERE sre.dealer_code = p_dealer_code
      AND upper(btrim(sre.reg_number)) = upper(btrim(p_reg_number))
      AND sre.created_at >= (now() - interval '30 days')
      AND public.is_floor_incharge_service_type(sre.service_type)
      AND NULLIF(btrim(sre.jc_number), '') IS NOT NULL
      AND (p_exclude_entry_id IS NULL OR sre.id <> p_exclude_entry_id)
    ORDER BY sre.created_at DESC, sre.id DESC
    LIMIT 1
  )
  SELECT
    prior.id,
    prior.sa_employee_code,
    prior.sa_name,
    prior.jc_number,
    prior.service_type,
    prior.created_at,
    ta.technician_code,
    ta.technician_name
  FROM prior
  LEFT JOIN LATERAL (
    SELECT t.technician_code, t.technician_name
    FROM public.technician_assignments t
    WHERE upper(btrim(t.job_card_number)) = upper(btrim(prior.jc_number))
    ORDER BY t.updated_at DESC NULLS LAST, t.assigned_at DESC, t.id DESC
    LIMIT 1
  ) ta ON true;
$$;

CREATE OR REPLACE FUNCTION public.get_reception_revisit_context(
  p_reg_number text,
  p_exclude_entry_id bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dealer_code text;
  v_prior record;
BEGIN
  v_dealer_code := public.my_dealer_code();

  IF NULLIF(btrim(p_reg_number), '') IS NULL THEN
    RETURN jsonb_build_object('is_revisit', false);
  END IF;

  SELECT *
  INTO v_prior
  FROM public.lookup_reception_revisit_prior(
    p_reg_number,
    v_dealer_code,
    p_exclude_entry_id
  );

  IF NOT FOUND OR v_prior.prior_id IS NULL THEN
    RETURN jsonb_build_object('is_revisit', false);
  END IF;

  RETURN jsonb_build_object(
    'is_revisit', true,
    'prior_entry', jsonb_build_object(
      'id', v_prior.prior_id,
      'sa_employee_code', v_prior.prior_sa_employee_code,
      'sa_name', v_prior.prior_sa_name,
      'jc_number', v_prior.prior_jc_number,
      'service_type', v_prior.prior_service_type,
      'created_at', v_prior.prior_created_at
    ),
    'suggested_technician', CASE
      WHEN NULLIF(btrim(v_prior.suggested_technician_code), '') IS NULL THEN NULL
      ELSE jsonb_build_object(
        'code', v_prior.suggested_technician_code,
        'name', v_prior.suggested_technician_name
      )
    END
  );
END;
$$;

COMMENT ON FUNCTION public.get_reception_revisit_context(text, bigint) IS
  'Returns revisit context for a registration number: prior floor-incharge visit within 30 days and suggested technician. Dealer-scoped via my_dealer_code().';

CREATE OR REPLACE FUNCTION public.apply_revisit_context_on_reception()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prior record;
BEGIN
  IF NULLIF(btrim(NEW.reg_number), '') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT *
  INTO v_prior
  FROM public.lookup_reception_revisit_prior(
    NEW.reg_number,
    NEW.dealer_code,
    NEW.id
  );

  IF NOT FOUND OR v_prior.prior_id IS NULL THEN
    NEW.is_revisit := false;
    NEW.prior_reception_entry_id := NULL;
    NEW.suggested_technician_code := NULL;
    NEW.suggested_technician_name := NULL;
    RETURN NEW;
  END IF;

  NEW.is_revisit := true;
  NEW.prior_reception_entry_id := v_prior.prior_id;
  NEW.suggested_technician_code := NULLIF(btrim(v_prior.suggested_technician_code), '');
  NEW.suggested_technician_name := NULLIF(btrim(v_prior.suggested_technician_name), '');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_revisit_on_reception ON public.service_reception_entries;

CREATE TRIGGER trg_apply_revisit_on_reception
  BEFORE INSERT OR UPDATE OF reg_number
  ON public.service_reception_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_revisit_context_on_reception();

GRANT EXECUTE ON FUNCTION public.get_reception_revisit_context(text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reception_revisit_context(text, bigint) TO service_role;
