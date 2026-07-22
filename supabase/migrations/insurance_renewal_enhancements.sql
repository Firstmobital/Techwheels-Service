-- ============================================================================
-- Insurance Renewal Telecalling — Enhancement Migration (FIXED)
-- Uses all_service_data table (not vehicles) for customer/vehicle data
-- Run this in Supabase SQL Editor or via Management API
-- Idempotent: safe to run multiple times
-- ============================================================================

-- ─── 1. Add new columns to insurance_renewal_campaigns ─────────────────────

ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS sold_dealer_filter text[] DEFAULT NULL;
ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS last_service_dealer_filter text[] DEFAULT NULL;
ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS meta_enabled boolean DEFAULT false;
ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS meta_template_name text DEFAULT NULL;
ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS meta_template_lang text DEFAULT 'en_US';
ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS priority_mode text DEFAULT 'urgency';
ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS auto_refresh_enabled boolean DEFAULT true;
ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS drip_enabled boolean DEFAULT true;
ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS self_renewal_link_enabled boolean DEFAULT false;
ALTER TABLE insurance_renewal_campaigns 
  ADD COLUMN IF NOT EXISTS roi_target_premium numeric DEFAULT 0;

-- ─── 2. Add missing columns to insurance_renewal_assignments ──────────────

ALTER TABLE insurance_renewal_assignments 
  ADD COLUMN IF NOT EXISTS assigned_to_name text DEFAULT NULL;
ALTER TABLE insurance_renewal_assignments 
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz DEFAULT NULL;

-- ─── 3. Create insurance_renewal_meta_logs table ──────────────────────────

CREATE TABLE IF NOT EXISTS insurance_renewal_meta_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id bigint REFERENCES insurance_renewal_campaigns(id) ON DELETE CASCADE,
  assignment_id bigint,
  phone text NOT NULL,
  template_name text NOT NULL,
  template_lang text DEFAULT 'en_US',
  step integer DEFAULT 1,
  status text DEFAULT 'pending',
  meta_message_id text,
  error text,
  sent_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ir_meta_logs_campaign ON insurance_renewal_meta_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ir_meta_logs_assignment ON insurance_renewal_meta_logs(assignment_id);

-- ─── 4. Create insurance_renewal_leaderboard table ────────────────────────

CREATE TABLE IF NOT EXISTS insurance_renewal_leaderboard (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id bigint REFERENCES insurance_renewal_campaigns(id) ON DELETE CASCADE,
  telecaller_id text,
  telecaller_name text,
  snapshot_date date NOT NULL,
  calls_made integer DEFAULT 0,
  calls_connected integer DEFAULT 0,
  renewed_via_us integer DEFAULT 0,
  renewed_elsewhere integer DEFAULT 0,
  callback_later integer DEFAULT 0,
  no_answer integer DEFAULT 0,
  not_interested integer DEFAULT 0,
  premium_collected numeric DEFAULT 0,
  conversion_rate numeric DEFAULT 0,
  score integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campaign_id, telecaller_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_ir_leaderboard_date ON insurance_renewal_leaderboard(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_ir_leaderboard_campaign ON insurance_renewal_leaderboard(campaign_id);

-- ─── 5. Create insurance_renewal_self_renewal_links table ──────────────────

CREATE TABLE IF NOT EXISTS insurance_renewal_self_renewal_links (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id bigint REFERENCES insurance_renewal_campaigns(id) ON DELETE CASCADE,
  assignment_id bigint,
  customer_phone text NOT NULL,
  customer_name text,
  vehicle_reg text,
  model text,
  token text UNIQUE NOT NULL,
  link_url text,
  status text DEFAULT 'sent',
  quoted_premium numeric,
  renewal_company text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ir_self_renewal_token ON insurance_renewal_self_renewal_links(token);

-- ─── 6. RPC function to get distinct dealers (from all_service_data) ───────

CREATE OR REPLACE FUNCTION get_distinct_dealers()
RETURNS TABLE(sold_dealers text[], service_dealers text[])
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    array_remove(ARRAY(
      SELECT DISTINCT sold_dealer 
      FROM all_service_data 
      WHERE sold_dealer IS NOT NULL AND sold_dealer != '' 
      ORDER BY sold_dealer
    ), NULL),
    array_remove(ARRAY(
      SELECT DISTINCT last_service_dealer 
      FROM all_service_data 
      WHERE last_service_dealer IS NOT NULL AND last_service_dealer != '' 
      ORDER BY last_service_dealer
    ), NULL)
  ;
$$;

-- ─── 7. Enable pg_cron + pg_net extensions ─────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ─── 8. Schedule daily cron job (3:00 AM UTC = 8:30 AM IST) ────────────────

DO $$
BEGIN
  -- Unschedule if exists, then re-schedule
  PERFORM cron.unschedule('insurance-renewal-daily-refresh');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'insurance-renewal-daily-refresh',
  '0 3 * * *',
  $$
    SELECT net.http_post(
      url := 'https://jmdndcphkmaljhwgzqxq.supabase.co/functions/v1/insurance-renewal-telecalling',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object(
        'action', 'cron_daily_refresh',
        'cron_secret', 'techwheels_cron_2026'
      )
    );
  $$
);
