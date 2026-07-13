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

if [[ -z "${SUPABASE_PROJECT_REF:-}" && "${SUPABASE_DB_USER:-}" == postgres.* ]]; then
  SUPABASE_PROJECT_REF="${SUPABASE_DB_USER#postgres.}"
fi

if [[ -n "${SUPABASE_DB_HOST:-}" && -n "${SUPABASE_DB_USER:-}" ]]; then
  DB_HOST="$SUPABASE_DB_HOST"
  DB_USER="$SUPABASE_DB_USER"
elif [[ -n "${SUPABASE_DB_DIRECT_HOST:-}" ]]; then
  DB_HOST="$SUPABASE_DB_DIRECT_HOST"
  DB_USER="${SUPABASE_DB_DIRECT_USER:-postgres}"
elif [[ -n "${SUPABASE_PROJECT_REF:-}" ]]; then
  DB_HOST="db.${SUPABASE_PROJECT_REF}.supabase.co"
  DB_USER="postgres"
else
  echo "Error: set SUPABASE_DB_HOST+SUPABASE_DB_USER or SUPABASE_PROJECT_REF" >&2
  exit 1
fi

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
PSQL=(psql -h "$DB_HOST" -p "$SUPABASE_DB_PORT" -U "$DB_USER" -d "$SUPABASE_DB_NAME" -v ON_ERROR_STOP=1 -At)

TARGET_DATE="${1:-2026-07-10}"

echo "=== Technician EV/PV Root Cause DB Check ==="
echo "Target invoice_date: $TARGET_DATE"
echo ""

run_sql() {
  "${PSQL[@]}" -c "$1"
}

echo "--- 1) Closed JCs invoiced on target date ---"
run_sql "
SELECT COUNT(*) AS closed_jc_count
FROM public.job_card_closed_data
WHERE invoice_date = DATE '$TARGET_DATE';
"

echo ""
echo "--- 2) Portal classification summary (simulates Technician page logic) ---"
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc, invoice_date
  FROM public.job_card_closed_data
  WHERE invoice_date = DATE '$TARGET_DATE'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc,
    ta.technician_name,
    ta.bay_no,
    ta.work_status
  FROM public.technician_assignments ta
  JOIN closed c ON c.jc = UPPER(TRIM(ta.job_card_number))
  WHERE ta.work_status = 'completed'
  ORDER BY UPPER(TRIM(ta.job_card_number)), ta.out_ts DESC NULLS LAST
),
reception AS (
  SELECT DISTINCT ON (UPPER(TRIM(sre.jc_number)))
    UPPER(TRIM(sre.jc_number)) AS jc,
    UPPER(TRIM(sre.portal)) AS vehicle_portal,
    sre.sa_employee_code,
    sre.sa_name,
    sre.created_at
  FROM public.service_reception_entries sre
  JOIN completed c ON c.jc = UPPER(TRIM(sre.jc_number))
  ORDER BY UPPER(TRIM(sre.jc_number)), sre.created_at DESC
),
enriched AS (
  SELECT
    c.jc,
    c.technician_name,
    c.bay_no,
    r.vehicle_portal,
    r.sa_name,
    UPPER(TRIM(em.fuel_type)) AS sa_fuel_type,
    CASE
      WHEN UPPER(TRIM(c.bay_no)) LIKE 'EV-%' THEN 'EV'
      WHEN UPPER(TRIM(c.bay_no)) LIKE 'PV-%' THEN 'PV'
      ELSE NULL
    END AS bay_fuel,
    COALESCE(NULLIF(UPPER(TRIM(em.fuel_type)), ''), NULLIF(r.vehicle_portal, ''), '') AS tech_page_fuel
  FROM completed c
  LEFT JOIN reception r ON r.jc = c.jc
  LEFT JOIN public.employee_master em
    ON UPPER(TRIM(em.employee_code)) = UPPER(TRIM(r.sa_employee_code))
)
SELECT tech_page_fuel, COUNT(*) AS row_count
FROM enriched
GROUP BY tech_page_fuel
ORDER BY row_count DESC;
"

