-- Migration: Clear all job card data and start fresh
-- Date: 2026-05-26
-- Purpose: Reset job_cards, panels, panel_photos, documents to empty state
-- Schema is preserved; only data is removed

-- Truncate tables in order of FK dependencies (reverse of creation order)
TRUNCATE TABLE public.documents CASCADE;
TRUNCATE TABLE public.panel_photos CASCADE;
TRUNCATE TABLE public.panels CASCADE;
TRUNCATE TABLE public.job_cards CASCADE;

-- Verify truncation (optional - remove if running in production)
-- SELECT 'job_cards' as table_name, COUNT(*) as row_count FROM public.job_cards
-- UNION ALL
-- SELECT 'panels', COUNT(*) FROM public.panels
-- UNION ALL
-- SELECT 'panel_photos', COUNT(*) FROM public.panel_photos
-- UNION ALL
-- SELECT 'documents', COUNT(*) FROM public.documents;
