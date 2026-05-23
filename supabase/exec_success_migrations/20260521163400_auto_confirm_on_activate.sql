-- Migration: auto-confirm email when admin activates a user
-- File: supabase/migrations/20260521163400_auto_confirm_on_activate.sql

-- Function: called by trigger when is_active is set to true
CREATE OR REPLACE FUNCTION public.confirm_user_email_on_activate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- When is_active flips to TRUE, confirm the email in auth.users
  IF NEW.is_active = TRUE AND (OLD.is_active = FALSE OR OLD.is_active IS NULL) THEN
    UPDATE auth.users
    SET 
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      confirmation_sent_at = COALESCE(confirmation_sent_at, NOW()),
      updated_at = NOW()
    WHERE id = NEW.id
      AND email_confirmed_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop old trigger if exists
DROP TRIGGER IF EXISTS trg_confirm_email_on_activate ON public.users;

-- Create trigger
CREATE TRIGGER trg_confirm_email_on_activate
  AFTER UPDATE OF is_active ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.confirm_user_email_on_activate();

-- Also run once NOW to fix all currently active users who aren't confirmed yet
UPDATE auth.users au
SET 
  email_confirmed_at = NOW(),
  updated_at = NOW()
FROM public.users pu
WHERE au.id = pu.id
  AND pu.is_active = TRUE
  AND au.email_confirmed_at IS NULL;
