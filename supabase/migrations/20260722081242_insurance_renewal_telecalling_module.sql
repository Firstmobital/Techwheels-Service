-- Insurance Renewal Telecalling module: dedicated campaign/assignment tables,
-- concurrency-safe allotment RPC, and module/permission registration.
-- Mirrors the proven telecall_campaigns/telecall_assignments pattern from the
-- existing service telecalling module, but kept as separate tables because
-- the eligibility window (30 days before last_insurance_expiry_date),
-- disposition set, and re-attempt cadence differ from service reminders.

-- ── Campaigns ──────────────────────────────────────────────────────────────
CREATE TABLE public.insurance_renewal_campaigns (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_name text NOT NULL,
  window_days integer NOT NULL DEFAULT 30,
  date_from date NOT NULL,
  date_to date NOT NULL,
  status text NOT NULL DEFAULT 'active',
  total_leads integer DEFAULT 0,
  pending_count integer DEFAULT 0,
  in_progress_count integer DEFAULT 0,
  callback_later_count integer DEFAULT 0,
  out_of_window_count integer DEFAULT 0,
  completed_count integer DEFAULT 0,
  renewed_count integer DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── Assignments ────────────────────────────────────────────────────────────
CREATE TABLE public.insurance_renewal_assignments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id bigint NOT NULL REFERENCES public.insurance_renewal_campaigns(id) ON DELETE CASCADE,
  customer_id bigint NOT NULL REFERENCES public.all_service_data(id) ON DELETE CASCADE,
  assigned_to text,
  status text NOT NULL DEFAULT 'pending',
  call_notes text,
  callback_date date,
  called_at timestamptz,
  call_count integer DEFAULT 0,
  no_answer_count integer DEFAULT 0,
  retry_after date,
  whatsapp_sent boolean DEFAULT false,
  whatsapp_status text DEFAULT 'pending',
  quoted_premium numeric,
  renewal_company text,
  assigned_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (campaign_id, customer_id)
);

CREATE INDEX idx_insurance_renewal_assignments_campaign_status
  ON public.insurance_renewal_assignments (campaign_id, status);
CREATE INDEX idx_insurance_renewal_assignments_assigned_to
  ON public.insurance_renewal_assignments (assigned_to, status);

ALTER TABLE public.insurance_renewal_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_renewal_assignments ENABLE ROW LEVEL SECURITY;

-- All reads/writes for this module go through the edge function using the
-- service-role key (same pattern as telecall_campaigns/telecall_assignments),
-- so authenticated users only need read access for the client-side campaign
-- selector dropdown; all mutations are server-side.
CREATE POLICY insurance_renewal_campaigns_select ON public.insurance_renewal_campaigns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY insurance_renewal_assignments_select ON public.insurance_renewal_assignments
  FOR SELECT TO authenticated USING (true);

-- ── Concurrency-safe allotment RPC ──────────────────────────────────────────
-- Unlike the existing telecall module (whose edge function does a plain
-- select-then-update despite an unused SKIP LOCKED RPC sitting idle), this
-- module's get_next action calls this RPC directly so two telecallers can
-- never be handed the same customer under real concurrency.
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
  -- Retry-due leads (previous no-answer) take priority over fresh leads,
  -- soonest-expiring customer first within each bucket.
  SELECT ra.id, ra.customer_id INTO v_assignment_id, v_customer_id
  FROM insurance_renewal_assignments ra
  JOIN all_service_data s ON s.id = ra.customer_id
  WHERE ra.campaign_id = p_campaign_id
    AND ra.status = 'pending'
    AND ra.retry_after IS NOT NULL
    AND ra.retry_after <= CURRENT_DATE
  ORDER BY ra.retry_after ASC, s.last_insurance_expiry_date ASC NULLS LAST, ra.id ASC
  LIMIT 1
  FOR UPDATE OF ra SKIP LOCKED;

  IF v_assignment_id IS NULL THEN
    SELECT ra.id, ra.customer_id INTO v_assignment_id, v_customer_id
    FROM insurance_renewal_assignments ra
    JOIN all_service_data s ON s.id = ra.customer_id
    WHERE ra.campaign_id = p_campaign_id
      AND ra.status = 'pending'
      AND ra.retry_after IS NULL
    ORDER BY s.last_insurance_expiry_date ASC NULLS LAST, ra.id ASC
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

-- ── Module registration ─────────────────────────────────────────────────────
INSERT INTO public.modules (name, label, description, route, sort_order, is_active)
VALUES (
  'insurance_renewal_telecalling',
  'Insurance Renewal Telecalling',
  'Proactive calling queue for customers whose vehicle insurance is nearing expiry.',
  '/insurance-renewal-telecalling',
  27,
  true
)
ON CONFLICT (name) DO NOTHING;
