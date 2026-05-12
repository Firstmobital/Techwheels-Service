CREATE OR REPLACE VIEW public.vw_parts_stock_health AS
WITH latest_snapshot AS (
  SELECT
    branch,
    portal,
    MAX(snapshot_date) AS snapshot_date
  FROM public.service_parts_stock_snapshot_data
  GROUP BY branch, portal
),
latest_stock AS (
  SELECT
    s.part_number,
    s.part_description,
    s.branch,
    s.portal,
    s.on_hand_quantity,
    s.location_1,
    s.inventory_location,
    s.total_price_value,
    s.availability_status,
    s.status,
    p.vendor,
    p.category AS product_category
  FROM public.service_parts_stock_snapshot_data s
  LEFT JOIN public.part_master p
    ON s.part_number = p.part_number
  INNER JOIN latest_snapshot ls
    ON s.branch = ls.branch
    AND s.portal = ls.portal
    AND s.snapshot_date = ls.snapshot_date
),
avg_consumption AS (
  SELECT
    part_number,
    branch,
    portal,
    ROUND(AVG(total_consumption)::numeric, 2) AS avg_4week_consumption
  FROM public.service_parts_consumption_data
  WHERE total_consumption > 0
    AND created_at > NOW() - INTERVAL '4 weeks'
  GROUP BY part_number, branch, portal
),
active_orders AS (
  SELECT
    part_number,
    branch,
    portal,
    SUM(COALESCE(intransit_qty, 0)) AS intransit_qty,
    MIN(COALESCE(eta_1, eta_2, eta_3)) AS nearest_eta
  FROM public.service_parts_order_data
  WHERE COALESCE(order_status, '') != 'Received'
  GROUP BY part_number, branch, portal
),
last_issue AS (
  SELECT
    part_number,
    branch,
    MAX(last_issue_date) AS last_issue_date
  FROM public.service_parts_stock_snapshot_data
  GROUP BY part_number, branch
),
consumption_totals AS (
  SELECT
    part_number,
    branch,
    SUM(COALESCE(otc_quantity, 0)) AS otc_total,
    SUM(COALESCE(ws_quantity, 0)) AS ws_total
  FROM public.service_parts_consumption_data
  GROUP BY part_number, branch
)
SELECT
  s.part_number,
  s.part_description,
  s.branch,
  s.portal,
  s.on_hand_quantity,
  ac.avg_4week_consumption,
  CASE
    WHEN ac.avg_4week_consumption > 0
    THEN ROUND((s.on_hand_quantity / ac.avg_4week_consumption * 7)::numeric, 2)
    ELSE 0
  END AS days_of_supply,
  CASE
    WHEN ac.avg_4week_consumption > 0
    THEN ROUND((s.on_hand_quantity / (ac.avg_4week_consumption / 4))::numeric, 2)
    ELSE 0
  END AS weeks_of_supply,
  COALESCE(ao.intransit_qty, 0) AS intransit_qty,
  ao.nearest_eta,
  s.location_1,
  s.inventory_location,
  s.total_price_value,
  s.vendor,
  s.product_category,
  s.availability_status,
  s.status,
  li.last_issue_date,
  COALESCE(ct.otc_total, 0) AS otc_total,
  COALESCE(ct.ws_total, 0) AS ws_total,
  (li.last_issue_date IS NULL OR li.last_issue_date < NOW() - INTERVAL '90 days') AS is_dead_stock,
  (s.on_hand_quantity / NULLIF(ac.avg_4week_consumption * 4.33, 0)) AS months_of_stock
FROM latest_stock s
LEFT JOIN avg_consumption ac
  ON s.part_number = ac.part_number
  AND s.branch = ac.branch
  AND s.portal = ac.portal
LEFT JOIN active_orders ao
  ON s.part_number = ao.part_number
  AND s.branch = ao.branch
  AND s.portal = ao.portal
LEFT JOIN last_issue li
  ON s.part_number = li.part_number
  AND s.branch = li.branch
LEFT JOIN consumption_totals ct
  ON s.part_number = ct.part_number
  AND s.branch = ct.branch;
