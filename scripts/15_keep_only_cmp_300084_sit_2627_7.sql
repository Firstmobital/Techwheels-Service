-- Keep only CMP-300084-Sit-2627-7 and delete all other complaints
-- NOTE: Ticket comparison ignores spaces in ticket_number to handle formatting drift.
-- Run manually in Supabase SQL Editor.

begin;

-- Safety check: exactly one complaint must match the keep-ticket selector
DO $$
DECLARE
  keep_count integer;
BEGIN
  SELECT count(*)
  INTO keep_count
  FROM public.complaint_tickets
  WHERE replace(ticket_number, ' ', '') = 'CMP-300084-Sit-2627-7';

  IF keep_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly 1 complaint for CMP-300084-Sit-2627-7, found %; aborting delete.',
      keep_count;
  END IF;
END $$;

create temporary table _complaints_to_delete on commit drop as
select id
from public.complaint_tickets
where replace(ticket_number, ' ', '') <> 'CMP-300084-Sit-2627-7';

create temporary table _messages_to_delete on commit drop as
select id
from public.complaint_messages
where complaint_id in (select id from _complaints_to_delete);

-- Remove child rows first
DELETE FROM public.complaint_attachments
WHERE complaint_id IN (SELECT id FROM _complaints_to_delete)
   OR message_id IN (SELECT id FROM _messages_to_delete);

DELETE FROM public.complaint_activity
WHERE complaint_id IN (SELECT id FROM _complaints_to_delete);

DELETE FROM public.complaint_messages
WHERE complaint_id IN (SELECT id FROM _complaints_to_delete);

DELETE FROM public.complaint_access_links
WHERE complaint_id IN (SELECT id FROM _complaints_to_delete);

-- Finally remove complaint tickets
DELETE FROM public.complaint_tickets
WHERE id IN (SELECT id FROM _complaints_to_delete);

commit;

-- Post-check
select
  ticket_number,
  id,
  status,
  created_at
from public.complaint_tickets
order by created_at desc;
