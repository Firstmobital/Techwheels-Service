-- Enable RLS policies for job_card_closed_data table to allow authenticated users to insert/select/update
-- Issue: RLS was enabled but no policies existed, blocking all DML operations

CREATE POLICY job_card_closed_data_select_authenticated ON public.job_card_closed_data
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY job_card_closed_data_insert_authenticated ON public.job_card_closed_data
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY job_card_closed_data_update_authenticated ON public.job_card_closed_data
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY job_card_closed_data_delete_authenticated ON public.job_card_closed_data
  FOR DELETE
  TO authenticated
  USING (true);
