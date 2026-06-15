import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Mail, Phone, Tag } from "lucide-react";
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

export default function CRMContato() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();

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
                value={contato.status ?? "novo"}
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
    </div>
  );
}