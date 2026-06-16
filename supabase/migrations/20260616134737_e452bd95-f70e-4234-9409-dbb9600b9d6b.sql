
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS push_name text;

ALTER TABLE public.crm_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS crm_messages_contact_active_idx
  ON public.crm_messages (contact_id, created_at)
  WHERE deleted_at IS NULL;
