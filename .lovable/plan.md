
## Análise dos Dados

Aqui está o resumo mensal extraído diretamente do banco de dados (campo `data_pedido`):

| Mês | Pedidos | Fat. Bruto | Pendentes |
|-----|---------|-----------|-----------|
| Mai/2026 | 2 | R$ 773,19 | 0 |
| Abr/2026 | 27 | R$ 8.584,85 | 2 (R$ 382) |
| Mar/2026 | 26 | R$ 7.098,43 | 4 site (R$ 953) + 2 whatsapp (R$ 0) |
| Fev/2026 | 18 | R$ 5.992,41 | 2 (R$ 384) |
| Jan/2026 | 23 | R$ 7.267,87 | 1 (R$ 619) |
| Dez/2025 | 12 | R$ 4.278,74 | 2 (R$ 552) |
| Nov/2025 | 13 | R$ 5.439,52 | 0 |

**Possíveis causas de divergência com o site Nuvemshop:**

1. **Frete incluso no valor bruto**: O campo `valor_bruto` no sistema vem do campo `total` da Nuvemshop, que inclui frete. Se o painel da Nuvemshop mostra "receita" sem frete, os valores serão diferentes.
2. **Pedidos pendentes contam no total**: O sistema conta TODOS os pedidos (pagos + pendentes). Pedidos cancelados ou não pagos na Nuvemshop podem ter sido sincronizados.
3. **Pedidos WhatsApp com valor R$ 0**: Existem 2 pedidos manuais em Mar/2026 com valor zero, inflando a contagem.

## Alterações Propostas

### 1. Adicionar card "Qtd. Pedidos" na Visão Geral do Financeiro

Na página Financeiro (`src/pages/Financeiro.tsx`), adicionar um novo card na grid de resumo (linha ~392) mostrando `filteredPedidos.length` como quantidade de pedidos no período selecionado.

O grid passará de 5 para 6 cards:
- **Qtd. Pedidos** (novo)
- Fat. Bruto
- Fat. Líquido
- Frete
- Taxas Pagar.me
- Comissões

### 2. Adicionar quantidade no gráfico mensal

Modificar o `chartData` para incluir também a quantidade de pedidos por mês, e exibir essa informação no tooltip do gráfico de barras.

### 3. Separar pedidos pagos vs pendentes nos totais

Adicionar uma indicação visual nos cards mostrando quanto do faturamento bruto é de pedidos com `status_pagamento = 'recebido'` vs `'pendente'`, para facilitar a comparação com a Nuvemshop.
