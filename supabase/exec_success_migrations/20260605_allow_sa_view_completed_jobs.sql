-- Allow Service Advisors to view technician_assignments for their own assigned job cards
-- Policy checks if the job_card_number belongs to the current user's sa_employee_code

CREATE POLICY technician_assignments_select_sa_own_jobs 
  ON public.technician_assignments 
  FOR SELECT 
  TO authenticated 
  USING (
    -- Service Advisors can see assignments for jobs they're assigned to
    CASE 
      WHEN public.has_module_view('service_advisor'::text) THEN
        EXISTS (
          SELECT 1 FROM public.service_reception_entries sre
          WHERE sre.jc_number = job_card_number
            AND sre.sa_employee_code = public.my_sa_employee_code()
        )
      -- Floor Incharge and Admin roles get existing policy access
      ELSE public.has_module_view('floor_incharge'::text)
    END
  );