echo ""
echo "--- 3) Vehicle portal vs Technician page label ---"
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc
  FROM public.job_card_closed_data
  WHERE invoice_date = DATE '$TARGET_DATE'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc,
    ta.bay_no
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
  SELECT
    c.jc,
    c.bay_no,
    r.vehicle_portal,
    UPPER(TRIM(em.fuel_type)) AS sa_fuel_type,
    COALESCE(NULLIF(UPPER(TRIM(em.fuel_type)), ''), NULLIF(r.vehicle_portal, ''), '') AS tech_page_fuel
  FROM completed c
  LEFT JOIN reception r ON r.jc = c.jc
  LEFT JOIN public.employee_master em
    ON UPPER(TRIM(em.employee_code)) = UPPER(TRIM(r.sa_employee_code))
)
SELECT
  COUNT(*) FILTER (WHERE vehicle_portal = 'EV') AS vehicle_portal_ev,
  COUNT(*) FILTER (WHERE UPPER(TRIM(bay_no)) LIKE 'EV-%') AS bay_ev,
  COUNT(*) FILTER (WHERE vehicle_portal = 'EV' AND tech_page_fuel = 'PV') AS ev_vehicle_labeled_pv,
  COUNT(*) FILTER (WHERE UPPER(TRIM(bay_no)) LIKE 'EV-%' AND tech_page_fuel = 'PV') AS ev_bay_labeled_pv,
  COUNT(*) FILTER (WHERE tech_page_fuel = 'EV') AS tech_page_ev,
  COUNT(*) FILTER (WHERE tech_page_fuel = 'PV') AS tech_page_pv
FROM enriched;
"

echo ""
echo "--- 4) Misclassified rows: EV vehicle/bay but PV label (root cause candidates) ---"
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc
  FROM public.job_card_closed_data
  WHERE invoice_date = DATE '$TARGET_DATE'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc,
    ta.technician_name,
    ta.bay_no
  FROM public.technician_assignments ta
  JOIN closed c ON c.jc = UPPER(TRIM(ta.job_card_number))
  WHERE ta.work_status = 'completed'
  ORDER BY UPPER(TRIM(ta.job_card_number)), ta.out_ts DESC NULLS LAST
),
reception AS (
  SELECT DISTINCT ON (UPPER(TRIM(sre.jc_number)))
    UPPER(TRIM(sre.jc_number)) AS jc,
    UPPER(TRIM(sre.portal)) AS vehicle_portal,
    sre.sa_name,
    sre.sa_employee_code,
    sre.created_at
  FROM public.service_reception_entries sre
  JOIN completed c ON c.jc = UPPER(TRIM(sre.jc_number))
  ORDER BY UPPER(TRIM(sre.jc_number)), sre.created_at DESC
),
enriched AS (
  SELECT
    c.jc,
    c.technician_name,
    c.bay_no,
    r.vehicle_portal,
    r.sa_name,
    UPPER(TRIM(em.fuel_type)) AS sa_fuel_type,
    COALESCE(NULLIF(UPPER(TRIM(em.fuel_type)), ''), NULLIF(r.vehicle_portal, ''), '') AS tech_page_fuel
  FROM completed c
  LEFT JOIN reception r ON r.jc = c.jc
  LEFT JOIN public.employee_master em
    ON UPPER(TRIM(em.employee_code)) = UPPER(TRIM(r.sa_employee_code))
)
SELECT jc, technician_name, bay_no, vehicle_portal, sa_name, sa_fuel_type, tech_page_fuel
FROM enriched
WHERE tech_page_fuel = 'PV'
  AND (vehicle_portal = 'EV' OR UPPER(TRIM(bay_no)) LIKE 'EV-%')
ORDER BY jc
LIMIT 30;
"

