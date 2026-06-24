-- PLANNED (NOT AUTO-EXECUTED): hard deprecation step for legacy service-history tables.
-- Execute only after observation window confirms no required writes/reads to legacy tables.

BEGIN;

DROP TABLE IF EXISTS public."EV_Service_History";
DROP TABLE IF EXISTS public."PV_Service_History";

COMMIT;
