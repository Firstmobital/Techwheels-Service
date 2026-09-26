-- MOBILE-015: customer_get_mechanical_case + Mini Paid in is_floor_incharge_service_type

SELECT public.is_floor_incharge_service_type('Mini Paid Service') AS mini_paid_is_floor;

SELECT public.is_floor_incharge_service_type('Accident') AS accident_not_floor;

SELECT pg_get_functiondef(p.oid) LIKE '%Mini Paid Service%'
  AS is_floor_incharge_includes_mini_paid
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'is_floor_incharge_service_type';

SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'customer_get_mechanical_case'
) AS customer_get_mechanical_case_exists;

SELECT pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_payment_lines%'
  AND pg_get_functiondef(p.oid) NOT LIKE '%payment_notes%'
  AS mechanical_case_no_internal_notes
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'customer_get_mechanical_case';
