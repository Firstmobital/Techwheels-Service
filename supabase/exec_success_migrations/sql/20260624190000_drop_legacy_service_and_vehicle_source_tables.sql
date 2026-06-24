-- Drop legacy source tables that are no longer part of active runtime flows.
-- Approved scope:
--   public."EV_Service_History"
--   public."PV_Service_History"
--   public."EV_Vehicle_Data"
--   public."PV_Vehicle_Data"

DROP TABLE IF EXISTS public."EV_Service_History";
DROP TABLE IF EXISTS public."PV_Service_History";
DROP TABLE IF EXISTS public."EV_Vehicle_Data";
DROP TABLE IF EXISTS public."PV_Vehicle_Data";
