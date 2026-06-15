import { AppLayout } from "@/components/layout/AppLayout";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Phone, Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const STATUS_OPTIONS = [
  { value: "novo", label: "Novo" },
  { value: "em_atendimento", label: "Em atendimento" },
  { value: "qualificado", label: "Qualificado" },
  { value: "ganho", label: "Ganho" },
  { value: "perdido", label: "Perdido" },
];

const ORIGEM_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  site: "Site",
  indicacao: "Indicação",
  outro: "Outro",
};

const STATUS_COLORS: Record<string, string> = {
  novo: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  em_atendimento: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  qualificado: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  ganho: "bg-green-500/10 text-green-500 border-green-500/20",
  perdido: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function CRM() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const [form, setForm] = useState({
    nome: "",
    telefone: "",
    email: "",
    origem: "whatsapp",
    status: "novo",
    tags: "",
  });

  const { data: contatos, isLoading } = useQuery({
    queryKey: ["crm_contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_contacts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createContact = useMutation({
    mutationFn: async (values: typeof form) => {
      const payload = {
        nome: values.nome,
        telefone: values.telefone,
        email: values.email || null,
        origem: values.origem,
        status: values.status,
        tags: values.tags
          ? values.tags.split(",").map((t) => t.trim()).filter(Boolean)
          : [],
      };
      const { error } = await supabase.from("crm_contacts").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["crm_contacts"] });
      toast.success("Contato criado com sucesso");
      setOpen(false);
      setForm({ nome: "", telefone: "", email: "", origem: "whatsapp", status: "novo", tags: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar contato"),
  });

  const filtered = contatos?.filter(
    (c) =>
      c.nome.toLowerCase().includes(search.toLowerCase()) ||
      c.telefone?.includes(search) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nome.trim() || !form.telefone.trim()) {
      toast.error("Nome e telefone são obrigatórios");
      return;
    }
    createContact.mutate(form);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold text-foreground">CRM / WhatsApp</h1>
          </div>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Contato
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone ou email..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* List */}
        <div className="grid gap-3">
          {isLoading ? (
            <div className="h-32 rounded-lg bg-muted animate-pulse" />
          ) : filtered?.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Nenhum contato encontrado
              </CardContent>
            </Card>
          ) : (
            filtered?.map((c) => (
              <Link key={c.id} to={`/crm/${c.id}`}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                  <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold text-sm shrink-0">
                        {c.nome
                          .split(" ")
                          .map((p) => p[0])
                          .slice(0, 2)
                          .join("")
                          .toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{c.nome}</h3>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {c.telefone}
                          </span>
                          {c.email && (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {c.email}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className={STATUS_COLORS[c.status ?? "novo"]}
                      >
                        {STATUS_OPTIONS.find((s) => s.value === c.status)?.label ??
                          "Novo"}
                      </Badge>
                      <Badge variant="secondary">
                        {ORIGEM_LABEL[c.origem ?? "whatsapp"] ?? c.origem}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </div>

      {/* Dialog Novo Contato */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Novo Contato</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  placeholder="Nome do contato"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telefone">Telefone *</Label>
                <Input
                  id="telefone"
                  value={form.telefone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, telefone: e.target.value }))
                  }
                  placeholder="(11) 99999-9999"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="email@exemplo.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Origem</Label>
                  <Select
                    value={form.origem}
                    onValueChange={(v) => setForm((f) => ({ ...f, origem: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="whatsapp">WhatsApp</SelectItem>
                      <SelectItem value="site">Site</SelectItem>
                      <SelectItem value="indicacao">Indicação</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
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
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
                <Input
                  id="tags"
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="vip, recorrente, etc"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createContact.isPending}>
                {createContact.isPending ? "Criando..." : "Criar Contato"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
