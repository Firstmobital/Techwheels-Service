-- Create email_logs table for warranty claim email tracking
CREATE TABLE public.email_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_card_id uuid NOT NULL REFERENCES public.job_cards(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  attachments text[] DEFAULT NULL,
  sent_at timestamp with time zone DEFAULT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Add RLS policy for email_logs
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view email logs for their dealer's job cards"
  ON public.email_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.job_cards jc
      INNER JOIN public.vehicles v ON v.reg_number = jc.reg_number
      WHERE jc.id = job_card_id
      AND v.dealer_code = (SELECT public.my_dealer_code())
    )
  );

CREATE POLICY "Users can insert email logs for their dealer's job cards"
  ON public.email_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.job_cards jc
      INNER JOIN public.vehicles v ON v.reg_number = jc.reg_number
      WHERE jc.id = job_card_id
      AND v.dealer_code = (SELECT public.my_dealer_code())
    )
  );

-- Create index for faster lookups
CREATE INDEX idx_email_logs_job_card_id ON public.email_logs(job_card_id);
CREATE INDEX idx_email_logs_created_at ON public.email_logs(created_at);

-- Add comment
COMMENT ON TABLE public.email_logs IS 'Log of all email communications for warranty claims sent to Tata Motors.';
