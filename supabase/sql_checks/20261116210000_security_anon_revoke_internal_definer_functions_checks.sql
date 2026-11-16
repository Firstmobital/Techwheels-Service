-- Read-only checks for 20261116210000_security_anon_revoke_internal_definer_functions.sql
-- Execution: This file can be run in one go.
-- Execution option: You may also run section-by-section for investigation; expected validation is against full-run output.
-- Note: the SQL editor shows only the last result when run in one go; run each SELECT separately there.

-- Expect: 0 rows (no revoked function is still executable by anon)
SELECT p.oid::regprocedure AS still_anon_executable
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = ANY (ARRAY[
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
  ])
  AND has_function_privilege('anon', p.oid, 'execute');

-- Expect: all true (kept for anon on purpose)
SELECT p.proname, has_function_privilege('anon', p.oid, 'execute') AS anon_can_execute_should_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('customer_start_session','add_customer_message','get_complaint_by_token','raise_complaint',
                    'reopen_complaint','submit_csat','dealer_code_in_scope','bodyshop_job_card_in_dealer_scope',
                    'bodyshop_floor_work_user_assigned_to_jc','user_has_service_floor_incharge_scope_for_sa_code',
                    'user_is_linked_bodyshop_floor_incharge','user_sa_owns_job_card_number')
ORDER BY p.proname;

-- Expect: authenticated and service_role unchanged (true) for a sample of staff and edge functions
SELECT p.proname,
       has_function_privilege('authenticated', p.oid, 'execute') AS authenticated_should_be_true,
       has_function_privilege('service_role', p.oid, 'execute') AS service_role_should_be_true
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_accounts_bodyshop_cases','recalc_bodyshop_settlement','claim_customer_push_outbox',
                    'process_psf_import_run','upsert_all_service_data_from_booking_source','psf_get_today_productivity')
ORDER BY p.proname;
