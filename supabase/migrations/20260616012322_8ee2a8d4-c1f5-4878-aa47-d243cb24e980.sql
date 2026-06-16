
-- Add columns to crm_contacts
ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS unread_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_message_preview text;

-- Add evolution_message_id to crm_messages
ALTER TABLE public.crm_messages
  ADD COLUMN IF NOT EXISTS evolution_message_id text;

CREATE UNIQUE INDEX IF NOT EXISTS crm_messages_evolution_message_id_key
  ON public.crm_messages(evolution_message_id)
  WHERE evolution_message_id IS NOT NULL;

-- Trigger function: on message insert, update contact aggregates
CREATE OR REPLACE FUNCTION public.crm_messages_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direcao = 'recebida' THEN
    UPDATE public.crm_contacts
       SET last_message_at = NEW.created_at,
           last_message_preview = LEFT(NEW.conteudo, 120),
           unread_count = unread_count + 1,
           status = CASE WHEN status = 'resolvido' THEN 'novo' ELSE status END,
           updated_at = now()
     WHERE id = NEW.contact_id;
  ELSE
    UPDATE public.crm_contacts
       SET last_message_at = NEW.created_at,
           last_message_preview = LEFT(NEW.conteudo, 120),
           updated_at = now()
     WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_messages_after_insert_trg ON public.crm_messages;
CREATE TRIGGER crm_messages_after_insert_trg
  AFTER INSERT ON public.crm_messages
  FOR EACH ROW EXECUTE FUNCTION public.crm_messages_after_insert();

-- Enable realtime for crm_contacts
ALTER TABLE public.crm_contacts REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'crm_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_contacts;
  END IF;
END$$;

-- Backfill last_message_at / preview from existing messages
UPDATE public.crm_contacts c
   SET last_message_at = m.last_at,
       last_message_preview = LEFT(m.last_content, 120)
  FROM (
    SELECT DISTINCT ON (contact_id)
      contact_id, created_at AS last_at, conteudo AS last_content
    FROM public.crm_messages
    ORDER BY contact_id, created_at DESC
  ) m
 WHERE m.contact_id = c.id;
