-- Migration: create dealer_settings table
-- Purpose: Store dealer-level configurable settings (e.g. report email)
-- Created: 2026-06-23

CREATE TABLE IF NOT EXISTS public.dealer_settings (
  id              BIGSERIAL PRIMARY KEY,
  dealer_code     TEXT NOT NULL DEFAULT '3000840',
  setting_key     TEXT NOT NULL,
  setting_value   TEXT,
  updated_by      TEXT,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dealer_code, setting_key)
);

-- Index for fast lookup by dealer + key
CREATE INDEX IF NOT EXISTS idx_dealer_settings_lookup
  ON public.dealer_settings (dealer_code, setting_key);

-- Enable RLS
ALTER TABLE public.dealer_settings ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read settings
CREATE POLICY "dealer_settings_read"
  ON public.dealer_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow authenticated users to insert/update settings
CREATE POLICY "dealer_settings_write"
  ON public.dealer_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "dealer_settings_update"
  ON public.dealer_settings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed default email (vinodexodus@gmail.com as current hardcoded value)
INSERT INTO public.dealer_settings (dealer_code, setting_key, setting_value, updated_by)
VALUES ('3000840', 'report_email', 'vinodexodus@gmail.com', 'system')
ON CONFLICT (dealer_code, setting_key) DO NOTHING;

