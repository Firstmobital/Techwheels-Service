-- Customer Digital Estimates Table for Service Advisor -> Customer Approval Workflow
CREATE TABLE IF NOT EXISTS public.customer_estimates (
    id BIGSERIAL PRIMARY KEY,
    estimate_no TEXT UNIQUE NOT NULL,
    vehicle_registration_number TEXT NOT NULL,
    complaint_id BIGINT,
    customer_name TEXT,
    customer_phone TEXT,
    model TEXT,
    fuel TEXT,
    service_advisor_name TEXT,
    branch TEXT,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC NOT NULL DEFAULT 0,
    discount NUMERIC NOT NULL DEFAULT 0,
    gst_tax NUMERIC NOT NULL DEFAULT 0,
    grand_total NUMERIC NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Sent', -- 'Draft', 'Sent', 'Approved', 'Rejected'
    rejection_reason TEXT,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_customer_estimates_reg ON public.customer_estimates(vehicle_registration_number);
CREATE INDEX IF NOT EXISTS idx_customer_estimates_status ON public.customer_estimates(status);

ALTER TABLE public.customer_estimates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customer_estimates' AND policyname = 'Allow public read and write on customer_estimates'
  ) THEN
    CREATE POLICY "Allow public read and write on customer_estimates"
      ON public.customer_estimates
      FOR ALL
      TO public
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
