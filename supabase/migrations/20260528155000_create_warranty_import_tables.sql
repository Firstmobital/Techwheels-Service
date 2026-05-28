-- Warranty import foundation: 7 dedicated upload tables with upsert keys.
-- Authority source audited from local_folder/backups/full_database.sql before introducing new schema.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.warranty_claim_settlement_report_data (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  branch text NOT NULL CHECK (branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV')),
  location text NOT NULL CHECK (location IN ('Ajmer Road', 'Sitapura')),
  portal text NOT NULL CHECK (portal IN ('PV', 'EV')),
  source_row_hash text NOT NULL,
  source_row_number integer,
  source_file_name text,
  source_row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch, source_row_hash)
);

CREATE TABLE IF NOT EXISTS public.warranty_part_wc_data (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  branch text NOT NULL CHECK (branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV')),
  location text NOT NULL CHECK (location IN ('Ajmer Road', 'Sitapura')),
  portal text NOT NULL CHECK (portal IN ('PV', 'EV')),
  source_row_hash text NOT NULL,
  source_row_number integer,
  source_file_name text,
  source_row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch, source_row_hash)
);

CREATE TABLE IF NOT EXISTS public.warranty_updation_claim_data (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  branch text NOT NULL CHECK (branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV')),
  location text NOT NULL CHECK (location IN ('Ajmer Road', 'Sitapura')),
  portal text NOT NULL CHECK (portal IN ('PV', 'EV')),
  source_row_hash text NOT NULL,
  source_row_number integer,
  source_file_name text,
  source_row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch, source_row_hash)
);

CREATE TABLE IF NOT EXISTS public.warranty_goodwill_data (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  branch text NOT NULL CHECK (branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV')),
  location text NOT NULL CHECK (location IN ('Ajmer Road', 'Sitapura')),
  portal text NOT NULL CHECK (portal IN ('PV', 'EV')),
  source_row_hash text NOT NULL,
  source_row_number integer,
  source_file_name text,
  source_row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch, source_row_hash)
);

CREATE TABLE IF NOT EXISTS public.warranty_amc_data (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  branch text NOT NULL CHECK (branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV')),
  location text NOT NULL CHECK (location IN ('Ajmer Road', 'Sitapura')),
  portal text NOT NULL CHECK (portal IN ('PV', 'EV')),
  source_row_hash text NOT NULL,
  source_row_number integer,
  source_file_name text,
  source_row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch, source_row_hash)
);

CREATE TABLE IF NOT EXISTS public.warranty_fsb_data (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  branch text NOT NULL CHECK (branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV')),
  location text NOT NULL CHECK (location IN ('Ajmer Road', 'Sitapura')),
  portal text NOT NULL CHECK (portal IN ('PV', 'EV')),
  source_row_hash text NOT NULL,
  source_row_number integer,
  source_file_name text,
  source_row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch, source_row_hash)
);

CREATE TABLE IF NOT EXISTS public.warranty_wc_data (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  branch text NOT NULL CHECK (branch IN ('Ajmer Road PV', 'Ajmer Road EV', 'Sitapura PV', 'Sitapura EV')),
  location text NOT NULL CHECK (location IN ('Ajmer Road', 'Sitapura')),
  portal text NOT NULL CHECK (portal IN ('PV', 'EV')),
  source_row_hash text NOT NULL,
  source_row_number integer,
  source_file_name text,
  source_row_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch, source_row_hash)
);

CREATE INDEX IF NOT EXISTS idx_warranty_claim_settlement_branch_portal
  ON public.warranty_claim_settlement_report_data (branch, portal);
CREATE INDEX IF NOT EXISTS idx_warranty_part_wc_branch_portal
  ON public.warranty_part_wc_data (branch, portal);
CREATE INDEX IF NOT EXISTS idx_warranty_updation_claim_branch_portal
  ON public.warranty_updation_claim_data (branch, portal);
CREATE INDEX IF NOT EXISTS idx_warranty_goodwill_branch_portal
  ON public.warranty_goodwill_data (branch, portal);
CREATE INDEX IF NOT EXISTS idx_warranty_amc_branch_portal
  ON public.warranty_amc_data (branch, portal);
CREATE INDEX IF NOT EXISTS idx_warranty_fsb_branch_portal
  ON public.warranty_fsb_data (branch, portal);
CREATE INDEX IF NOT EXISTS idx_warranty_wc_branch_portal
  ON public.warranty_wc_data (branch, portal);

DROP TRIGGER IF EXISTS trg_warranty_claim_settlement_updated_at ON public.warranty_claim_settlement_report_data;
CREATE TRIGGER trg_warranty_claim_settlement_updated_at
  BEFORE UPDATE ON public.warranty_claim_settlement_report_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_warranty_part_wc_updated_at ON public.warranty_part_wc_data;
CREATE TRIGGER trg_warranty_part_wc_updated_at
  BEFORE UPDATE ON public.warranty_part_wc_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_warranty_updation_claim_updated_at ON public.warranty_updation_claim_data;
CREATE TRIGGER trg_warranty_updation_claim_updated_at
  BEFORE UPDATE ON public.warranty_updation_claim_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_warranty_goodwill_updated_at ON public.warranty_goodwill_data;
CREATE TRIGGER trg_warranty_goodwill_updated_at
  BEFORE UPDATE ON public.warranty_goodwill_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_warranty_amc_updated_at ON public.warranty_amc_data;
CREATE TRIGGER trg_warranty_amc_updated_at
  BEFORE UPDATE ON public.warranty_amc_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_warranty_fsb_updated_at ON public.warranty_fsb_data;
CREATE TRIGGER trg_warranty_fsb_updated_at
  BEFORE UPDATE ON public.warranty_fsb_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_warranty_wc_updated_at ON public.warranty_wc_data;
CREATE TRIGGER trg_warranty_wc_updated_at
  BEFORE UPDATE ON public.warranty_wc_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.import_metadata (table_name, last_updated_at)
VALUES
  ('warranty_claim_settlement_report_data', NULL),
  ('warranty_part_wc_data', NULL),
  ('warranty_updation_claim_data', NULL),
  ('warranty_goodwill_data', NULL),
  ('warranty_amc_data', NULL),
  ('warranty_fsb_data', NULL),
  ('warranty_wc_data', NULL)
ON CONFLICT (table_name) DO NOTHING;

COMMIT;
