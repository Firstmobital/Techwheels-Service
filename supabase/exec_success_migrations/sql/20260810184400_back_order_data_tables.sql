-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Back Order Data tables for VOR BO Report + Co-Dealer Stock
-- Date: 2026-08-10
-- ─────────────────────────────────────────────────────────────────────────────

-- Table 1: back_order_vor_data — VOR BO REPORT (Sheet 1)
-- Parts NOT available with Tata Motors (Back Order)
CREATE TABLE IF NOT EXISTS public.back_order_vor_data (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_session_id text,
  part_number     text,
  part_description text,
  bo_quantity     numeric,
  -- Store all raw columns for flexibility
  source_row_data jsonb,
  created_at      timestamptz DEFAULT now()
);

-- Index for fast part number search
CREATE INDEX IF NOT EXISTS idx_back_order_vor_part_number
  ON public.back_order_vor_data (upper(part_number));

-- Table 2: back_order_cp_stock_data — AVL WITH CP STOCK (Sheet 2)
-- Parts available with Co-Dealers
CREATE TABLE IF NOT EXISTS public.back_order_cp_stock_data (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_session_id text,
  part_number     text,
  part_description text,
  co_dealer_name  text,
  dealer_code     text,
  available_qty   numeric,
  -- Store all raw columns for flexibility
  source_row_data jsonb,
  created_at      timestamptz DEFAULT now()
);

-- Index for fast part number search
CREATE INDEX IF NOT EXISTS idx_back_order_cp_stock_part_number
  ON public.back_order_cp_stock_data (upper(part_number));

-- RLS policies (same pattern as other import tables — authenticated users can read/write)
ALTER TABLE public.back_order_vor_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.back_order_cp_stock_data ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent)
DROP POLICY IF EXISTS "bo_vor_select_authenticated" ON public.back_order_vor_data;
DROP POLICY IF EXISTS "bo_vor_insert_authenticated" ON public.back_order_vor_data;
DROP POLICY IF EXISTS "bo_vor_delete_authenticated" ON public.back_order_vor_data;
DROP POLICY IF EXISTS "bo_cp_select_authenticated" ON public.back_order_cp_stock_data;
DROP POLICY IF EXISTS "bo_cp_insert_authenticated" ON public.back_order_cp_stock_data;
DROP POLICY IF EXISTS "bo_cp_delete_authenticated" ON public.back_order_cp_stock_data;

CREATE POLICY "bo_vor_select_authenticated" ON public.back_order_vor_data
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "bo_vor_insert_authenticated" ON public.back_order_vor_data
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bo_vor_delete_authenticated" ON public.back_order_vor_data
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "bo_cp_select_authenticated" ON public.back_order_cp_stock_data
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "bo_cp_insert_authenticated" ON public.back_order_cp_stock_data
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bo_cp_delete_authenticated" ON public.back_order_cp_stock_data
  FOR DELETE TO authenticated USING (true);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.back_order_vor_data TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.back_order_cp_stock_data TO authenticated;
