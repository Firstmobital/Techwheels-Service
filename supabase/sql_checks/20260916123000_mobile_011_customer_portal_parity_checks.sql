-- MOBILE-011 portal parity grants. Run after 20260916123000.

select
  has_function_privilege('anon', 'public.customer_get_settlement(text, text)', 'execute') as anon_can_get_settlement,
  has_function_privilege('anon', 'public.customer_submit_booking(text, text, jsonb)', 'execute') as anon_can_submit_booking,
  has_function_privilege('anon', 'public.customer_get_repair_card(text, text)', 'execute') as anon_can_get_repair_card,
  has_function_privilege('anon', 'public.customer_collect_vehicles(text)', 'execute') as anon_collect_vehicles_should_be_false;
