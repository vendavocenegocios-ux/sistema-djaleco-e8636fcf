
## Objetivos

1. Puxar nome e foto do contato (lead) do WhatsApp e permitir cadastro prévio
2. Tornar os pedidos vinculados clicáveis (popup de consulta)
3. Permitir apagar mensagens individualmente (ex.: spam)
4. Identificar pelo número se o contato já comprou no site ou ainda é lead

---

## 1. Nome e foto do lead (WhatsApp)

**Backend (migration):**
- Adicionar colunas em `crm_contacts`: `avatar_url text`, `push_name text` (nome que o cliente usa no WhatsApp, separado do `nome` editável manual).

**Edge functions:**
- `evolution-webhook`: ao receber mensagem, gravar `push_name` (vem em `data.pushName`) e, se ainda não houver `avatar_url`, chamar `/chat/fetchProfilePictureUrl/{instance}` na Evolution API e salvar a URL retornada.
- `evolution-import-history`: mesma lógica ao importar.
- Nova função `crm-refresh-contact-profile`: força refetch sob demanda (botão "Atualizar foto/nome") para um contato específico.

**Frontend (`CRMContato.tsx` e `CRM.tsx`):**
- Mostrar avatar (Avatar do shadcn) na lista da CRM e no header da conversa, com fallback nas iniciais.
- No cabeçalho do contato: se `nome` estiver vazio, exibir `push_name` como sugestão com botão "Salvar como nome do contato"; campo de nome editável continua existindo.
- Botão "Atualizar dados do WhatsApp" que dispara `crm-refresh-contact-profile`.

---

## 2. Identificar lead vs. cliente pelo número

**Lógica:**
- Normalizar `telefone` (apenas dígitos, sufixo de 10–11) e comparar contra `clientes.telefone` da tabela existente (alimentada pela Nuvemshop).
- Hook `useContactCustomerInfo(telefone)` que retorna `{ isCustomer, cliente, pedidos }` (busca cliente + últimos pedidos pelo telefone).

**UI:**
- Badge no header e na lista da CRM:
  - "Cliente" (verde) quando existe match em `clientes`
  - "Lead" (cinza) quando não existe
- Na sidebar do contato, abaixo do status, mostrar resumo do cliente quando aplicável (total de pedidos, total gasto, link para `/clientes/:id`).

**Pedidos vinculados:** já hoje a busca é por telefone normalizado — manter, apenas exibir contagem correta para clientes e ocultar a seção (ou mostrar "Nenhum pedido — lead novo") para leads.

---

## 3. Pedidos vinculados clicáveis (popup)

- Cada item da lista "Pedidos Vinculados" vira `<button>` que abre um `Dialog` (shadcn) com:
  - Cabeçalho: número, data, status pagamento, status produção
  - Cliente, endereço de entrega, rastreio
  - Itens do pedido (`pedido_itens`)
  - Valores (bruto, frete, líquido)
  - Botão "Abrir pedido completo" → navega para `/pedidos/:id` em nova aba
- Componente novo `PedidoQuickViewDialog.tsx` reutilizável, alimentado por hook que faz `select` em `pedidos` + `pedido_itens` por id.

---

## 4. Apagar mensagens

**Backend (migration):**
- Adicionar coluna `deleted_at timestamptz` em `crm_messages` (soft delete).
- Política RLS: admin pode atualizar `deleted_at`; usuários comuns apenas as próprias mensagens enviadas.

**Frontend:**
- Em cada bolha de mensagem, menu de contexto (ícone de três pontos no hover/long-press) com opção "Apagar mensagem".
- Confirmação via `AlertDialog`.
- Aplica `update` setando `deleted_at = now()`; query principal passa a filtrar `deleted_at is null`.
- Opcional: admins veem opção extra "Apagar para todos" que tenta também deletar na Evolution API (`/chat/deleteMessageForEveryone`). Fora do escopo inicial — apenas soft delete local agora.

---

## Detalhes técnicos

**Arquivos a criar:**
- `supabase/functions/crm-refresh-contact-profile/index.ts`
- `src/components/crm/PedidoQuickViewDialog.tsx`
- `src/components/crm/ContactAvatar.tsx`
- `src/hooks/useContactCustomerInfo.ts`

**Arquivos a editar:**
- `supabase/functions/evolution-webhook/index.ts` (capturar `pushName` + avatar)
- `supabase/functions/evolution-import-history/index.ts` (idem)
- `src/pages/CRM.tsx` (avatar + badge lead/cliente na lista)
- `src/pages/CRMContato.tsx` (header com avatar, botão atualizar, badge, popup pedido, menu apagar mensagem, filtro `deleted_at`)

**Migrations:**
1. `crm_contacts`: `avatar_url text`, `push_name text`
2. `crm_messages`: `deleted_at timestamptz` + ajuste de policy

Sem mudança em integrações externas além de chamadas adicionais à Evolution API já configurada.

---

## Fora do escopo (confirmar se quiser depois)

- Apagar mensagem "para todos" no WhatsApp via Evolution
- Sincronizar foto periodicamente em segundo plano (por enquanto: apenas quando chega mensagem nova ou via botão manual)
- Criar automaticamente um registro em `clientes` a partir do lead — hoje a tabela `clientes` é alimentada pela Nuvemshop; o "cadastro prévio" ficará apenas em `crm_contacts` (nome, email, notas, tags)
