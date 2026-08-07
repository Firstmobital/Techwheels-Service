-- Drop duplicate RPC overloads left when 20260807140000 added p_portal to
-- create_reception_entry / update_reception_entry (PostgreSQL keeps both
-- signatures unless the old one is dropped explicitly).

DROP FUNCTION IF EXISTS public.create_reception_entry(
  text, text, text, text, text, text, text, integer, text, text
);

DROP FUNCTION IF EXISTS public.update_reception_entry(
  bigint, text, text, text, text, text, text, text, integer, text, text
);
