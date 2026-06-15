import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ArrowLeft,
  Send,
  Package,
  StickyNote,
  ChevronDown,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_atendimento", label: "Em Atendimento" },
  { value: "aguardando", label: "Aguardando" },
  { value: "resolvido", label: "Resolvido" },
];

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((s) => [s.value, s.label]),
);

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  site: "Site",
  indicacao: "Indicação",
  outro: "Outro",
};

const ORIGEM_CLASS: Record<string, string> = {
  whatsapp: "bg-green-100 text-green-800 border-green-200",
  site: "bg-purple-100 text-purple-800 border-purple-200",
  indicacao: "bg-orange-100 text-orange-800 border-orange-200",
  outro: "bg-muted text-muted-foreground",
};

const currency = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

const initialsOf = (name: string | null | undefined, fallback: string) =>
  (name && name.trim()
    ? name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("")
    : fallback.slice(-2)
  ).toUpperCase();

export default function CRMContato() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

  const [notas, setNotas] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [pedidosOpen, setPedidosOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    setNameDraft(contato?.nome ?? "");
  }, [contato?.id]);

  const updateContact = useMutation({
    mutationFn: async (patch: Partial<{ nome: string; status: string; notas: string }>) => {
      const { error } = await supabase
        .from("crm_contacts")
        .update(patch)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_contact", id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
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
      const suffix = tel.slice(-8);
      return (data ?? []).filter((p) =>
        onlyDigits(p.cliente_telefone).endsWith(suffix),
      );
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
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`crm_messages_${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "crm_messages",
          filter: `contact_id=eq.${id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["crm_messages", id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, qc]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens?.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !contato || sending) return;
    setSending(true);
    try {
      const { error: fnError } = await supabase.functions.invoke(
        "evolution-send-message",
        { body: { telefone: contato.telefone, mensagem: text } },
      );
      if (fnError) throw fnError;

      const { error: insertError } = await supabase.from("crm_messages").insert({
        contact_id: contato.id,
        conteudo: text,
        direcao: "enviada",
      });
      if (insertError) throw insertError;

      setDraft("");
      qc.invalidateQueries({ queryKey: ["crm_messages", id] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao enviar mensagem");
    } finally {
      setSending(false);
    }
  };

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

  const initials = initialsOf(contato.nome, contato.telefone ?? "?");
  const displayName = contato.nome || contato.telefone || "Sem nome";
  const origem = contato.origem ?? "outro";

  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-64px)] md:h-[calc(100vh-64px)] overflow-hidden">
      {/* Left panel */}
      <aside className="md:w-[35%] md:max-w-md border-b md:border-b-0 md:border-r bg-card overflow-y-auto">
        <div className="p-4 space-y-4">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link to="/crm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
            </Link>
          </Button>

          <div className="flex flex-col items-center text-center gap-3 pb-4 border-b">
            <div className="h-20 w-20 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-2xl">
              {initials}
            </div>

            {editingName ? (
              <div className="flex items-center gap-1 w-full">
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="h-8"
                  autoFocus
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    const v = nameDraft.trim();
                    if (v && v !== contato.nome) {
                      updateContact.mutate(
                        { nome: v },
                        { onSuccess: () => toast.success("Nome atualizado") },
                      );
                    }
                    setEditingName(false);
                  }}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    setNameDraft(contato.nome ?? "");
                    setEditingName(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="group inline-flex items-center gap-1.5 hover:text-primary"
              >
                <h1 className="text-lg font-semibold">{displayName}</h1>
                <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
              </button>
            )}

            <p className="text-sm text-muted-foreground">{contato.telefone}</p>
            <Badge variant="outline" className={ORIGEM_CLASS[origem] ?? ""}>
              {ORIGEM_LABEL[origem] ?? origem}
            </Badge>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Status</label>
            <Select
              value={contato.status ?? "novo"}
              onValueChange={(v) =>
                updateContact.mutate(
                  { status: v },
                  { onSuccess: () => toast.success("Status atualizado") },
                )
              }
            >
              <SelectTrigger>
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

          <Collapsible open={pedidosOpen} onOpenChange={setPedidosOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm font-medium hover:bg-muted">
              <span className="inline-flex items-center gap-2">
                <Package className="h-4 w-4" /> Pedidos Vinculados
                {pedidos && (
                  <Badge variant="secondary" className="h-5">
                    {pedidos.length}
                  </Badge>
                )}
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${pedidosOpen ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              {!pedidos || pedidos.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1 py-2">
                  Nenhum pedido vinculado.
                </p>
              ) : (
                <div className="divide-y">
                  {pedidos.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-2 text-sm"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium truncate">#{p.numero_pedido}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.data_pedido
                            ? format(new Date(p.data_pedido), "dd/MM/yyyy", {
                                locale: ptBR,
                              })
                            : "—"}
                        </span>
                      </div>
                      <span className="font-semibold text-sm">
                        {currency(p.valor_bruto)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground inline-flex items-center gap-1.5">
              <StickyNote className="h-3.5 w-3.5" /> Anotações
            </label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observações sobre este contato..."
              rows={5}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() =>
                  updateContact.mutate(
                    { notas },
                    { onSuccess: () => toast.success("Anotações salvas") },
                  )
                }
                disabled={updateContact.isPending || notas === (contato.notas ?? "")}
              >
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Right panel */}
      <section className="flex-1 flex flex-col min-w-0 bg-muted/20">
        <header className="px-4 md:px-6 py-3 border-b bg-card flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{displayName}</h2>
            <p className="text-xs text-muted-foreground">{contato.telefone}</p>
          </div>
          <Badge variant="outline">
            {STATUS_LABEL[contato.status ?? "novo"] ?? contato.status}
          </Badge>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3"
        >
          {!mensagens || mensagens.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              Nenhuma mensagem ainda.
            </p>
          ) : (
            mensagens.map((m) => {
              const enviada = m.direcao === "enviada";
              return (
                <div
                  key={m.id}
                  className={`flex ${enviada ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm ${
                      enviada
                        ? "bg-emerald-700 text-white rounded-br-sm"
                        : "bg-card border rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {m.conteudo}
                    </p>
                    <p
                      className={`text-[10px] mt-1 ${
                        enviada ? "text-emerald-100/80" : "text-muted-foreground"
                      } text-right`}
                    >
                      {format(new Date(m.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t bg-card p-3 md:p-4">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Digite uma mensagem..."
              rows={1}
              className="resize-none min-h-[40px] max-h-40"
            />
            <Button
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="shrink-0"
            >
              <Send className="h-4 w-4 mr-2" />
              {sending ? "Enviando..." : "Enviar"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Ctrl+Enter para enviar
          </p>
        </div>
      </section>
    </div>
  );
}