import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Truck, Package } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const currency = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PedidoQuickViewDialog({
  pedidoId,
  open,
  onOpenChange,
}: {
  pedidoId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: pedido, isLoading } = useQuery({
    queryKey: ["pedido_quickview", pedidoId],
    enabled: !!pedidoId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("*")
        .eq("id", pedidoId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: itens } = useQuery({
    queryKey: ["pedido_quickview_itens", pedidoId],
    enabled: !!pedidoId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedido_itens")
        .select("*")
        .eq("pedido_id", pedidoId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Pedido {pedido ? `#${pedido.numero_pedido}` : ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading || !pedido ? (
          <div className="h-40 rounded-md bg-muted animate-pulse" />
        ) : (
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {pedido.status_pagamento && (
                <Badge variant="outline">Pagamento: {pedido.status_pagamento}</Badge>
              )}
              {pedido.etapa_producao && (
                <Badge variant="outline">Produção: {pedido.etapa_producao}</Badge>
              )}
              {pedido.origem && (
                <Badge variant="secondary">{pedido.origem}</Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Data</p>
                <p className="font-medium">
                  {pedido.data_pedido
                    ? format(new Date(pedido.data_pedido), "dd/MM/yyyy HH:mm", { locale: ptBR })
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="font-medium">{pedido.cliente_nome || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Telefone</p>
                <p className="font-medium">{pedido.cliente_telefone || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Local</p>
                <p className="font-medium">
                  {[pedido.cidade, pedido.estado].filter(Boolean).join(" / ") || "—"}
                </p>
              </div>
            </div>

            {(pedido.endereco || pedido.bairro || pedido.cep) && (
              <div className="rounded-md border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground mb-1">Endereço</p>
                <p>{[pedido.endereco, pedido.bairro, pedido.cep].filter(Boolean).join(" · ")}</p>
              </div>
            )}

            {pedido.rastreio_codigo && (
              <div className="inline-flex items-center gap-2 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 px-3 py-1.5 text-xs">
                <Truck className="h-3.5 w-3.5" />
                Rastreio: {pedido.rastreio_codigo}
              </div>
            )}

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Itens</p>
              {!itens || itens.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem itens cadastrados.</p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {itens.map((it: any) => (
                    <li key={it.id} className="px-3 py-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{it.nome_produto}</p>
                        <p className="text-xs text-muted-foreground">
                          {[it.cor, it.tamanho].filter(Boolean).join(" · ")}
                          {it.cor || it.tamanho ? " · " : ""}Qtd: {it.quantidade}
                        </p>
                      </div>
                      <span className="font-medium text-sm">
                        {currency(Number(it.preco_unitario) * Number(it.quantidade))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Bruto</p>
                <p className="font-semibold">{currency(Number(pedido.valor_bruto))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Frete</p>
                <p className="font-semibold">{currency(Number(pedido.frete))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Líquido</p>
                <p className="font-semibold">{currency(Number(pedido.valor_liquido))}</p>
              </div>
            </div>

            {pedido.observacoes_pedido && (
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <p className="font-medium mb-1">Observações</p>
                <p className="whitespace-pre-wrap">{pedido.observacoes_pedido}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          {pedido && (
            <Button asChild>
              <Link to={`/pedidos/${pedido.id}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir pedido completo
              </Link>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}