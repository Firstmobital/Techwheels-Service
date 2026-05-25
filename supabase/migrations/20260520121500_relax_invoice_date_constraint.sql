-- Relax invoice_date NOT NULL constraint to allow NULL values
-- PSF Revenue Report imports don't have invoice_date data
ALTER TABLE job_card_closed_data
ALTER COLUMN invoice_date DROP NOT NULL;
