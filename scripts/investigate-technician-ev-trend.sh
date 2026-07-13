#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_local="$repo_root/.env.local"
if [[ -f "$env_local" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$env_local"
  set +a
fi

if [[ -z "${SUPABASE_DB_PASSWORD:-}" ]]; then
  SUPABASE_DB_PASSWORD="${PGPASSWORD:-}"
fi
: "${SUPABASE_DB_PASSWORD:?SUPABASE_DB_PASSWORD required in .env.local}"

SUPABASE_DB_PORT="${SUPABASE_DB_PORT:-5432}"
SUPABASE_DB_NAME="${SUPABASE_DB_NAME:-postgres}"

if [[ -n "${SUPABASE_DB_HOST:-}" && -n "${SUPABASE_DB_USER:-}" ]]; then
  DB_HOST="$SUPABASE_DB_HOST"
  DB_USER="$SUPABASE_DB_USER"
else
  echo "Error: SUPABASE_DB_HOST and SUPABASE_DB_USER required" >&2
  exit 1
fi

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
PSQL=(psql -h "$DB_HOST" -p "$SUPABASE_DB_PORT" -U "$DB_USER" -d "$SUPABASE_DB_NAME" -v ON_ERROR_STOP=1 -At)

run_sql() { "${PSQL[@]}" -c "$1"; }

echo "=== EV/PV trend: July 2026 by invoice_date ==="
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc, invoice_date::date AS inv_date
  FROM public.job_card_closed_data
  WHERE invoice_date >= DATE '2026-07-01' AND invoice_date <= DATE '2026-07-11'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc, ta.bay_no
  FROM public.technician_assignments ta
  JOIN closed c ON c.jc = UPPER(TRIM(ta.job_card_number))
  WHERE ta.work_status = 'completed'
  ORDER BY UPPER(TRIM(ta.job_card_number)), ta.out_ts DESC NULLS LAST
),
reception AS (
  SELECT DISTINCT ON (UPPER(TRIM(sre.jc_number)))
    UPPER(TRIM(sre.jc_number)) AS jc,
    UPPER(TRIM(sre.portal)) AS vehicle_portal,
    sre.sa_employee_code
  FROM public.service_reception_entries sre
  JOIN completed c ON c.jc = UPPER(TRIM(sre.jc_number))
  ORDER BY UPPER(TRIM(sre.jc_number)), sre.created_at DESC
),
enriched AS (
  SELECT c.inv_date,
    COALESCE(NULLIF(UPPER(TRIM(em.fuel_type)), ''), NULLIF(r.vehicle_portal, ''), '') AS tech_page_fuel
  FROM closed c
  JOIN completed comp ON comp.jc = c.jc
  LEFT JOIN reception r ON r.jc = c.jc
  LEFT JOIN public.employee_master em ON UPPER(TRIM(em.employee_code)) = UPPER(TRIM(r.sa_employee_code))
)
SELECT inv_date::text || E'\t' || tech_page_fuel || E'\t' || COUNT(*)::text
FROM enriched
GROUP BY inv_date, tech_page_fuel
ORDER BY inv_date, tech_page_fuel;
"

echo ""
echo "=== July month total (This Month filter) ==="
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc
  FROM public.job_card_closed_data
  WHERE invoice_date >= DATE '2026-07-01' AND invoice_date <= DATE '2026-07-11'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc, ta.bay_no
  FROM public.technician_assignments ta
  JOIN closed c ON c.jc = UPPER(TRIM(ta.job_card_number))
  WHERE ta.work_status = 'completed'
  ORDER BY UPPER(TRIM(ta.job_card_number)), ta.out_ts DESC NULLS LAST
),
reception AS (
  SELECT DISTINCT ON (UPPER(TRIM(sre.jc_number)))
    UPPER(TRIM(sre.jc_number)) AS jc,
    UPPER(TRIM(sre.portal)) AS vehicle_portal,
    sre.sa_employee_code
  FROM public.service_reception_entries sre
  JOIN completed c ON c.jc = UPPER(TRIM(sre.jc_number))
  ORDER BY UPPER(TRIM(sre.jc_number)), sre.created_at DESC
),
enriched AS (
  SELECT COALESCE(NULLIF(UPPER(TRIM(em.fuel_type)), ''), NULLIF(r.vehicle_portal, ''), '') AS tech_page_fuel
  FROM completed comp
  LEFT JOIN reception r ON r.jc = comp.jc
  LEFT JOIN public.employee_master em ON UPPER(TRIM(em.employee_code)) = UPPER(TRIM(r.sa_employee_code))
)
SELECT tech_page_fuel || E'\t' || COUNT(*)::text
FROM enriched
GROUP BY tech_page_fuel
ORDER BY COUNT(*) DESC;
"

