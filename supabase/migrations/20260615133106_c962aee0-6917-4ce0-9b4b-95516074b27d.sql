-- Atualiza valores nulos para o padrão
UPDATE public.crm_contacts SET origem = 'whatsapp' WHERE origem IS NULL;

-- Define o valor padrão para a coluna
ALTER TABLE public.crm_contacts ALTER COLUMN origem SET DEFAULT 'whatsapp';

-- Adiciona constraint de valores permitidos
ALTER TABLE public.crm_contacts ADD CONSTRAINT crm_contacts_origem_check CHECK (origem IN ('whatsapp', 'site', 'indicacao', 'outro'));