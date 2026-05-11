begin;

-- View for latest on-hand stock snapshot per part/branch/portal
create or replace view public.vw_parts_latest_stock as
select
  s.id,
  s.part_number,
  s.part_description,
  s.branch,
  s.portal,
  s.snapshot_date,
  s.on_hand_quantity,
  s.weighted_avg_cost,
  s.total_price_value,
  s.weighted_cost,
  s.inventory_value,
  s.last_issue_date,
  s.last_received_date,
  s.availability_status,
  s.status,
  s.location_1,
  s.inventory_location,
  s.location_2,
  s.location_3,
  s.created_at,
  s.updated_at,
  p.vendor,
  p.dealer_name,
  p.product_line,
  p.product_category,
  p.hsn_code,
  p.tm_part_indicator
from public.service_parts_stock_snapshot_data s
left join public.part_master p on s.part_number = p.part_number
where (s.branch, s.portal, s.snapshot_date) in (
  select branch, portal, max(snapshot_date)
  from public.service_parts_stock_snapshot_data
  group by branch, portal
);

-- View for active orders per part/branch/portal
create or replace view public.vw_parts_active_orders as
select
  o.id,
  o.part_number,
  o.part_description,
  o.branch,
  o.portal,
  o.order_date,
  o.expected_date,
  o.ordered_quantity,
  o.received_quantity,
  o.backorder_quantity,
  o.intransit_qty,
  o.order_status,
  o.confirmation_date,
  o.confirmation_qty,
  o.invoice_date,
  o.invoice_qty,
  o.challan_date,
  o.challan_qty,
  o.eta_1,
  o.eta_2,
  o.eta_3,
  o.div_id,
  o.dealer_name,
  o.invoice_number,
  o.crm_order_number,
  o.sap_order_number,
  o.sap_order_line_item,
  o.spares_order_type,
  o.docket_number,
  o.created_at,
  o.updated_at,
  p.vendor,
  p.product_line,
  p.product_category,
  p.hsn_code
from public.service_parts_order_data o
left join public.part_master p on o.part_number = p.part_number
where o.order_status != 'Received';

-- View for parts consumption trend (latest 12 months/fiscal periods)
create or replace view public.vw_parts_consumption_trend as
select
  c.part_number,
  c.part_description,
  c.branch,
  c.portal,
  c.fiscal_year,
  c.month_name,
  c.otc_quantity,
  c.ws_quantity,
  c.total_consumption,
  c.unit_cost,
  c.total_cost,
  c.created_at,
  c.updated_at,
  p.vendor,
  p.product_line,
  p.product_category,
  p.hsn_code
from public.service_parts_consumption_data c
left join public.part_master p on c.part_number = p.part_number
where c.fiscal_year is not null and c.month_name is not null;

-- View for 4-week average consumption per part/portal
create or replace view public.vw_parts_avg_consumption as
select
  part_number,
  branch,
  portal,
  round(avg(total_consumption)::numeric, 2) as avg_4week_consumption,
  sum(total_consumption) as total_4week_consumption,
  count(*) as period_count
from public.service_parts_consumption_data
where total_consumption > 0
  and created_at > now() - interval '4 weeks'
group by part_number, branch, portal;

-- View for stock health analysis (combining stock, consumption, and orders)
create or replace view public.vw_parts_stock_health as
select
  s.part_number,
  s.part_description,
  s.branch,
  s.portal,
  s.on_hand_quantity,
  ac.avg_4week_consumption,
  case
    when ac.avg_4week_consumption > 0
    then round((s.on_hand_quantity / ac.avg_4week_consumption * 7)::numeric, 2)
    else 0
  end as days_of_supply,
  case
    when ac.avg_4week_consumption > 0
    then round((s.on_hand_quantity / (ac.avg_4week_consumption / 4))::numeric, 2)
    else 0
  end as weeks_of_supply,
  coalesce(ao.intransit_qty, 0) as intransit_qty,
  coalesce(ao.eta_1, ao.eta_2, ao.eta_3) as nearest_eta,
  s.location_1,
  s.inventory_location,
  s.total_price_value,
  s.vendor,
  s.product_category,
  s.availability_status,
  s.status
from public.vw_parts_latest_stock s
left join public.vw_parts_avg_consumption ac
  on s.part_number = ac.part_number
  and s.branch = ac.branch
  and s.portal = ac.portal
left join public.vw_parts_active_orders ao
  on s.part_number = ao.part_number
  and s.branch = ao.branch
  and s.portal = ao.portal;

commit;
