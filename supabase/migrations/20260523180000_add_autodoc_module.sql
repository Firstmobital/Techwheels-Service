-- Add AutoDoc as a top-level module
-- Purpose: Enable RBAC permission assignment for vehicle documentation workflows

INSERT INTO public.modules (
  id,
  name,
  label,
  description,
  icon,
  route,
  sort_order,
  is_active,
  created_at
) VALUES (
  9,
  'autodoc',
  'AutoDoc',
  'Vehicle documentation, panels, photos, and damage estimates',
  '📋',
  '/autodoc',
  9,
  true,
  now()
);

-- Update sequence to ensure future auto-increment starts from next available ID
SELECT setval('public.modules_id_seq', (SELECT MAX(id) FROM public.modules));
