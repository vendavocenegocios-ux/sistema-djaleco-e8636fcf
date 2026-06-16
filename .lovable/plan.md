## Objetivo

Transformar o /crm de uma lista simples em uma central de atendimento WhatsApp com:
1. Captura das mensagens enviadas pelo seu próprio celular
2. Destaque verde em contatos com mensagens não lidas
3. Visualização em Kanban com arrastar-e-soltar (Novo → Em atendimento → Aguardando → Resolvido)
4. Importação de histórico antigo via Evolution API

---

## 1. Banco de dados (migration)

**Tabela `crm_contacts`** — adicionar colunas:
- `status` (text, default `'novo'`) — coluna do kanban: `novo | em_atendimento | aguardando | resolvido`
- `unread_count` (int, default 0) — quantas mensagens não lidas
- `last_message_at` (timestamptz) — para ordenar contatos por atividade
- `last_message_preview` (text) — prévia da última mensagem (mostrada no card)

**Tabela `crm_messages`** — adicionar:
- `evolution_message_id` (text, unique) — id da mensagem na Evolution, evita duplicação quando webhook devolve mensagem enviada pelo CRM

**Trigger** em `crm_messages` (AFTER INSERT): atualiza no contato `last_message_at`, `last_message_preview`, e incrementa `unread_count` apenas quando `direcao = 'recebida'` (mensagens enviadas não contam como não lidas).

---

## 2. Webhook (`evolution-webhook`)

Hoje grava tudo como `recebida`. Mudar para:
- Ler `data.key.fromMe` do payload
- `fromMe: true` → grava `direcao: 'enviada'` (resposta que você mandou pelo celular aparece no chat)
- `fromMe: false` → grava `direcao: 'recebida'`
- Salvar `evolution_message_id = data.key.id`
- Usar **upsert** por `evolution_message_id` para evitar duplicar mensagens enviadas pelo CRM (que voltam pelo webhook)

---

## 3. Envio pelo CRM (`evolution-send-message`)

- Capturar o `key.id` retornado pela Evolution e salvar em `evolution_message_id`
- A inserção otimista local na UI continua, mas agora carregando esse id quando a Evolution responder

---

## 4. Importação de histórico (nova edge function)

Criar `evolution-import-history`:
- Recebe `contact_id`
- Busca telefone do contato no banco
- Chama `POST {EVOLUTION_API_URL}/chat/findMessages/{EVOLUTION_CRM_INSTANCE}` com filtro pelo número
- Para cada mensagem: faz upsert em `crm_messages` por `evolution_message_id` (não duplica)
- Retorna quantidade importada

Botão "Importar histórico" no header do `/crm/:id`.

Observação: a Evolution só retorna o que ainda está no cache da instância — mensagens muito antigas podem não voltar. Isso é uma limitação da API, não do código.

---

## 5. UI — Lista de contatos (`/crm`)

**Toggle no topo**: `Lista` | `Kanban`

### Modo Lista (atual, refinado)
- Cada item mostra: nome, prévia da última mensagem, horário relativo
- Se `unread_count > 0`: fundo verde claro (`bg-green-50`), badge verde com o número, indicador bolinha verde
- Ordenado por `last_message_at DESC`

### Modo Kanban (novo)
- 4 colunas: **Novo** | **Em atendimento** | **Aguardando** | **Resolvido**
- Cada card = contato (nome, prévia, badge não lidas verde)
- Drag-and-drop com `@dnd-kit/core` (já compatível, leve, funciona em mobile com `TouchSensor`) — soltar em outra coluna faz `UPDATE crm_contacts SET status = ...`
- Realtime: subscription em `crm_contacts` para mover cards quando outro usuário arrastar ou quando chegar nova mensagem (vira coluna "Novo" se estava "Resolvido")

---

## 6. Marcar como lido

Ao abrir `/crm/:id`: `UPDATE crm_contacts SET unread_count = 0 WHERE id = :id`.
Verde some automaticamente na lista/kanban via realtime.

---

## 7. Resumo de arquivos

**Migration nova**:
- altera `crm_contacts` (4 colunas)
- altera `crm_messages` (1 coluna + índice único)
- cria trigger de agregação
- habilita realtime em `crm_contacts`

**Edge functions**:
- `evolution-webhook/index.ts` — tratar fromMe + upsert por message_id
- `evolution-send-message/index.ts` — salvar message_id retornado
- `evolution-import-history/index.ts` — nova função

**Frontend**:
- `src/pages/CRM.tsx` — toggle Lista/Kanban, destaque verde, ordenação por última mensagem
- novo `src/components/crm/KanbanBoard.tsx` — colunas + dnd-kit
- novo `src/components/crm/ContactCard.tsx` — card reutilizado em lista e kanban
- `src/pages/CRMContato.tsx` — botão "Importar histórico" + marcar como lido ao montar
- `package.json` — adicionar `@dnd-kit/core` e `@dnd-kit/sortable`

---

## Dúvida em aberto (responda antes de eu implementar)

Quando você arrasta um card para **Resolvido** e depois chega mensagem nova do mesmo contato, o que acontece?
- (a) Volta automaticamente para "Novo" (recomendado — você não perde o cliente)
- (b) Fica em "Resolvido" mas pisca verde
- (c) Fica em "Resolvido" silenciosamente

Me diga qual prefere e eu parto pra implementação.