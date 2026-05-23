-- Add repair_stage column to panel_photos for pre-repair vs post-repair distinction
-- This allows PPT generation to filter photos based on repair stage

ALTER TABLE public.panel_photos 
ADD COLUMN repair_stage text DEFAULT 'pre-repair';

-- Add constraint for repair_stage values
ALTER TABLE public.panel_photos
ADD CONSTRAINT panel_photos_repair_stage_check CHECK (repair_stage IN ('pre-repair', 'post-repair'));

-- Create index for efficient filtering
CREATE INDEX idx_panel_photos_repair_stage ON public.panel_photos(repair_stage);

-- Add comment for documentation
COMMENT ON COLUMN public.panel_photos.repair_stage IS 
  'Denotes whether photo was taken during pre-repair or post-repair stage. Used to filter photos for respective PPT generation.';
