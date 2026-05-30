BEGIN;

CREATE TABLE IF NOT EXISTS public.service_invoice_order_data (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  branch text NOT NULL,
  vehicle_registration_number text,
  chassis_number text,
  job_card_number text NOT NULL,
  status text,
  job_card_channel text,
  created_date_time timestamptz,
  closed_date_time timestamptz,
  completed_date_time timestamptz,
  service_request_no text,
  account text,
  invoice_format text,
  last_name text,
  first_name text,
  labour_rate_list text,
  parts_price_list text,
  customer_po_ref text,
  delivery_variance_percent numeric,
  payment_type text,
  fms text,
  insurance_company_name text,
  insurance_type text,
  insurance_expiry_date date,
  open_for_days integer,
  sr_type text,
  arn text,
  account_phone_number text,
  crn text,
  contact_phones text,
  vehicle_delivery_date timestamptz,
  effective_final_delivery_estimate_date timestamptz,
  delivery_variance_hours numeric,
  effective_total_estimate numeric,
  total_estimate_variance_percent numeric,
  balance_payment_to_be_adjusted numeric,
  total_payment_amount_adjusted numeric,
  parent_product_line text,
  product_line text,
  division text,
  total_invoice_amount numeric,
  kms numeric,
  hours numeric,
  vehicle_sale_date date,
  tm_invoice_date date,
  warranty text,
  amc text,
  final_labour_amount numeric,
  final_spares_amount numeric,
  total_order_value numeric,
  delay_reason text,
  jobs_entry_complete text,
  parts_entry_complete text,
  supervisor text,
  sr_assigned_to text,
  invoiced text,
  source_row_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch, source_row_hash)
);

CREATE INDEX IF NOT EXISTS idx_service_invoice_order_data_branch_created
  ON public.service_invoice_order_data (branch, created_date_time);

CREATE INDEX IF NOT EXISTS idx_service_invoice_order_data_job_card
  ON public.service_invoice_order_data (job_card_number);

CREATE INDEX IF NOT EXISTS idx_service_invoice_order_data_status
  ON public.service_invoice_order_data (status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_invoice_order_data_updated_at ON public.service_invoice_order_data;
CREATE TRIGGER trg_service_invoice_order_data_updated_at
  BEFORE UPDATE ON public.service_invoice_order_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.import_metadata (table_name, last_updated_at)
VALUES ('service_invoice_order_data', NULL)
ON CONFLICT (table_name) DO NOTHING;

COMMIT;
