begin;
-- Extend part_master with vendor, dealer, and product metadata
alter table if exists public.part_master
  add column if not exists vendor text,
  add column if not exists dealer_name text,
  add column if not exists product_line text,
  add column if not exists product_category text,
  add column if not exists hsn_code text,
  add column if not exists tm_part_indicator text,
  add column if not exists uom text;
-- Indexes for filtering reports by vendor/category
create index if not exists idx_part_master_vendor_category
  on public.part_master (vendor, product_category);
create index if not exists idx_part_master_product_line
  on public.part_master (product_line);
commit;
