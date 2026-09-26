-- Customer journey stage = workshop current_stage (same number shown on the web repair card).

begin;

create or replace function public.customer_bodyshop_effective_stage(
  p_card public.bodyshop_repair_cards
)
returns integer
language plpgsql
stable
as $$
begin
  return greatest(1, least(18, coalesce(p_card.current_stage, 1)));
end;
$$;

commit;
