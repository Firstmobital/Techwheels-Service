-- Post-apply checks for 20260817180000_fix_list_reception_sa_gate_match_summary.sql

SELECT p.proname,
       pg_get_functiondef(p.oid) LIKE '%v_is_floor_or_bodyshop_only%' AS has_floor_only_gate,
       pg_get_functiondef(p.oid) LIKE '%NOT v_is_floor_or_bodyshop_only%' AS advisor_path_uses_floor_only_exclusion,
       pg_get_functiondef(p.oid) LIKE '%matches get_service_advisor_summary_counts%'
         OR pg_get_functiondef(p.oid) LIKE '%matches summary RPC%'
         AS comment_documents_summary_alignment
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('list_reception_entries_page', 'list_reception_reg_created_since')
ORDER BY p.proname;
