-- Verification checks for dealer_settings migration
SELECT COUNT(*) AS row_count FROM public.dealer_settings;
SELECT setting_key, setting_value FROM public.dealer_settings WHERE dealer_code = '3000840';
SELECT policyname FROM pg_policies WHERE tablename = 'dealer_settings';
