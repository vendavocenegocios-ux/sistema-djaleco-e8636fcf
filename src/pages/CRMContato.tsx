import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Mail, Phone, Tag, MessageSquare, Package, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_OPTIONS = [
  { value: "lead", label: "Lead" },
  { value: "negociando", label: "Negociando" },
  { value: "cliente", label: "Cliente" },
  { value: "inativo", label: "Inativo" },
];

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  site: "Site",
  indicacao: "Indicação",
  outro: "Outro",
};

const currency = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export default function CRMContato() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [notas, setNotas] = useState("");

  const { data: contato, isLoading } = useQuery({
    queryKey: ["crm_contact", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  useEffect(() => {
    setNotas(contato?.notas ?? "");
  }, [contato?.id]);

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const { error } = await supabase
        .from("crm_contacts")
        .update({ status })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_contact", id] });
      toast.success("Status atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar status"),
  });

  const saveNotas = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("crm_contacts")
        .update({ notas })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_contact", id] });
      toast.success("Anotações salvas");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const tel = onlyDigits(contato?.telefone);
  const { data: pedidos } = useQuery({
    queryKey: ["crm_contact_pedidos", id, tel],
    enabled: !!contato && !!tel,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero_pedido, data_pedido, valor_bruto, cliente_telefone")
        .order("data_pedido", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((p) => onlyDigits(p.cliente_telefone).endsWith(tel.slice(-8)));
    },
  });

  const { data: mensagens } = useQuery({
    queryKey: ["crm_messages", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_messages")
        .select("*")
        .eq("contact_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="h-32 rounded-lg bg-muted animate-pulse" />
      </div>
    );
  }

  if (!contato) {
    return (
      <div className="p-6">
        <Button asChild variant="ghost" size="sm" className="mb-4">
          <Link to="/crm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Link>
        </Button>
        <p className="text-muted-foreground">Contato não encontrado.</p>
      </div>
    );
  }

  const initials = contato.nome
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <Button asChild variant="ghost" size="sm">
        <Link to="/crm">
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Link>
      </Button>

      <Card>
        <CardContent className="p-5">
          <div className="flex flex-col md:flex-row gap-5 md:items-center justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-14 w-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-lg shrink-0">
                {initials || "?"}
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold truncate">{contato.nome}</h1>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {contato.telefone}
                  </span>
                  {contato.email && (
                    <span className="inline-flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {contato.email}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    Origem:
                    <Badge variant="secondary">
                      {ORIGEM_LABEL[contato.origem ?? "whatsapp"] ?? contato.origem}
                    </Badge>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1 md:items-end">
              <span className="text-xs text-muted-foreground">Status</span>
              <Select
                value={contato.status ?? "lead"}
                onValueChange={(v) => updateStatus.mutate(v)}
                disabled={updateStatus.isPending}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {contato.tags && contato.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t">
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              {contato.tags.map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-4 w-4" /> Anotações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            placeholder="Adicione observações sobre este contato..."
            rows={5}
          />
          <div className="flex justify-end">
            <Button
              onClick={() => saveNotas.mutate()}
              disabled={saveNotas.isPending || notas === (contato.notas ?? "")}
            >
              {saveNotas.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" /> Pedidos Vinculados
            {pedidos && <Badge variant="secondary">{pedidos.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!pedidos || pedidos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pedido vinculado a este contato.</p>
          ) : (
            <div className="divide-y">
              {pedidos.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div className="flex flex-col">
                    <span className="font-medium">#{p.numero_pedido}</span>
                    <span className="text-xs text-muted-foreground">
                      {p.data_pedido ? format(new Date(p.data_pedido), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                    </span>
                  </div>
                  <span className="font-semibold">{currency(p.valor_bruto)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> Histórico de Mensagens
            {mensagens && <Badge variant="secondary">{mensagens.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!mensagens || mensagens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem registrada.</p>
          ) : (
            <div className="space-y-3">
              {mensagens.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-lg border p-3 text-sm ${
                    m.direcao === "recebida" ? "bg-muted/40" : "bg-primary/5"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <Badge variant="outline" className="text-[10px]">
                      {m.direcao === "recebida" ? "Recebida" : "Enviada"}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{m.conteudo}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}