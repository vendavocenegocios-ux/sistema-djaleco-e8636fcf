import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function checkTracking(supabase: any, pedido: any) {
  const superfreteOrderId = pedido.superfrete_order_id;
  const trackingCode = pedido.rastreio_codigo;

  let trackingData: any = null;
  let source = "";

  // Strategy 1: SuperFrete
  if (superfreteOrderId) {
    const apiKey = Deno.env.get("SUPERFRETE_API_KEY");
    if (apiKey) {
      try {
        const res = await fetch(`https://api.superfrete.com/api/v0/order/info/${superfreteOrderId}`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "User-Agent": "Djaleco App (contato@djaleco.com)",
            Accept: "application/json",
          },
        });
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json") && res.ok) {
          trackingData = await res.json();
          source = "superfrete";
        }
      } catch (e) {
        console.warn(`SuperFrete error for ${pedido.numero_pedido}:`, e.message);
      }
    }
  }

  // Strategy 2: Seu Rastreio
  if (!trackingData && trackingCode) {
    const seuRastreioKey = Deno.env.get("SEURASTREIO_API_KEY");
    if (seuRastreioKey) {
      try {
        const srRes = await fetch(`https://seurastreio.com.br/api/public/rastreio/${encodeURIComponent(trackingCode)}`, {
          headers: {
            Authorization: `Bearer ${seuRastreioKey}`,
            Accept: "application/json",
          },
        });
        if (srRes.ok) {
          trackingData = await srRes.json();
          source = "seurastreio";
        } else {
          console.warn(`Seu Rastreio failed for ${pedido.numero_pedido} (${srRes.status})`);
        }
      } catch (e) {
        console.warn(`Seu Rastreio error for ${pedido.numero_pedido}:`, e.message);
      }
    }
  }

  if (!trackingData) return { pedido_id: pedido.id, numero_pedido: pedido.numero_pedido, status: "no_data" };

  // Extract updates
  const updates: Record<string, any> = {};

  if (source === "superfrete") {
    if (trackingData.tracking && !pedido.rastreio_codigo) {
      updates.rastreio_codigo = trackingData.tracking;
    }
    const status = (trackingData.status || "").toLowerCase();
    if (status === "delivered") {
      updates.etapa_producao = "Entregue";
      updates.data_entrega = trackingData.updated_at ? new Date(trackingData.updated_at).toISOString() : new Date().toISOString();
    }
  } else if (source === "seurastreio") {
    const evento = trackingData.eventoMaisRecente;
    if (evento) {
      const desc = (evento.descricao || "").toLowerCase();
      if (desc.includes("entregue")) {
        updates.etapa_producao = "Entregue";
        updates.data_entrega = evento.data ? new Date(evento.data).toISOString() : new Date().toISOString();
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    const { error: updateError } = await supabase
      .from("pedidos")
      .update(updates)
      .eq("id", pedido.id);
    if (updateError) console.error(`Error updating pedido ${pedido.numero_pedido}:`, updateError);
  }

  return {
    pedido_id: pedido.id,
    numero_pedido: pedido.numero_pedido,
    source,
    updates,
    status: Object.keys(updates).length > 0 ? "updated" : "checked",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await authClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { pedido_id, batch } = body;

    // BATCH MODE: check all orders with tracking code but no delivery date
    if (batch) {
      const { data: pedidos, error } = await supabase
        .from("pedidos")
        .select("id, numero_pedido, rastreio_codigo, superfrete_order_id")
        .or("rastreio_codigo.neq.,superfrete_order_id.neq.")
        .is("data_entrega", null)
        .order("data_pedido", { ascending: false });

      if (error) throw error;

      // Filter out rows where both are null/empty
      const validPedidos = (pedidos || []).filter(
        (p: any) => (p.rastreio_codigo && p.rastreio_codigo.trim() !== "") || (p.superfrete_order_id && p.superfrete_order_id.trim() !== "")
      );

      console.log(`Batch tracking: ${validPedidos.length} orders to check`);

      const results = [];
      for (const pedido of validPedidos) {
        const result = await checkTracking(supabase, pedido);
        results.push(result);
        // Rate limit: 500ms between requests
        await new Promise((r) => setTimeout(r, 500));
      }

      const updated = results.filter((r: any) => r.status === "updated").length;
      const checked = results.filter((r: any) => r.status === "checked").length;
      const noData = results.filter((r: any) => r.status === "no_data").length;

      return new Response(
        JSON.stringify({ success: true, total: validPedidos.length, updated, checked, no_data: noData, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SINGLE MODE
    if (!pedido_id) throw new Error("pedido_id is required");

    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .select("id, numero_pedido, rastreio_codigo, superfrete_order_id")
      .eq("id", pedido_id)
      .single();

    if (pedidoError || !pedido) throw new Error("Pedido not found");

    const result = await checkTracking(supabase, pedido);

    if (result.status === "no_data") {
      return new Response(
        JSON.stringify({ error: "Não foi possível consultar o rastreio. Verifique o código de rastreio.", no_tracking: true }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, source: result.source, updates: result.updates }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
