-- ACCOUNTS-003 Phase 1: easy expense posting. DBL-0104.
-- Adds individual expense entries (cancel, never delete), an automatic change history and repeating expenses.
-- Rows already in pnl_expenses are copied into entries; pnl_expenses is then made read-only and kept for rollback.
-- Between applying this file and publishing the web release, the old grid can still be read but not saved.
--
-- ROLLBACK (web revert first). Entries made after this release would be lost, so export them before dropping:
--   GRANT INSERT, UPDATE, DELETE ON public.pnl_expenses TO authenticated;
--   DROP TABLE public.pnl_expense_entry_history, public.pnl_expense_entries, public.pnl_recurring_expenses;
--   DROP FUNCTION public.pnl_entry_guard(), public.pnl_entry_history(), public.pnl_recurring_guard();

CREATE TABLE public.pnl_recurring_expenses (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  head_id bigint NOT NULL REFERENCES public.pnl_expense_heads(id) ON DELETE RESTRICT,
  branch text NOT NULL CHECK (branch IN ('Common', 'Ajmer Road', 'Sitapura', 'Tonk', 'Shahpura')),
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  amount_varies boolean NOT NULL DEFAULT false, -- true: the real bill amount is typed each month
  start_month date NOT NULL CHECK (EXTRACT(day FROM start_month) = 1),
  end_month date CHECK (end_month IS NULL OR EXTRACT(day FROM end_month) = 1),
  note text CHECK (length(note) <= 300),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pnl_recurring_period CHECK (end_month IS NULL OR end_month >= start_month)
);

CREATE TABLE public.pnl_expense_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  expense_month date NOT NULL CHECK (EXTRACT(day FROM expense_month) = 1), -- month the cost belongs to
  branch text NOT NULL CHECK (branch IN ('Common', 'Ajmer Road', 'Sitapura', 'Tonk', 'Shahpura')),
  head_id bigint NOT NULL REFERENCES public.pnl_expense_heads(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount >= 0),
  note text CHECK (length(note) <= 300),
  recurring_id bigint REFERENCES public.pnl_recurring_expenses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  cancel_reason text CHECK (length(cancel_reason) <= 300),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid DEFAULT auth.uid(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pnl_entry_cancel_reason CHECK (status = 'active' OR length(btrim(coalesce(cancel_reason, ''))) > 0)
);
CREATE INDEX pnl_expense_entries_month_idx ON public.pnl_expense_entries (expense_month);
-- A repeating expense can be confirmed only once per month (cancelling frees the month again).
CREATE UNIQUE INDEX pnl_expense_entries_recurring_once ON public.pnl_expense_entries (recurring_id, expense_month)
  WHERE recurring_id IS NOT NULL AND status = 'active';

CREATE TABLE public.pnl_expense_entry_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id bigint NOT NULL REFERENCES public.pnl_expense_entries(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('created', 'changed', 'cancelled')),
  old_row jsonb,
  new_row jsonb NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pnl_expense_entry_history_entry_idx ON public.pnl_expense_entry_history (entry_id);

CREATE FUNCTION public.pnl_entry_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE t public.pnl_recurring_expenses%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN RAISE EXCEPTION 'A new expense entry must be active'; END IF;
    NEW.created_by := auth.uid();
    NEW.created_at := now();
    IF NEW.recurring_id IS NOT NULL THEN
      SELECT * INTO t FROM public.pnl_recurring_expenses WHERE id = NEW.recurring_id;
      IF NOT FOUND OR NOT t.is_active OR t.branch <> NEW.branch OR t.head_id <> NEW.head_id
         OR NEW.expense_month < t.start_month OR (t.end_month IS NOT NULL AND NEW.expense_month > t.end_month) THEN
        RAISE EXCEPTION 'This entry does not match an active repeating expense for that month';
      END IF;
    END IF;
  ELSE
    IF OLD.status = 'cancelled' THEN RAISE EXCEPTION 'A cancelled entry cannot be changed'; END IF;
    IF NEW.recurring_id IS DISTINCT FROM OLD.recurring_id THEN RAISE EXCEPTION 'The repeating link of an entry cannot be changed'; END IF;
    IF OLD.recurring_id IS NOT NULL AND (NEW.expense_month, NEW.branch, NEW.head_id) IS DISTINCT FROM (OLD.expense_month, OLD.branch, OLD.head_id) THEN
      RAISE EXCEPTION 'Cancel a repeating entry instead of moving it';
    END IF;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER pnl_expense_entries_guard BEFORE INSERT OR UPDATE ON public.pnl_expense_entries FOR EACH ROW EXECUTE FUNCTION public.pnl_entry_guard();

