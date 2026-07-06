-- CASCADE complaint FKs on service_reception_entries delete
--
-- Context: complaint_access_links and complaint_tickets both have
-- reception_entry_id NOT NULL with no delete action (implicit NO ACTION /
-- RESTRICT). This blocks deletion of reception entries that have a complaint
-- link or ticket. Since complaints are logically owned by the reception entry,
-- they should be removed when the entry is deleted.
--
-- Changes:
--   complaint_access_links_reception_entry_id_fkey  → ON DELETE CASCADE
--   complaint_tickets_reception_entry_id_fkey        → ON DELETE CASCADE
--
-- Both tables have UNIQUE (reception_entry_id) so max one row per entry.

-- complaint_access_links
ALTER TABLE public.complaint_access_links
  DROP CONSTRAINT complaint_access_links_reception_entry_id_fkey;

ALTER TABLE public.complaint_access_links
  ADD CONSTRAINT complaint_access_links_reception_entry_id_fkey
    FOREIGN KEY (reception_entry_id)
    REFERENCES public.service_reception_entries(id)
    ON DELETE CASCADE;

-- complaint_tickets
ALTER TABLE public.complaint_tickets
  DROP CONSTRAINT complaint_tickets_reception_entry_id_fkey;

ALTER TABLE public.complaint_tickets
  ADD CONSTRAINT complaint_tickets_reception_entry_id_fkey
    FOREIGN KEY (reception_entry_id)
    REFERENCES public.service_reception_entries(id)
    ON DELETE CASCADE;
