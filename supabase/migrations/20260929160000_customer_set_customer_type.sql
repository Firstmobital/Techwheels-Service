-- =====================================================================
-- Customer self-service: set customer/claim case type on bodyshop repair card
-- Allows customer to set: individual | firm | cash | foc
-- Updates public.bodyshop_repair_cards.customer_type
-- =====================================================================

create or replace function public.customer_set_customer_type(
  p_session_token text,
  p_reg_number text,
  p_customer_type text
)
returns jsonb
language plpgsql
security definer
set search_path to public, extensions
set row_security = off
as $$
declare
  v_sess record;
  v_reg text;
  v_regs text[];
  v_type text := lower(btrim(coalesce(p_customer_type, '')));
  v_card_id bigint;
begin
  select * into v_sess from public.customer_require_session(p_session_token);
  v_regs := public.customer_my_reg_keys(v_sess.phone);
  v_reg := public.customer_assert_reg(p_session_token, p_reg_number);

  if v_type not in ('individual', 'firm', 'cash', 'foc') then
    raise exception 'Invalid customer type: %', p_customer_type;
  end if;

  select b.id
  into v_card_id
  from public.bodyshop_repair_cards b
  where public.customer_norm_reg(b.reg_number) = any(v_regs)
    and public.customer_norm_reg(b.reg_number) = v_reg
  order by b.created_at desc
  limit 1;

  if v_card_id is null then
    raise exception 'No active bodyshop repair card found for this vehicle.';
  end if;

  update public.bodyshop_repair_cards
  set customer_type = v_type,
      updated_at = now()
  where id = v_card_id;

  return jsonb_build_object('ok', true, 'id', v_card_id, 'customer_type', v_type);
end;
$$;

grant execute on function public.customer_set_customer_type(text, text, text) to anon, authenticated;
