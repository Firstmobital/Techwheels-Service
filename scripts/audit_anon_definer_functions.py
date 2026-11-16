#!/usr/bin/env python3
"""
Read-only audit of supabase/backups/full_metadata.sql (never edited by this script).

Lists public SECURITY DEFINER functions that `anon` can execute, and flags those whose body
shows NO recognisable caller check. A flag is a prompt to read the function, not proof of a hole.

Usage: python3 scripts/audit_anon_definer_functions.py [path/to/full_metadata.sql]
"""
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else "supabase/backups/full_metadata.sql"
text = open(path, encoding="utf-8").read()

# Caller-check markers. Presence of any of these means the body at least looks at who is calling.
MARKERS = [
    "is_admin(", "auth.uid(", "auth.jwt(", "customer_require_session", "customer_assert_reg",
    "has_module_", "_can_view", "_can_modify", "can_modify(", "can_view(", "user_has_", "user_can_",
    "current_setting('request.jwt", "session_user", "current_user", "service_role",
    "staff_require", "require_session", "_require_", "p_session_token",
]

# CREATE FUNCTION public.name(args) ... AS $$ body $$;
func_re = re.compile(
    r"CREATE FUNCTION public\.(?P<name>[a-z0-9_]+)\((?P<args>[^)]*)\)(?P<head>.*?)AS \$(?P<tag>[a-z_]*)\$(?P<body>.*?)\$(?P=tag)\$;",
    re.S | re.I,
)
anon_grant_re = re.compile(
    r"GRANT (?:ALL|EXECUTE) ON FUNCTION public\.(?P<name>[a-z0-9_]+)\([^)]*\) TO anon;", re.I
)
public_revoke_re = re.compile(
    r"REVOKE ALL ON FUNCTION public\.(?P<name>[a-z0-9_]+)\([^)]*\) FROM anon;", re.I
)

anon_exec = {m.group("name") for m in anon_grant_re.finditer(text)}
anon_revoked = {m.group("name") for m in public_revoke_re.finditer(text)}
anon_exec -= anon_revoked

rows = []
for m in func_re.finditer(text):
    head = m.group("head").upper()
    name = m.group("name")
    if "SECURITY DEFINER" not in head:
        continue
    returns_trigger = "RETURNS TRIGGER" in (m.group(0)[:400].upper())
    if returns_trigger:
        continue  # trigger functions cannot be called through RPC
    if name not in anon_exec:
        continue
    body = m.group("body")
    marks = [k for k in MARKERS if k.lower() in body.lower()]
    rows.append((name, marks))

flagged = [r for r in rows if not r[1]]
checked = [r for r in rows if r[1]]

print(f"SECURITY DEFINER functions executable by anon: {len(rows)}")
print(f"  with a recognisable caller check: {len(checked)}")
print(f"  with NO recognisable caller check (READ THESE): {len(flagged)}\n")
for name, _ in sorted(flagged):
    print(f"  FLAG  {name}")
