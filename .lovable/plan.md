## Diagnóstico

A SuperFrete está autenticando, mas **nunca é chamada** porque `superfrete_order_id` está vazio em todos os pedidos. O campo `shipping_tracking_number` que vem do Nuvemshop está sendo gravado sempre em `rastreio_codigo`, mesmo quando o conteúdo é, na verdade, um ID interno da SuperFrete (hash hex de 32 caracteres) — e em casos antigos veio até um e-mail.

Diagnóstico dos 25 registros com rastreio:
- 2 são hashes hex de 32 chars (pedidos 427, 428) → na verdade são `superfrete_order_id`
- 1 tem espaço sobrando no final (pedido 431)
- 1 é um e-mail (pedido 152) → lixo
- 21 são códigos válidos dos Correios (formato `XX000000000BR`)

## Correção em duas frentes

### 1. Corrigir os dados existentes (data fix)
- Para cada pedido com `rastreio_codigo` de exatamente 32 caracteres hex (`^[a-f0-9]{32}$`): mover o valor para `superfrete_order_id` e zerar `rastreio_codigo`.
- Aparar espaços (`trim`) em todos os `rastreio_codigo`.
- Limpar `rastreio_codigo` quando o conteúdo for inválido (e-mail ou qualquer string que não case com o formato Correios `^[A-Z]{2}\d{9}[A-Z]{2}$` nem com hash hex de 32). Pedido 152 ficará sem rastreio.

### 2. Corrigir a sync e o webhook do Nuvemshop
Adicionar uma função utilitária `classifyTracking(raw)` em `nuvemshop-sync/index.ts` e `nuvemshop-webhook/index.ts` que devolve `{ rastreio_codigo, superfrete_order_id }` aplicando as mesmas regras de classificação acima. Trocar todos os pontos onde hoje se faz `rastreio_codigo: rastreioCodigo` por esse par de campos, tanto no INSERT quanto no UPDATE. Resultado: daqui em diante, IDs internos da SuperFrete vão para o campo certo e a edge function `superfrete-tracking` passa a conseguir consultar a API.

### Fora de escopo desta correção
- Investigar por que o Seu Rastreio devolveu 403 no nosso teste — pode ser bloqueio Cloudflare só do sandbox. Vou validar olhando os logs reais da edge function `superfrete-tracking` depois que ela voltar a ser chamada.
- Não vou rodar a `superfrete-tracking` em lote agora; com os campos corrigidos, basta clicar em "Rastrear" em qualquer pedido para validar.

## Detalhes técnicos

Regras de classificação:
```
trimmed = raw?.trim() || null
if (!trimmed) → ambos null
if (/^[a-f0-9]{32}$/i.test(trimmed)) → superfrete_order_id = trimmed
else if (/^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(trimmed)) → rastreio_codigo = trimmed.toUpperCase()
else → ambos null (não confiar em conteúdo desconhecido)
```

Arquivos alterados:
- `supabase/functions/nuvemshop-sync/index.ts` — usar `classifyTracking` em insert e update
- `supabase/functions/nuvemshop-webhook/index.ts` — idem
- Data fix via `supabase--insert` (UPDATE em `pedidos`) — sem migração de schema, apenas dados

Sem mudanças em UI, sem mudanças no schema do banco.