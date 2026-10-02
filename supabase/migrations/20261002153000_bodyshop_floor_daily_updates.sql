-- Daily floor incharge update per job card (IST calendar day). Prior days remain for audit but UI treats only today as active.

CREATE TABLE IF NOT EXISTS public.bodyshop_floor_daily_updates (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_card_number text NOT NULL,
  repair_card_id integer REFERENCES public.bodyshop_repair_cards(id) ON DELETE SET NULL,
  dealer_code text NOT NULL,
  update_date date NOT NULL,
  note_text text,
  voice_bucket text,
  voice_storage_path text,
  voice_mime text,
  voice_duration_sec integer,
  created_by text,
  updated_by text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT bodyshop_floor_daily_updates_jc_date_key UNIQUE (job_card_number, update_date)
);

CREATE INDEX IF NOT EXISTS bodyshop_floor_daily_updates_update_date_idx
  ON public.bodyshop_floor_daily_updates (update_date DESC);

CREATE INDEX IF NOT EXISTS bodyshop_floor_daily_updates_dealer_date_idx
  ON public.bodyshop_floor_daily_updates (dealer_code, update_date DESC);

COMMENT ON TABLE public.bodyshop_floor_daily_updates IS
  'One note (+ optional voice) per bodyshop floor job card per IST day. Expires in UI when update_date < today IST.';

CREATE OR REPLACE FUNCTION public.touch_bodyshop_floor_daily_updates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bodyshop_floor_daily_updates_updated_at ON public.bodyshop_floor_daily_updates;
CREATE TRIGGER bodyshop_floor_daily_updates_updated_at
  BEFORE UPDATE ON public.bodyshop_floor_daily_updates
  FOR EACH ROW EXECUTE FUNCTION public.touch_bodyshop_floor_daily_updates_updated_at();

ALTER TABLE public.bodyshop_floor_daily_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY bodyshop_floor_daily_updates_admin_all
  ON public.bodyshop_floor_daily_updates
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY bodyshop_floor_daily_updates_select_rbac
  ON public.bodyshop_floor_daily_updates
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR (
      (
        public.has_module_view('bodyshop_floor')
        OR public.has_module_modify('bodyshop_floor')
        OR public.has_module_view('bodyshop_tracker')
        OR public.has_module_view('bodyshop_repair')
      )
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_floor_daily_updates_insert_rbac
  ON public.bodyshop_floor_daily_updates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor')
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

CREATE POLICY bodyshop_floor_daily_updates_update_rbac
  ON public.bodyshop_floor_daily_updates
  FOR UPDATE
  TO authenticated
  USING (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor')
      AND public.dealer_code_in_scope(dealer_code)
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.has_module_modify('bodyshop_floor')
      AND public.dealer_code_in_scope(dealer_code)
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.bodyshop_floor_daily_updates TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE bodyshop_floor_daily_updates_id_seq TO authenticated;
