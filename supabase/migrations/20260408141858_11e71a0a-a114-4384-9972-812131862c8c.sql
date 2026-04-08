
CREATE TABLE public.system_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read system_settings"
  ON public.system_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage system_settings"
  ON public.system_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.system_settings (key, value) VALUES
  ('webhook_producao', 'https://n8n.vendavocenegocios.com.br/webhook/recuperar-carrinho'),
  ('webhook_teste', 'https://n8n.vendavocenegocios.com.br/webhook-test/recuperar-carrinho'),
  ('webhook_ativo', 'producao');
