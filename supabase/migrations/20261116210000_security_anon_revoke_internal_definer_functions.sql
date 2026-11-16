-- SECURITY-ANON-001 Phase 1: stop anonymous (public anon key) execution of internal SECURITY DEFINER functions.
-- Source: scripts/audit_anon_definer_functions.py over supabase/backups/full_metadata.sql (2026-11-16).
-- Scope: 73 functions flagged with no caller check. REVOKE EXECUTE FROM PUBLIC and anon, on every overload.
--   authenticated and service_role privileges are NOT changed (staff screens and edge functions keep working;
--   edge functions call these RPCs with the service-role key; cron jobs run as postgres).
-- KEPT for anon on purpose (not touched):
--   customer portal / complaint-link entry points: customer_start_session, add_customer_message,
--   get_complaint_by_token, raise_complaint, reopen_complaint, submit_csat
--   RLS scope helpers (boolean, harmless for anon): dealer_code_in_scope, bodyshop_job_card_in_dealer_scope,
--   bodyshop_floor_work_user_assigned_to_jc, user_has_service_floor_incharge_scope_for_sa_code,
--   user_is_linked_bodyshop_floor_incharge, user_sa_owns_job_card_number
-- Includes customer_collect_vehicles(p_phone) and lookup_customer_phone_from_contact_details(p_chassis_key),
-- which returned customer vehicles / phone numbers to any anonymous caller.
-- Apply per DB_CHANGE_PROTOCOL. Ledger: DBL-0097.
--
-- ROLLBACK (re-grant anon on the same functions):
--   DO $$ DECLARE r record; BEGIN FOR r IN SELECT p.oid::regprocedure AS sig FROM pg_proc p
--     JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = ANY (ARRAY[<names above>])
--     LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', r.sig); END LOOP; END $$;

DO $$
DECLARE
  r record;
  v_names text[] := ARRAY[
    '_bodyshop_ensure_settlement',
    '_bodyshop_settlement_mark_line_reversed',
    'accounts_mechanical_recalc',
    'add_bodyshop_settlement_line',
    'check_complaint_sla_breaches',
    'claim_customer_push_outbox',
    'complete_customer_push_outbox',
    'customer_collect_vehicles',
    'customer_floor_work_photo_allowed',
    'customer_helpdesk_peer_name',
    'customer_push_resolve_phone_10',
    'enqueue_customer_push',
    'enqueue_psf_import_run',
    'get_bodyshop_surveyor_options',
    'get_canonical_model_names',
    'get_distinct_dealers',
    'get_reception_revisit_context',
    'get_reception_updation_context',
    'ggn_stock_status_for_part',
    'help_ticket_calculate_sla_targets',
    'help_ticket_emit_notification',
    'help_ticket_next_number',
    'help_ticket_next_sequence_number',
    'help_ticket_notify_support_holders',
    'help_ticket_resolve_assignee',
    'help_ticket_user_id_for_employee',
    'help_ticket_write_audit',
    'insurance_renewal_campaign_count_snapshot',
    'insurance_renewal_get_next_assignment',
    'insurance_renewal_rc_fetch_diagnostics',
    'insurance_renewal_rc_fetch_next_candidates',
    'insurance_renewal_rc_fetch_pending_counts',
    'insurance_renewal_recount_campaign',
    'invoke_auto_service_reminder_daily',
    'invoke_booking_source_sync_incremental_daily',
    'invoke_ew_renewal_reminder_daily',
    'invoke_ew_service_reminder_daily',
    'invoke_insurance_renewal_rc_fetch_worker',
    'invoke_post_service_feedback_daily',
    'invoke_updation_reminder_daily',
    'is_income_assignment_eligible',
    'list_accounts_bodyshop_cases',
    'list_accounts_mechanical_payments',
    'lookup_accounts_mechanical_dms_invoice',
    'lookup_customer_phone_from_contact_details',
    'process_next_psf_import_run',
    'process_psf_import_run',
    'psf_get_today_productivity',
    'recalc_bodyshop_settlement',
    'reception_sa_location_key',
    'reconcile_all_service_data_from_contact_details_chunked',
    'reconcile_all_service_data_from_job_card_closed_data_chunked',
    'reconcile_all_service_data_from_rto_idspay_chunked',
    'refresh_all_service_data_dynamic_full',
    'refresh_all_service_data_from_contact_details',
    'refresh_all_service_data_from_job_card_closed_data',
    'refresh_all_service_data_from_rto_idspay',
    'refresh_job_card_closed_dms_revenue_batch',
    'refresh_reception_updation_flags',
    'reschedule_auto_service_reminder_cron',
    'reschedule_ew_renewal_reminder_cron',
    'reschedule_ew_service_reminder_cron',
    'reschedule_post_service_feedback_cron',
    'reschedule_updation_reminder_cron',
    'rpc_fuel_overrides',
    'rpc_fuel_queue',
    'rpc_fuel_resolve',
    'run_psf_import_via_staging',
    'run_psf_revenue_dms_import_batch',
    'sa_code_in_scope',
    'sync_bodyshop_floor_work_module_grants',
    'telecall_get_next_assignment',
    'upsert_all_service_data_from_booking_source'
  ];
  v_count integer := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_names)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    v_count := v_count + 1;
  END LOOP;
  RAISE NOTICE 'SECURITY-ANON-001: revoked anon execute on % function signatures', v_count;
END;
$$;
