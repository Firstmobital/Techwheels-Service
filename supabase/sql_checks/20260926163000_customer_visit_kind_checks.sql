-- MOBILE-015 visit_kind (run after 20260926163000_customer_visit_kind_and_context.sql)

-- Floor type → mechanical (matches is_floor_incharge_service_type)
SELECT public.customer_resolve_visit_kind(
  jsonb_build_object('source', 'reception', 'service_type', 'Paid Service')
) = 'mechanical' AS visit_kind_paid_service_mechanical;

SELECT public.customer_resolve_visit_kind(
  jsonb_build_object('source', 'reception', 'service_type', 'Mini Paid Service')
) = 'mechanical' AS visit_kind_mini_paid_mechanical;

-- Open reception mechanical wins over bodyshop-shaped fallback job
SELECT public.customer_resolve_visit_kind(
  jsonb_build_object('source', 'reception', 'service_type', 'Paid Service')
) = 'mechanical' AS reception_beats_stale_repair_card;

-- Bodyshop card-only visit
SELECT public.customer_resolve_visit_kind(
  jsonb_build_object('source', 'bodyshop', 'service_type', 'Body & Paint')
) = 'bodyshop' AS visit_kind_bodyshop_card;

-- Accident reception
SELECT public.customer_resolve_visit_kind(
  jsonb_build_object('source', 'reception', 'service_type', 'Accident')
) = 'bodyshop' AS visit_kind_accident;

SELECT public.customer_resolve_visit_kind(NULL) = 'other' AS visit_kind_null_job;
