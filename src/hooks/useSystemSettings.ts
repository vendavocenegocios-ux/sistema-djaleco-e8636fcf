import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SystemSettings {
  [key: string]: string;
}

const QUERY_KEY = ["system-settings"];

export function useSystemSettings() {
  const queryClient = useQueryClient();

  const { data: settings = {}, isLoading } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async (): Promise<SystemSettings> => {
      const { data, error } = await supabase
        .from("system_settings" as any)
        .select("key, value");
      if (error) throw error;
      const map: SystemSettings = {};
      (data as any[])?.forEach((row: { key: string; value: string }) => {
        map[row.key] = row.value;
      });
      return map;
    },
    staleTime: 60_000,
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await supabase
        .from("system_settings" as any)
        .upsert({ key, value, updated_at: new Date().toISOString() } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const updateMultiple = useMutation({
    mutationFn: async (entries: { key: string; value: string }[]) => {
      for (const entry of entries) {
        const { error } = await supabase
          .from("system_settings" as any)
          .upsert({ key: entry.key, value: entry.value, updated_at: new Date().toISOString() } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const getActiveWebhookUrl = (): string => {
    const active = settings.webhook_ativo || "producao";
    return active === "producao"
      ? settings.webhook_producao || ""
      : settings.webhook_teste || "";
  };

  return {
    settings,
    isLoading,
    updateSetting,
    updateMultiple,
    getActiveWebhookUrl,
  };
}
