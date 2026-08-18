-- Post-apply checks for 20260818100000_fix_list_reception_gate_summary_parity.sql

SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%v_is_floor_or_bodyshop_only%' AS has_removed_floor_only_gate,
       pg_get_functiondef(p.oid) LIKE '%NOT v_broad_scope%' AS floor_path_guards_broad_scope,
       pg_get_functiondef(p.oid) LIKE '%Same gate as get_service_advisor_summary_counts%'
         AS advisor_gate_documents_summary_parity
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;

-- Expect: has_removed_floor_only_gate = false for both;
--         floor_path_guards_broad_scope = true for both;
--         advisor_gate_documents_summary_parity = true for list_reception_entries_page
