-- Verification checks for:
-- 20260619235500_add_insurance_and_price_columns_to_all_service_data.sql

SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'all_service_data'
  AND column_name IN (
    'ex_showroom_price',
    'idv',
    'last_insurance_expiry_date',
    'last_insurance_comapny',
    'last_insurance_policy_number'
  )
ORDER BY column_name;
