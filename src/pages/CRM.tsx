import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, MessageSquare, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

type ColumnKey = "novo" | "em_atendimento" | "aguardando" | "resolvido";

const COLUMNS: {
  key: ColumnKey;
  label: string;
  dot: string;
  ring: string;
}[] = [
  { key: "novo", label: "Novo", dot: "bg-blue-500", ring: "border-blue-500/30" },
  { key: "em_atendimento", label: "Em Atendimento", dot: "bg-yellow-500", ring: "border-yellow-500/30" },
  { key: "aguardando", label: "Aguardando", dot: "bg-purple-500", ring: "border-purple-500/30" },
  { key: "resolvido", label: "Resolvido", dot: "bg-green-500", ring: "border-green-500/30" },
];

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  site: "Site",
  indicacao: "Indicação",
  outro: "Outro",
};

const ORIGEM_CLASS: Record<string, string> = {
  whatsapp: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  site: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",
  indicacao: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",
  outro: "bg-muted text-muted-foreground border-border",
};

const truncate = (s: string | null | undefined, n = 60) =>
  !s ? "" : s.length > n ? s.slice(0, n).trimEnd() + "…" : s;

export default function CRM() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    origem: "whatsapp",
    notas: "",
  });

  const { data: contatos, isLoading } = useQuery({
    queryKey: ["crm_contacts_kanban"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("crm_contacts_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_contacts" },
        () => {
          qc.invalidateQueries({ queryKey: ["crm_contacts_kanban"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_messages" },
        () => {
          qc.invalidateQueries({ queryKey: ["crm_last_messages"] });
          qc.invalidateQueries({ queryKey: ["crm_contacts_kanban"] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const { data: lastMessages } = useQuery({
    queryKey: ["crm_last_messages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_messages")
        .select("contact_id, conteudo, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const map = new Map<string, { conteudo: string; created_at: string }>();
      (data ?? []).forEach((m) => {
        if (!map.has(m.contact_id)) {
          map.set(m.contact_id, { conteudo: m.conteudo, created_at: m.created_at });
        }
      });
      return map;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("crm_contacts").insert({
        nome: form.nome.trim(),
        telefone: form.telefone.trim(),
        email: form.email.trim() || null,
        origem: form.origem,
        status: "novo",
        notas: form.notas.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato criado");
      qc.invalidateQueries({ queryKey: ["crm_contacts_kanban"] });
      setOpen(false);
      setForm({ nome: "", telefone: "", email: "", origem: "whatsapp", notas: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar contato"),
  });

  const grouped = COLUMNS.reduce<Record<ColumnKey, typeof contatos>>((acc, col) => {
    acc[col.key] = (contatos ?? []).filter((c) => (c.status ?? "novo") === col.key);
    return acc;
  }, { novo: [], em_atendimento: [], aguardando: [], resolvido: [] } as any);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">CRM / WhatsApp</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" /> Novo Contato
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo Contato</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome</Label>
                <Input id="nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input id="telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={form.origem} onValueChange={(v) => setForm({ ...form, origem: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="indicacao">Indicação</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notas">Notas</Label>
                <Textarea id="notas" rows={3} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={() => create.mutate()} disabled={!form.nome.trim() || !form.telefone.trim() || create.isPending}>
                {create.isPending ? "Criando..." : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-3 -mx-4 px-4 md:-mx-6 md:px-6">
        {COLUMNS.map((col) => {
          const items = grouped[col.key] ?? [];
          return (
            <div
              key={col.key}
              className={`shrink-0 w-[300px] md:w-[320px] rounded-lg border bg-muted/30 p-3 flex flex-col h-[calc(100vh-180px)] ${col.ring}`}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                  <h2 className="font-semibold text-sm">{col.label}</h2>
                </div>
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              </div>
              <div className="space-y-2 flex-1 overflow-y-auto pr-1">
                {isLoading ? (
                  <div className="h-20 rounded-md bg-muted animate-pulse" />
                ) : items.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">Nenhum contato</p>
                ) : (
                  items.map((c) => {
                    const last = lastMessages?.get(c.id);
                    const lastDate = last?.created_at ?? c.updated_at ?? c.created_at;
                    return (
                      <Card
                        key={c.id}
                        onClick={() => navigate(`/crm/${c.id}`)}
                        className="p-3 cursor-pointer hover:shadow-md hover:border-primary/40 transition-all space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-sm truncate">{c.nome || c.telefone}</span>
                          <Badge variant="outline" className={`text-[10px] shrink-0 ${ORIGEM_CLASS[c.origem ?? "outro"] ?? ORIGEM_CLASS.outro}`}>
                            {ORIGEM_LABEL[c.origem ?? "outro"] ?? c.origem}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          <span className="truncate">{c.telefone}</span>
                        </div>
                        {last?.conteudo && (
                          <p className="text-xs text-foreground/80 line-clamp-2 leading-snug">
                            {truncate(last.conteudo, 60)}
                          </p>
                        )}
                        <div className="text-[11px] text-muted-foreground">
                          {lastDate
                            ? formatDistanceToNow(new Date(lastDate), { addSuffix: true, locale: ptBR })
                            : "—"}
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}