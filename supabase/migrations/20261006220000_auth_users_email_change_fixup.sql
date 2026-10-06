-- GoTrue GET /admin/users fails when auth.users.email_change is NULL:
-- "Scan error on column index 8, name email_change: converting NULL to string is unsupported"
-- That breaks auth admin user pagination (Admin user list / dashboard mail actions).

UPDATE auth.users
SET
  email_change = COALESCE(email_change, ''),
  email_change_token_new = COALESCE(email_change_token_new, '')
WHERE email_change IS NULL
   OR email_change_token_new IS NULL;

-- Orphan row with markdown-corrupted email (real admin is admin@firstmobital.com).
UPDATE auth.users
SET
  email = 'orphan-corrupt-admin@techwheels.invalid',
  email_change = '',
  email_change_token_new = '',
  banned_until = '2099-01-01 00:00:00+00'::timestamptz
WHERE id = '1661d961-d73d-411e-9eab-cff26bbc048b'
  AND email LIKE 'admin@%[%';
