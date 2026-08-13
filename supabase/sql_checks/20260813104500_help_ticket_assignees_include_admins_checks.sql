-- Post-apply checks for 20260813104500_help_ticket_assignees_include_admins.sql

SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'help_ticket_list_assignees',
    'help_ticket_resolve_assignee',
    'help_ticket_admin_identity_code',
    'help_ticket_user_id_from_admin_identity',
    'help_ticket_assign',
    'help_ticket_escalate'
  )
ORDER BY p.proname, args;

-- Assignees definition must include admin synthetic identity + can_modify branch
SELECT
  (pg_get_functiondef(p.oid) ILIKE '%ADMIN:%') AS includes_admin_identity,
  (pg_get_functiondef(p.oid) ILIKE '%can_modify%') AS includes_can_modify,
  (pg_get_functiondef(p.oid) ILIKE '%super_admin%') AS includes_super_admin
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'help_ticket_list_assignees';
