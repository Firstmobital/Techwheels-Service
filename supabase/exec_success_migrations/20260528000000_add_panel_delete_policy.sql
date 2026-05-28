-- Add DELETE policy for panels table to match existing RBAC pattern
-- This enables deletion of panels by dealership users for their own job cards

CREATE POLICY "panels: own dealership delete" ON public.panels
FOR DELETE
USING (
  job_card_id IN (
    SELECT jc.id
    FROM (
      public.job_cards jc
      JOIN public.vehicles v ON (v.reg_number = jc.reg_number)
    )
    WHERE v.dealer_code = public.my_dealer_code()
  )
);