echo ""
echo "=== Last EV technician rows (14-day window) ==="
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc, invoice_date::date AS inv_date
  FROM public.job_card_closed_data
  WHERE invoice_date >= CURRENT_DATE - INTERVAL '14 days'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc, ta.bay_no, ta.technician_name
  FROM public.technician_assignments ta
  JOIN closed c ON c.jc = UPPER(TRIM(ta.job_card_number))
  WHERE ta.work_status = 'completed'
  ORDER BY UPPER(TRIM(ta.job_card_number)), ta.out_ts DESC NULLS LAST
),
reception AS (
  SELECT DISTINCT ON (UPPER(TRIM(sre.jc_number)))
    UPPER(TRIM(sre.jc_number)) AS jc,
    UPPER(TRIM(sre.portal)) AS vehicle_portal,
    sre.sa_employee_code
  FROM public.service_reception_entries sre
  JOIN completed c ON c.jc = UPPER(TRIM(sre.jc_number))
  ORDER BY UPPER(TRIM(sre.jc_number)), sre.created_at DESC
),
enriched AS (
  SELECT c.inv_date, comp.jc, comp.technician_name, comp.bay_no,
    r.vehicle_portal,
    COALESCE(NULLIF(UPPER(TRIM(em.fuel_type)), ''), NULLIF(r.vehicle_portal, ''), '') AS tech_page_fuel
  FROM closed c
  JOIN completed comp ON comp.jc = c.jc
  LEFT JOIN reception r ON r.jc = c.jc
  LEFT JOIN public.employee_master em ON UPPER(TRIM(em.employee_code)) = UPPER(TRIM(r.sa_employee_code))
)
SELECT inv_date::text || E'\t' || jc || E'\t' || COALESCE(technician_name,'') || E'\t' || COALESCE(bay_no,'') || E'\t' || COALESCE(vehicle_portal,'') || E'\t' || tech_page_fuel
FROM enriched
WHERE tech_page_fuel = 'EV' OR vehicle_portal = 'EV' OR UPPER(TRIM(bay_no)) LIKE 'EV-%'
ORDER BY inv_date DESC, jc
LIMIT 30;
"

echo ""
echo "=== Sitapura JP2 (EV branch) rows on Jul 10? ==="
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc, invoice_date::date AS inv_date
  FROM public.job_card_closed_data
  WHERE invoice_date = DATE '2026-07-10'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc, ta.bay_no, ta.technician_name, ta.technician_code
  FROM public.technician_assignments ta
  JOIN closed c ON c.jc = UPPER(TRIM(ta.job_card_number))
  WHERE ta.work_status = 'completed'
  ORDER BY UPPER(TRIM(ta.job_card_number)), ta.out_ts DESC NULLS LAST
)
SELECT jc || E'\t' || COALESCE(technician_name,'') || E'\t' || COALESCE(bay_no,'') || E'\t' ||
  CASE WHEN jc LIKE '%-JP2-%' THEN 'JP2/Sitapura' WHEN jc LIKE '%-JP1-%' THEN 'JP1/Ajmer Road' ELSE 'other' END
FROM completed
ORDER BY jc;
"
