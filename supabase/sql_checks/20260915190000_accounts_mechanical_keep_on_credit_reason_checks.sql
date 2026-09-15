-- Read-only verification checks for:
-- supabase/migrations/20260915190000_accounts_mechanical_keep_on_credit_reason.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.

-- 1) Dedicated reason + revocation columns on Mechanical invoice header
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_invoices'
      AND column_name = 'keep_on_credit_reason'
  ) AS reason_col,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_invoices'
      AND column_name = 'keep_on_credit_revoked_by'
  ) AS revoked_by_col,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'accounts_mechanical_invoices'
      AND column_name = 'keep_on_credit_revoked_at'
  ) AS revoked_at_col;

-- 2) Validity helper: flag alone is not enough
SELECT
  public.accounts_mechanical_keep_on_credit_valid(true, 'Insurance payment pending', 'GM User', now()) AS valid_complete,
  public.accounts_mechanical_keep_on_credit_valid(true, '  ', 'GM User', now()) AS invalid_blank_reason,
  public.accounts_mechanical_keep_on_credit_valid(true, 'Insurance payment pending', NULL, now()) AS invalid_no_approver,
  public.accounts_mechanical_keep_on_credit_valid(true, 'Insurance payment pending', 'GM User', NULL) AS invalid_no_time,
  public.accounts_mechanical_keep_on_credit_valid(false, 'Insurance payment pending', 'GM User', now()) AS invalid_flag_false;

-- 3) Gatepass math still independent of credit; incomplete credit does not release
SELECT
  public.accounts_mechanical_invoice_gatepass_reason(10000, 10000, false, NULL, NULL, NULL) = 'paid' AS a_full_paid,
  public.accounts_mechanical_invoice_gatepass_reason(10000, 9801, false, NULL, NULL, NULL) = 'short_payment' AS b_short_199,
  public.accounts_mechanical_invoice_gatepass_reason(10000, 9800, false, NULL, NULL, NULL) = 'short_payment' AS c_exact_2pct,
  public.accounts_mechanical_invoice_gatepass_reason(10000, 9799, false, NULL, NULL, NULL) IS NULL AS d_remaining_201_denied,
  public.accounts_mechanical_invoice_gatepass_reason(10000, 9700, true, NULL, 'x', now()) IS NULL AS e_credit_without_reason_denied,
  public.accounts_mechanical_invoice_gatepass_reason(
    10000, 9700, true, 'Insurance payment pending', 'GM User', now()
  ) = 'keep_on_credit' AS f_valid_credit_allows_300,
  public.accounts_mechanical_remaining_amount(3680, 3700) = 0 AS i_overpay_remaining_floored,
  public.accounts_mechanical_invoice_gatepass_reason(3680, 3700, false, NULL, NULL, NULL) = 'paid' AS i_overpay_paid;

-- 4) Setter is 3-arg (reason), SECURITY DEFINER, not accounts.can_modify
SELECT
  p.pronargs = 3 AS setter_takes_reason,
  p.prosecdef AS security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  pg_get_functiondef(p.oid) LIKE '%reason for keeping on credit is required%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_can_keep_on_credit%'
    AND pg_get_functiondef(p.oid) LIKE '%keep_on_credit_revoked_by%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%has_module_modify(''accounts'')%'
    AS setter_enforces_reason_and_dedicated_authority
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'set_accounts_mechanical_keep_on_credit';

-- 2-arg overload must be gone (would let approve skip the reason)
SELECT NOT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'set_accounts_mechanical_keep_on_credit'
    AND p.pronargs = 2
) AS two_arg_setter_dropped;

-- 5) Issue RPC still 1 arg; uses validity helper; no client eligible flag
SELECT
  p.pronargs = 1 AS issue_takes_only_reception_id,
  pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_keep_on_credit_valid%'
    AND pg_get_functiondef(p.oid) LIKE '%gatepass not eligible%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%p_eligible%'
    AS issue_uses_persisted_validity
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'issue_accounts_mechanical_gatepass';

-- 6) List includes reason; Bodyshop list still has no Keep on Credit
SELECT
  pg_get_functiondef(p.oid) LIKE '%keep_on_credit_reason%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_invoice_gatepass_reason%'
    AND pg_get_functiondef(p.oid) LIKE '%2026-09-11 00:00:00+05:30%'
    AS mechanical_list_has_reason_and_cutoff
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_mechanical_cases';

SELECT
  pg_get_functiondef(p.oid) NOT LIKE '%keep_on_credit%'
    AND pg_get_functiondef(p.oid) LIKE '%bodyshop_settlements%'
    AS bodyshop_list_unchanged_no_credit
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'list_accounts_bodyshop_cases';

-- 7) add_payment still stores entered amount (DBL-0061 overpay; not re-clipped)
SELECT
  pg_get_functiondef(p.oid) NOT LIKE '%exceeds remaining%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%v_amount - v_remaining) <= 1%'
    AND pg_get_functiondef(p.oid) LIKE '%receipt amount must be greater than 0%'
    AS add_payment_allows_overpay
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'add_accounts_mechanical_payment';

-- 8) Explicit grant module still exists; can_keep_on_credit still not accounts.can_modify
SELECT
  EXISTS (
    SELECT 1 FROM public.modules
     WHERE name = 'accounts_keep_on_credit' AND is_active = true
  ) AS keep_on_credit_module_active;

SELECT
  pg_get_functiondef(p.oid) LIKE '%accounts_keep_on_credit%'
    AND pg_get_functiondef(p.oid) LIKE '%accounts_mechanical_user_is_gm%'
    AND pg_get_functiondef(p.oid) LIKE '%is_admin()%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%has_module_modify(''accounts'')%'
    AS can_keep_on_credit_authority
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'accounts_mechanical_can_keep_on_credit';
