-- ACCOUNTS-003 "Not in Payroll": recorded decisions to leave a calculated earning out of a payroll month. DBL-0105.
-- Additive only. It changes no pay and no existing object. The check before finalizing runs in the Payroll screen;
-- the database does not enforce it.
-- ROLLBACK (web revert first): DROP TABLE public.payroll_earning_exclusions; DROP FUNCTION public.payroll_exclusion_guard();

CREATE TABLE public.payroll_earning_exclusions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  payroll_month date NOT NULL CHECK (EXTRACT(day FROM payroll_month) = 1),
  item_key text NOT NULL CHECK (length(btrim(item_key)) > 0),
  amount numeric(14,2) NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn')),
  created_by uuid DEFAULT auth.uid(),
  created_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  withdrawn_by uuid,
  withdrawn_at timestamptz
);
CREATE UNIQUE INDEX payroll_earning_exclusions_one_active ON public.payroll_earning_exclusions (payroll_month, item_key) WHERE status = 'active';

-- Who and when are set here, never by the caller. The only change allowed is withdrawing an active row.
-- A finalized month's decisions are frozen, for admins too.
CREATE FUNCTION public.payroll_exclusion_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF public.payroll_is_month_finalized(NEW.payroll_month) THEN
    RAISE EXCEPTION 'Payroll month % is finalized', NEW.payroll_month;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN RAISE EXCEPTION 'A new exclusion must be active'; END IF;
    NEW.created_by := auth.uid();
    NEW.created_email := auth.jwt() ->> 'email';
    NEW.created_at := now();
    NEW.withdrawn_by := NULL;
    NEW.withdrawn_at := NULL;
  ELSE
    IF OLD.status <> 'active' OR NEW.status <> 'withdrawn'
       OR (NEW.payroll_month, NEW.item_key, NEW.amount, NEW.reason, NEW.created_by, NEW.created_email, NEW.created_at)
          IS DISTINCT FROM (OLD.payroll_month, OLD.item_key, OLD.amount, OLD.reason, OLD.created_by, OLD.created_email, OLD.created_at) THEN
      RAISE EXCEPTION 'An exclusion can only be withdrawn';
    END IF;
    NEW.withdrawn_by := auth.uid();
    NEW.withdrawn_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.payroll_exclusion_guard() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER payroll_earning_exclusions_guard BEFORE INSERT OR UPDATE ON public.payroll_earning_exclusions
  FOR EACH ROW EXECUTE FUNCTION public.payroll_exclusion_guard();

ALTER TABLE public.payroll_earning_exclusions ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_exclusions_select ON public.payroll_earning_exclusions FOR SELECT TO authenticated
  USING (public.is_admin() OR public.has_module_view('payroll'));
CREATE POLICY payroll_exclusions_insert ON public.payroll_earning_exclusions FOR INSERT TO authenticated
  WITH CHECK (public.payroll_can_mutate_payroll());
CREATE POLICY payroll_exclusions_update ON public.payroll_earning_exclusions FOR UPDATE TO authenticated
  USING (public.payroll_can_mutate_payroll()) WITH CHECK (public.payroll_can_mutate_payroll());

REVOKE ALL ON public.payroll_earning_exclusions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payroll_earning_exclusions TO authenticated;
GRANT ALL ON public.payroll_earning_exclusions TO service_role;
