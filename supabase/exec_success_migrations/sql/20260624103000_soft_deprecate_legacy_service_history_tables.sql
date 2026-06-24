-- Soft deprecate legacy service-history tables after source retarget to *_test tables.
-- This migration keeps legacy tables for observation/backfill only and blocks app-role writes.

BEGIN;

COMMENT ON TABLE public."EV_Service_History" IS
'DEPRECATED SOURCE TABLE: do not write. Runtime sync uses EV_service_history_test. Retained temporarily for rollback/forensics.';

COMMENT ON TABLE public."PV_Service_History" IS
'DEPRECATED SOURCE TABLE: do not write. Runtime sync uses PV_service_history_test. Retained temporarily for rollback/forensics.';

-- Block direct writes from app-facing roles while keeping read capability.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public."EV_Service_History" FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public."PV_Service_History" FROM anon, authenticated;

COMMIT;
