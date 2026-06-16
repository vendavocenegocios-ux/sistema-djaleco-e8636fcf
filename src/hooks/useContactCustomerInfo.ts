import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * Verifica se o telefone do contato pertence a um cliente já cadastrado (com compras).
 * Faz match pelos últimos 8 dígitos do telefone.
 */
export function useContactCustomerInfo(telefone: string | null | undefined) {
  const tel = onlyDigits(telefone);
  const suffix = tel.slice(-8);

  return useQuery({
    queryKey: ["crm_contact_customer_info", suffix],
    enabled: !!suffix,
    queryFn: async () => {
      const { data: clientes, error } = await supabase
        .from("clientes")
        .select("id, nome, telefone, email, total_pedidos, total_gasto, cidade, estado")
        .ilike("telefone", `%${suffix}%`)
        .limit(20);
      if (error) throw error;
      const match = (clientes ?? []).find((c) =>
        onlyDigits(c.telefone).endsWith(suffix),
      );
      return {
        isCustomer: !!match,
        cliente: match ?? null,
      };
    },
  });
}