-- SECURITY DEFINER so that users cannot write history rows themselves.
CREATE FUNCTION public.pnl_entry_history() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.pnl_expense_entry_history (entry_id, action, old_row, new_row, changed_by)
  VALUES (NEW.id,
          CASE WHEN TG_OP = 'INSERT' THEN 'created' WHEN NEW.status = 'cancelled' THEN 'cancelled' ELSE 'changed' END,
          CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW), auth.uid());
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.pnl_entry_history() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER pnl_expense_entries_history AFTER INSERT OR UPDATE ON public.pnl_expense_entries FOR EACH ROW EXECUTE FUNCTION public.pnl_entry_history();

-- Salary comes from Payroll, so it cannot be set up as a repeating expense.
CREATE FUNCTION public.pnl_recurring_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pnl_expense_heads WHERE id = NEW.head_id AND code = 'salary') THEN
    RAISE EXCEPTION 'Salary cannot be a repeating expense';
  END IF;
  NEW.created_by := CASE WHEN TG_OP = 'INSERT' THEN auth.uid() ELSE OLD.created_by END;
  NEW.updated_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER pnl_recurring_expenses_guard BEFORE INSERT OR UPDATE ON public.pnl_recurring_expenses FOR EACH ROW EXECUTE FUNCTION public.pnl_recurring_guard();

ALTER TABLE public.pnl_recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pnl_expense_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pnl_expense_entry_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY pnl_recurring_select ON public.pnl_recurring_expenses FOR SELECT TO authenticated USING (public.has_module_view('pnl_report'));
CREATE POLICY pnl_recurring_insert ON public.pnl_recurring_expenses FOR INSERT TO authenticated WITH CHECK (public.has_module_modify('pnl_report'));
CREATE POLICY pnl_recurring_update ON public.pnl_recurring_expenses FOR UPDATE TO authenticated USING (public.has_module_modify('pnl_report')) WITH CHECK (public.has_module_modify('pnl_report'));
CREATE POLICY pnl_entries_select ON public.pnl_expense_entries FOR SELECT TO authenticated USING (public.has_module_view('pnl_report'));
CREATE POLICY pnl_entries_insert ON public.pnl_expense_entries FOR INSERT TO authenticated WITH CHECK (public.has_module_modify('pnl_report'));
CREATE POLICY pnl_entries_update ON public.pnl_expense_entries FOR UPDATE TO authenticated USING (public.has_module_modify('pnl_report')) WITH CHECK (public.has_module_modify('pnl_report'));
CREATE POLICY pnl_entry_history_select ON public.pnl_expense_entry_history FOR SELECT TO authenticated USING (public.has_module_view('pnl_report'));

-- No DELETE for application users: entries are cancelled, and history is read-only.
REVOKE ALL ON public.pnl_recurring_expenses, public.pnl_expense_entries, public.pnl_expense_entry_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pnl_recurring_expenses, public.pnl_expense_entries TO authenticated;
GRANT SELECT ON public.pnl_expense_entry_history TO authenticated;
GRANT ALL ON public.pnl_recurring_expenses, public.pnl_expense_entries, public.pnl_expense_entry_history TO service_role;

-- Carry over anything typed into the first release's monthly grid, then freeze that table.
LOCK TABLE public.pnl_expenses IN EXCLUSIVE MODE;
INSERT INTO public.pnl_expense_entries (expense_month, branch, head_id, amount, note)
SELECT expense_month, branch, head_id, amount, 'Carried over from the monthly grid' FROM public.pnl_expenses;
REVOKE INSERT, UPDATE, DELETE ON public.pnl_expenses FROM authenticated;
