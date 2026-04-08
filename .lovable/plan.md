

## Plano: Configuração de Webhooks na página Sistema

### Problema atual
As URLs de webhook (produção e teste) estão hardcoded no código da página CarrinhosAbandonados e a seleção é salva via `localStorage`. Isso dificulta a gestão centralizada.

### O que será feito

**1. Criar tabela `system_settings` no Supabase**
- Tabela key-value para armazenar configurações do sistema (webhook_producao, webhook_teste, webhook_ativo)
- RLS para authenticated users

**2. Adicionar seção "Webhooks" na página Sistema**
- Dois campos editáveis: URL de Produção e URL de Teste (pré-populados com os valores atuais)
- Seletor (radio/toggle) para escolher qual está ativo: Produção ou Teste
- Botão "Salvar" que persiste no Supabase
- Label claro: "Webhook de disparo — Recuperação de Carrinho"

**3. Atualizar CarrinhosAbandonados**
- Ao invés de ler do localStorage/hardcode, buscar a URL ativa da tabela `system_settings`
- Remover o seletor de webhook inline (já que será gerido centralmente no Sistema)
- Manter badge indicando qual ambiente está ativo

### Valores padrão
- Produção: `https://n8n.vendavocenegocios.com.br/webhook/recuperar-carrinho`
- Teste: `https://n8n.vendavocenegocios.com.br/webhook-test/recuperar-carrinho`

### Detalhes técnicos
- Migration SQL: `CREATE TABLE system_settings (key text PRIMARY KEY, value text, updated_at timestamptz DEFAULT now())`
- Seed com 3 registros: `webhook_producao`, `webhook_teste`, `webhook_ativo` (valor: "producao")
- Hook `useSystemSettings` para ler/atualizar as configurações
- Na página Sistema: nova seção com inputs + toggle + save
- Na CarrinhosAbandonados: query `system_settings` para obter a URL correta

