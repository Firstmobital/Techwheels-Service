-- Expand panel photo repair stage support for stage-wise upload UX.
-- Authoritative baseline: local_folder/backups/full_database.sql
-- Existing check allows only pre-repair/post-repair; include under-repair.

ALTER TABLE public.panel_photos
DROP CONSTRAINT IF EXISTS panel_photos_repair_stage_check;

ALTER TABLE public.panel_photos
ADD CONSTRAINT panel_photos_repair_stage_check
CHECK (
  repair_stage = ANY (
    ARRAY[
      'pre-repair'::text,
      'under-repair'::text,
      'post-repair'::text
    ]
  )
);

COMMENT ON COLUMN public.panel_photos.repair_stage IS
  'Denotes whether photo was taken during pre-repair, under-repair, or post-repair stage. Used to filter photos for stage-specific workflows and PPT generation.';
