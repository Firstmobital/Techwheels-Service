-- MOBILE-011: Supabase default privileges re-grant EXECUTE to anon after CREATE FUNCTION.
-- Helpers take a raw phone and must not be callable from the client.
-- Session RPCs stay granted to anon.
-- Run in SQL editor if 20260916120000 was already applied.

begin;

revoke all on function public.customer_collect_vehicles(text) from public, anon, authenticated;
revoke all on function public.customer_require_session(text) from public, anon, authenticated;
revoke all on function public.customer_reject_staff_jwt() from public, anon, authenticated;
revoke all on function public.customer_hash_token(text) from public, anon, authenticated;
revoke all on function public.customer_assert_reg(text, text) from public, anon, authenticated;
revoke all on function public.customer_my_reg_keys(text) from public, anon, authenticated;
revoke all on function public.customer_last10_digits(text) from public, anon, authenticated;
revoke all on function public.customer_norm_reg(text) from public, anon, authenticated;

commit;
