-- Anyone with bodyshop_recovery view (or modify) may save DO recovery remarks.

CREATE OR REPLACE FUNCTION public.set_bodyshop_do_recovery_remark(
  p_repair_card_id integer,
  p_remark text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
SET row_security TO off
AS $$
DECLARE
  v_id bigint;
  v_remark text;
  v_actor text;
BEGIN
  IF NOT (
    public.is_admin()
    OR public.has_module_modify('accounts')
    OR public.has_module_view('bodyshop_recovery')
    OR public.has_module_modify('bodyshop_recovery')
  ) THEN
    RAISE EXCEPTION 'permission denied: requires bodyshop_recovery or accounts access'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bodyshop_repair_cards WHERE id = p_repair_card_id
  ) THEN
    RAISE EXCEPTION 'repair card % not found', p_repair_card_id USING ERRCODE = 'P0002';
  END IF;

  v_id := public._bodyshop_ensure_settlement(p_repair_card_id);
  v_remark := NULLIF(btrim(COALESCE(p_remark, '')), '');
  SELECT a.actor_email INTO v_actor FROM public._bodyshop_settlement_actor() a;

  UPDATE public.bodyshop_settlements
     SET do_recovery_remark = v_remark,
         updated_by = v_actor,
         updated_at = now()
   WHERE id = v_id;

  RETURN jsonb_build_object(
    'success', true,
    'repair_card_id', p_repair_card_id,
    'do_recovery_remark', v_remark
  );
END;
$$;

COMMENT ON FUNCTION public.set_bodyshop_do_recovery_remark(integer, text) IS
  'Set trimmed DO recovery remark on bodyshop_settlements. Blank clears. Requires admin, accounts modify, or bodyshop_recovery view/modify.';