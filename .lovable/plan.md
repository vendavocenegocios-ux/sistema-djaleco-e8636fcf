# Por que nada apareceu

Investiguei os logs e o banco. Há dois problemas distintos:

## 1. Mensagem que você digitou não entrou (webhook quebrado)

Log do `evolution-webhook`:

```
ERROR [webhook] insert error:
  code: 42P10
  message: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

A migration criou um índice único **parcial** (`WHERE evolution_message_id IS NOT NULL`). O Postgres exige que o `ON CONFLICT (evolution_message_id)` aponte para uma constraint/índice único *não parcial* (ou que o predicado seja inferível, o que o PostgREST não faz). Resultado: **toda mensagem nova falha ao salvar**, inclusive a que você enviou pelo celular.

## 2. "Importar histórico" não trouxe nada

A função executou sem erro (logs limpos) e respondeu — mas provavelmente o array `records` veio vazio. Possíveis causas:

- Formato de resposta da Evolution diferente do esperado (`messages.records` vs outro caminho).
- `remoteJid` montado errado (telefone armazenado com/sem DDI, máscara, etc.).
- Endpoint `/chat/findMessages/{instance}` pode exigir body diferente nesta versão da Evolution.

Hoje a função não loga nada disso, então estamos no escuro.

# Plano

## Passo 1 — Migration: corrigir a unicidade
- Dropar o índice parcial `crm_messages_evolution_message_id_key`.
- Criar uma constraint UNIQUE real em `crm_messages.evolution_message_id` (Postgres aceita múltiplos NULLs em UNIQUE, então mensagens manuais sem id continuam funcionando).

Isto sozinho já resolve o problema 1: novas mensagens recebidas/enviadas voltam a aparecer no grid e na conversa.

## Passo 2 — `evolution-import-history`: instrumentar e tolerar variações
- Logar: URL chamada, status, `remoteJid` usado, primeiras chaves do JSON e quantidade de `records` encontrados.
- Tentar mais caminhos no payload: `json.messages.records`, `json.records`, `json.data`, `json` (array direto).
- Se vier vazio com `@s.whatsapp.net`, tentar fallback com `@c.us`.
- Retornar no JSON de resposta `debug: { remoteJid, status, sample }` para o frontend mostrar no toast quando `imported = 0`.

## Passo 3 — Frontend (`CRMContato.tsx`)
- No clique de "Importar histórico", quando `imported = 0`, exibir toast com a info de debug (telefone usado, status da API) para facilitar diagnóstico.

## Passo 4 — Validar
- Reenviar uma mensagem pelo celular → deve aparecer no chat e o card ficar verde no `/crm`.
- Clicar em "Importar histórico" → checar logs e ver o que a Evolution está devolvendo; ajustar parser se necessário.

# Detalhes técnicos

Migration:
```sql
DROP INDEX IF EXISTS public.crm_messages_evolution_message_id_key;
ALTER TABLE public.crm_messages
  ADD CONSTRAINT crm_messages_evolution_message_id_key
  UNIQUE (evolution_message_id);
```

Nada de schema novo além disso; o resto é código de edge function + um toast no frontend.
