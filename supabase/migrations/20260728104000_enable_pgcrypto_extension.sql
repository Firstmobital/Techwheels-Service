-- Fix postgres error: function gen_random_bytes(integer) does not exist
-- Apply: node scripts/apply-sql-files.mjs supabase/migrations/20260728104000_enable_pgcrypto_extension.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