echo ""
echo "--- 5) Lookback window: reception created_at age ---"
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc
  FROM public.job_card_closed_data
  WHERE invoice_date = DATE '$TARGET_DATE'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc
  FROM public.technician_assignments ta
  JOIN closed c ON c.jc = UPPER(TRIM(ta.job_card_number))
  WHERE ta.work_status = 'completed'
  ORDER BY UPPER(TRIM(ta.job_card_number)), ta.out_ts DESC NULLS LAST
),
reception AS (
  SELECT
    UPPER(TRIM(sre.jc_number)) AS jc,
    sre.created_at,
    UPPER(TRIM(sre.portal)) AS vehicle_portal
  FROM public.service_reception_entries sre
  JOIN completed c ON c.jc = UPPER(TRIM(sre.jc_number))
)
SELECT
  COUNT(*) AS reception_rows,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '60 days') AS older_than_60d,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '90 days') AS older_than_90d
FROM reception;
"

echo ""
echo "--- 6) Completed assignments with NO reception match ---"
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc
  FROM public.job_card_closed_data
  WHERE invoice_date = DATE '$TARGET_DATE'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc,
    ta.technician_name,
    ta.bay_no
  FROM public.technician_assignments ta
  JOIN closed c ON c.jc = UPPER(TRIM(ta.job_card_number))
  WHERE ta.work_status = 'completed'
  ORDER BY UPPER(TRIM(ta.job_card_number)), ta.out_ts DESC NULLS LAST
)
SELECT c.jc, c.technician_name, c.bay_no
FROM completed c
LEFT JOIN public.service_reception_entries sre
  ON UPPER(TRIM(sre.jc_number)) = c.jc
WHERE sre.id IS NULL
ORDER BY c.jc
LIMIT 20;
"

echo ""
echo "--- 7) Sample rows (first 20) ---"
run_sql "
WITH closed AS (
  SELECT UPPER(TRIM(job_card_number)) AS jc
  FROM public.job_card_closed_data
  WHERE invoice_date = DATE '$TARGET_DATE'
),
completed AS (
  SELECT DISTINCT ON (UPPER(TRIM(ta.job_card_number)))
    UPPER(TRIM(ta.job_card_number)) AS jc,
    ta.technician_name,
    ta.bay_no
  FROM public.technician_assignments ta
  JOIN closed c ON c.jc = UPPER(TRIM(ta.job_card_number))
  WHERE ta.work_status = 'completed'
  ORDER BY UPPER(TRIM(ta.job_card_number)), ta.out_ts DESC NULLS LAST
),
reception AS (
  SELECT DISTINCT ON (UPPER(TRIM(sre.jc_number)))
    UPPER(TRIM(sre.jc_number)) AS jc,
    UPPER(TRIM(sre.portal)) AS vehicle_portal,
    sre.sa_name,
    sre.sa_employee_code
  FROM public.service_reception_entries sre
  JOIN completed c ON c.jc = UPPER(TRIM(sre.jc_number))
  ORDER BY UPPER(TRIM(sre.jc_number)), sre.created_at DESC
),
enriched AS (
  SELECT
    c.jc,
    c.technician_name,
    c.bay_no,
    r.vehicle_portal,
    r.sa_name,
    UPPER(TRIM(em.fuel_type)) AS sa_fuel_type,
    COALESCE(NULLIF(UPPER(TRIM(em.fuel_type)), ''), NULLIF(r.vehicle_portal, ''), '') AS tech_page_fuel,
    CASE
      WHEN UPPER(TRIM(c.bay_no)) LIKE 'EV-%' THEN 'EV'
      WHEN UPPER(TRIM(c.bay_no)) LIKE 'PV-%' THEN 'PV'
      ELSE 'none'
    END AS income_bay_fuel
  FROM completed c
  LEFT JOIN reception r ON r.jc = c.jc
  LEFT JOIN public.employee_master em
    ON UPPER(TRIM(em.employee_code)) = UPPER(TRIM(r.sa_employee_code))
)
SELECT jc || '|' || COALESCE(technician_name,'') || '|' || COALESCE(bay_no,'') || '|portal=' || COALESCE(vehicle_portal,'') || '|saFuel=' || COALESCE(sa_fuel_type,'') || '|label=' || tech_page_fuel || '|incomeBay=' || income_bay_fuel
FROM enriched
ORDER BY jc
LIMIT 20;
"

echo ""
echo "Done."
