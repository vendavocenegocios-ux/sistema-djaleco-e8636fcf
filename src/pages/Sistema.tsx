import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { toast } from "sonner";
import {
  Activity,
  Database,
  Shield,
  Zap,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  ShoppingBag,
  Package,
  UserCog,
  Server,
  Webhook,
  Save,
} from "lucide-react";

interface TableCount {
  name: string;
  count: number;
  icon: React.ReactNode;
}

interface HealthCheck {
  label: string;
  status: "ok" | "warn" | "error";
  detail: string;
  latencyMs?: number;
}

function WebhookConfig() {
  const { settings, isLoading, updateMultiple } = useSystemSettings();
  const [urlProd, setUrlProd] = useState(settings.webhook_producao || "");
  const [urlTeste, setUrlTeste] = useState(settings.webhook_teste || "");
  const [ativo, setAtivo] = useState(settings.webhook_ativo || "producao");
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isLoading && !initialized && settings.webhook_producao) {
      setUrlProd(settings.webhook_producao);
      setUrlTeste(settings.webhook_teste || "");
      setAtivo(settings.webhook_ativo || "producao");
      setInitialized(true);
    }
  }, [isLoading, settings, initialized]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateMultiple.mutateAsync([
        { key: "webhook_producao", value: urlProd },
        { key: "webhook_teste", value: urlTeste },
        { key: "webhook_ativo", value: ativo },
      ]);
      toast.success("Configurações de webhook salvas!");
    } catch {
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return null;

  return (
    <div>
      <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
        <Webhook className="h-4 w-4" /> Webhook de disparo — Recuperação de Carrinho
      </h2>
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook-prod">URL de Produção</Label>
            <Input
              id="webhook-prod"
              type="url"
              value={urlProd}
              onChange={(e) => setUrlProd(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-teste">URL de Teste</Label>
            <Input
              id="webhook-teste"
              type="url"
              value={urlTeste}
              onChange={(e) => setUrlTeste(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Ambiente Ativo</Label>
            <RadioGroup value={ativo} onValueChange={setAtivo} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="producao" id="env-prod" />
                <Label htmlFor="env-prod" className="font-normal cursor-pointer">Produção</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="teste" id="env-teste" />
                <Label htmlFor="env-teste" className="font-normal cursor-pointer">Teste</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar Webhooks"}
            </Button>
            <Badge variant={ativo === "producao" ? "default" : "secondary"}>
              {ativo === "producao" ? "🟢 Produção" : "🟡 Teste"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Sistema() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tableCounts, setTableCounts] = useState<TableCount[]>([]);
  const [healthChecks, setHealthChecks] = useState<HealthCheck[]>([]);
  const [dbLatency, setDbLatency] = useState<number | null>(null);
  const [authInfo, setAuthInfo] = useState<{ email: string; lastSignIn: string } | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const runDiagnostics = async () => {
    setRefreshing(true);
    const checks: HealthCheck[] = [];

    // 1. DB Latency
    const t0 = performance.now();
    const { error: pingError } = await supabase.from("pedidos").select("id", { count: "exact", head: true });
    const latency = Math.round(performance.now() - t0);
    setDbLatency(latency);
    checks.push({
      label: "Conexão Supabase",
      status: pingError ? "error" : latency < 500 ? "ok" : "warn",
      detail: pingError ? `Erro: ${pingError.message}` : `${latency}ms`,
      latencyMs: latency,
    });

    // 2. Auth session
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    checks.push({
      label: "Sessão Autenticada",
      status: authError || !session ? "error" : "ok",
      detail: session ? session.user.email || "Autenticado" : "Sem sessão",
    });
    if (session?.user) {
      setAuthInfo({
        email: session.user.email || "",
        lastSignIn: session.user.last_sign_in_at || "",
      });
    }

    // 3. Table counts
    const tables = [
      { name: "pedidos", label: "Pedidos", icon: <ShoppingBag className="h-4 w-4" /> },
      { name: "clientes", label: "Clientes", icon: <Users className="h-4 w-4" /> },
      { name: "pedido_itens", label: "Itens de Pedido", icon: <Package className="h-4 w-4" /> },
      { name: "vendedores", label: "Vendedores", icon: <UserCog className="h-4 w-4" /> },
      { name: "profiles", label: "Perfis", icon: <Shield className="h-4 w-4" /> },
      { name: "user_roles", label: "Roles", icon: <Shield className="h-4 w-4" /> },
    ] as const;

    const counts: TableCount[] = [];
    for (const t of tables) {
      const { count, error } = await supabase
        .from(t.name)
        .select("*", { count: "exact", head: true });
      counts.push({
        name: t.label,
        count: error ? -1 : (count ?? 0),
        icon: t.icon,
      });
      if (error) {
        checks.push({
          label: `Tabela ${t.label}`,
          status: "error",
          detail: error.message,
        });
      }
    }
    setTableCounts(counts);

    // 4. RLS check — can we read our own role?
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .limit(1);
    checks.push({
      label: "RLS (user_roles)",
      status: roleError ? "error" : "ok",
      detail: roleError ? roleError.message : `${roleData?.length ?? 0} registro(s) acessíveis`,
    });

    setHealthChecks(checks);
    setLastRefresh(new Date());
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const overallStatus = healthChecks.some((c) => c.status === "error")
    ? "error"
    : healthChecks.some((c) => c.status === "warn")
    ? "warn"
    : "ok";

  const statusColor = {
    ok: "text-green-500",
    warn: "text-yellow-500",
    error: "text-destructive",
  };

  const statusBg = {
    ok: "bg-green-500/10 border-green-500/30",
    warn: "bg-yellow-500/10 border-yellow-500/30",
    error: "bg-destructive/10 border-destructive/30",
  };

  const statusLabel = {
    ok: "Operacional",
    warn: "Atenção",
    error: "Problema Detectado",
  };

  const StatusIcon = ({ s }: { s: "ok" | "warn" | "error" }) =>
    s === "ok" ? (
      <CheckCircle className="h-4 w-4 text-green-500" />
    ) : s === "warn" ? (
      <Clock className="h-4 w-4 text-yellow-500" />
    ) : (
      <XCircle className="h-4 w-4 text-destructive" />
    );

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Executando diagnósticos...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Sistema</h1>
            <p className="text-xs text-muted-foreground">
              Última verificação: {lastRefresh.toLocaleTimeString("pt-BR")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={runDiagnostics}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>

        {/* Overall Status */}
        <Card className={`border ${statusBg[overallStatus]}`}>
          <CardContent className="p-4 sm:p-6 flex items-center gap-4">
            <div className={`p-3 rounded-full ${statusBg[overallStatus]}`}>
              <Activity className={`h-6 w-6 ${statusColor[overallStatus]}`} />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${statusColor[overallStatus]}`}>
                {statusLabel[overallStatus]}
              </h2>
              <p className="text-sm text-muted-foreground">
                {healthChecks.filter((c) => c.status === "ok").length}/{healthChecks.length} verificações OK
              </p>
            </div>
            {dbLatency !== null && (
              <div className="ml-auto text-right">
                <p className="text-2xl font-bold text-foreground">{dbLatency}ms</p>
                <p className="text-xs text-muted-foreground">Latência DB</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Health Checks */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Zap className="h-4 w-4" /> Verificações de Saúde
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {healthChecks.map((check, i) => (
              <Card key={i}>
                <CardContent className="p-4 flex items-center gap-3">
                  <StatusIcon s={check.status} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{check.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{check.detail}</p>
                  </div>
                  <Badge
                    variant={check.status === "ok" ? "secondary" : "destructive"}
                    className="text-[10px] shrink-0"
                  >
                    {check.status === "ok" ? "OK" : check.status === "warn" ? "ATENÇÃO" : "ERRO"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Database Tables */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            <Database className="h-4 w-4" /> Banco de Dados
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {tableCounts.map((t, i) => (
              <Card key={i}>
                <CardContent className="p-4 text-center">
                  <div className="flex justify-center mb-2 text-muted-foreground">{t.icon}</div>
                  <p className="text-2xl font-bold">{t.count >= 0 ? t.count : "—"}</p>
                  <p className="text-xs text-muted-foreground">{t.name}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Latency gauge */}
        {dbLatency !== null && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Server className="h-4 w-4" /> Performance
            </h2>
            <Card>
              <CardContent className="p-4 sm:p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Latência do Banco de Dados</span>
                  <span className={`text-sm font-bold ${dbLatency < 200 ? "text-green-500" : dbLatency < 500 ? "text-yellow-500" : "text-destructive"}`}>
                    {dbLatency}ms
                  </span>
                </div>
                <Progress value={Math.min(100, (dbLatency / 1000) * 100)} className="h-2" />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>0ms</span>
                  <span>200ms (bom)</span>
                  <span>500ms (lento)</span>
                  <span>1000ms+</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Auth Info */}
        {authInfo && (
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4" /> Autenticação
            </h2>
            <Card>
              <CardContent className="p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Usuário Logado</p>
                    <p className="text-sm font-medium">{authInfo.email}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Último Login</p>
                    <p className="text-sm font-medium">
                      {authInfo.lastSignIn
                        ? new Date(authInfo.lastSignIn).toLocaleString("pt-BR")
                        : "—"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Webhook Config */}
        <WebhookConfig />

        {/* App Info */}
        <Card>
          <CardHeader className="p-4 sm:p-6 pb-2">
            <CardTitle className="text-sm">Informações do App</CardTitle>
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Framework</p>
                <p className="font-medium">React + Vite</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Backend</p>
                <p className="font-medium">Supabase</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Edge Functions</p>
                <p className="font-medium">7 implantadas</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Build</p>
                <p className="font-medium">{new Date().toLocaleDateString("pt-BR")}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
