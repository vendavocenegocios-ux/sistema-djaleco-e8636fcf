DROP INDEX IF EXISTS public.crm_messages_evolution_message_id_key;
ALTER TABLE public.crm_messages
  ADD CONSTRAINT crm_messages_evolution_message_id_key UNIQUE (evolution_message_id);