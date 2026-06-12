begin;

-- RLS hardening for bodyshop_repair_cards so Service Advisor + Reception flows
-- can upsert canonical card rows within dealer scope.

-- SELECT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bodyshop_repair_cards'
      AND policyname = 'bodyshop_repair_cards_select_rbac_v1'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY bodyshop_repair_cards_select_rbac_v1
      ON public.bodyshop_repair_cards
      FOR SELECT
      TO authenticated
      USING (
        public.is_admin()
        OR (
          (
            public.has_module_view('service_advisor')
            OR public.has_module_view('reception')
            OR public.has_module_view('bodyshop_floor')
            OR public.has_module_view('bodyshop_repair')
            OR public.has_module_view('bodyshop_tracker')
          )
          AND (
            (
              reception_entry_id IS NOT NULL
              AND reception_entry_id IN (
                SELECT sre.id
                FROM public.service_reception_entries sre
                WHERE public.dealer_code_in_scope(sre.dealer_code)
              )
            )
            OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
            OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
          )
        )
      )
    $sql$;
  END IF;
END
$$;

-- INSERT policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bodyshop_repair_cards'
      AND policyname = 'bodyshop_repair_cards_insert_rbac_v1'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY bodyshop_repair_cards_insert_rbac_v1
      ON public.bodyshop_repair_cards
      FOR INSERT
      TO authenticated
      WITH CHECK (
        public.is_admin()
        OR (
          (
            public.has_module_modify('service_advisor')
            OR public.has_module_modify('reception')
            OR public.has_module_modify('bodyshop_repair')
          )
          AND (
            (
              reception_entry_id IS NOT NULL
              AND reception_entry_id IN (
                SELECT sre.id
                FROM public.service_reception_entries sre
                WHERE public.dealer_code_in_scope(sre.dealer_code)
              )
            )
            OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
            OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
          )
        )
      )
    $sql$;
  END IF;
END
$$;

-- UPDATE policy
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'bodyshop_repair_cards'
      AND policyname = 'bodyshop_repair_cards_update_rbac_v1'
  ) THEN
    EXECUTE $sql$
      CREATE POLICY bodyshop_repair_cards_update_rbac_v1
      ON public.bodyshop_repair_cards
      FOR UPDATE
      TO authenticated
      USING (
        public.is_admin()
        OR (
          (
            public.has_module_modify('service_advisor')
            OR public.has_module_modify('reception')
            OR public.has_module_modify('bodyshop_repair')
          )
          AND (
            (
              reception_entry_id IS NOT NULL
              AND reception_entry_id IN (
                SELECT sre.id
                FROM public.service_reception_entries sre
                WHERE public.dealer_code_in_scope(sre.dealer_code)
              )
            )
            OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
            OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
          )
        )
      )
      WITH CHECK (
        public.is_admin()
        OR (
          (
            public.has_module_modify('service_advisor')
            OR public.has_module_modify('reception')
            OR public.has_module_modify('bodyshop_repair')
          )
          AND (
            (
              reception_entry_id IS NOT NULL
              AND reception_entry_id IN (
                SELECT sre.id
                FROM public.service_reception_entries sre
                WHERE public.dealer_code_in_scope(sre.dealer_code)
              )
            )
            OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 1))
            OR public.dealer_code_in_scope(split_part(coalesce(sa_employee_code, ''), '_', 2))
          )
        )
      )
    $sql$;
  END IF;
END
$$;

commit;
