-- Insurance renews annually off the vehicle's sale-date anniversary, not a
-- fixed calendar date (e.g. sold 24-Jan-2025 -> due 23-Jan-2026 -> 23-Jan-2027, ...).
-- last_insurance_expiry_date is the preferred due-date source since it reflects
-- the most recent actual policy, but it is not populated for every record.
-- Where it is null, fall back to a due date derived from vehicle_sale_date,
-- rolled forward year over year to whichever upcoming anniversary applies
-- (not just the first renewal).

CREATE OR REPLACE FUNCTION public.insurance_next_due_date(
  p_sale_date date,
  p_as_of date DEFAULT CURRENT_DATE
)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_candidate date;
BEGIN
  IF p_sale_date IS NULL OR p_as_of IS NULL THEN
    RETURN NULL;
  END IF;

  -- First renewal is due the day before the 1-year sale anniversary
  -- (sold 24-Jan-2025 -> due 23-Jan-2026), then every year after that.
  v_candidate := (p_sale_date + INTERVAL '1 year' - INTERVAL '1 day')::date;

  WHILE v_candidate < p_as_of LOOP
    v_candidate := (v_candidate + INTERVAL '1 year')::date;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- Lead view used by the insurance renewal telecalling eligibility queries and
-- the allotment RPC's ordering. effective_due_date is always the value the
-- module should actually use for windowing/sorting: last_insurance_expiry_date
-- when present, else the sale-date-derived projection. Re-evaluated on every
-- query (CURRENT_DATE default, not materialized) so "upcoming" stays current.
CREATE OR REPLACE VIEW public.insurance_renewal_leads AS
SELECT
  s.id,
  s.chassis_no,
  s.contact_phones,
  s.vehicle_sale_date,
  s.last_insurance_expiry_date,
  COALESCE(s.last_insurance_expiry_date, public.insurance_next_due_date(s.vehicle_sale_date)) AS effective_due_date,
  (s.last_insurance_expiry_date IS NULL) AS due_date_is_estimated
FROM public.all_service_data s;

-- Re-point the allotment RPC's ordering at effective_due_date so sale-date-only
-- customers are queued by their computed due date rather than sorting to the
-- back (previously NULLS LAST on last_insurance_expiry_date effectively
-- excluded them from any due-date-based ordering).
CREATE OR REPLACE FUNCTION public.insurance_renewal_get_next_assignment(
  p_campaign_id bigint,
  p_user_email text
)
RETURNS TABLE(asgn_id bigint, cust_id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment_id BIGINT;
  v_customer_id BIGINT;
BEGIN
  SELECT ra.id, ra.customer_id INTO v_assignment_id, v_customer_id
  FROM insurance_renewal_assignments ra
  JOIN insurance_renewal_leads s ON s.id = ra.customer_id
  WHERE ra.campaign_id = p_campaign_id
    AND ra.status = 'pending'
    AND ra.retry_after IS NOT NULL
    AND ra.retry_after <= CURRENT_DATE
  ORDER BY ra.retry_after ASC, s.effective_due_date ASC NULLS LAST, ra.id ASC
  LIMIT 1
  FOR UPDATE OF ra SKIP LOCKED;

  IF v_assignment_id IS NULL THEN
    SELECT ra.id, ra.customer_id INTO v_assignment_id, v_customer_id
    FROM insurance_renewal_assignments ra
    JOIN insurance_renewal_leads s ON s.id = ra.customer_id
    WHERE ra.campaign_id = p_campaign_id
      AND ra.status = 'pending'
      AND ra.retry_after IS NULL
    ORDER BY s.effective_due_date ASC NULLS LAST, ra.id ASC
    LIMIT 1
    FOR UPDATE OF ra SKIP LOCKED;
  END IF;

  IF v_assignment_id IS NOT NULL THEN
    UPDATE insurance_renewal_assignments
    SET assigned_to = p_user_email, status = 'assigned', assigned_at = NOW(), updated_at = NOW()
    WHERE id = v_assignment_id;
    RETURN QUERY SELECT v_assignment_id, v_customer_id;
  END IF;
END;
$$;
