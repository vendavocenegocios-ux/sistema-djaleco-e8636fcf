import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const storeId = Deno.env.get("NUVEMSHOP_STORE_ID");
    const accessToken = Deno.env.get("NUVEMSHOP_ACCESS_TOKEN");
    if (!storeId || !accessToken) {
      throw new Error("Missing Nuvemshop credentials");
    }

    const baseUrl = `https://api.tiendanube.com/v1/${storeId}`;
    const headers = {
      Authentication: `bearer ${accessToken}`,
      "User-Agent": "Djaleco App (contato@djaleco.com.br)",
      "Content-Type": "application/json",
    };

    // Parse query params for filtering
    const url = new URL(req.url);
    const daysBack = parseInt(url.searchParams.get("days") || "30", 10);
    const createdAtMin = new Date();
    createdAtMin.setDate(createdAtMin.getDate() - daysBack);

    let allCheckouts: any[] = [];
    let page = 1;
    const perPage = 50;

    while (true) {
      const res = await fetch(
        `${baseUrl}/checkouts?per_page=${perPage}&page=${page}&created_at_min=${createdAtMin.toISOString()}`,
        { headers }
      );
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Nuvemshop API error ${res.status}: ${text}`);
      }
      const batch = await res.json();
      if (!batch.length) break;
      allCheckouts = allCheckouts.concat(batch);
      if (batch.length < perPage) break;
      page++;
    }

    console.log(`Fetched ${allCheckouts.length} abandoned checkouts`);

    // Map to a clean structure
    const checkouts = allCheckouts.map((c: any) => {
      const products = (c.products || []).map((p: any) => ({
        name: p.name?.pt || p.name?.es || p.name || p.product_id?.toString() || "Produto",
        quantity: p.quantity || 1,
        price: parseFloat(p.price) || 0,
        image: p.image?.src || null,
        variant: p.variant_values?.join(" / ") || null,
      }));

      const subtotal = products.reduce((s: number, p: any) => s + p.price * p.quantity, 0);

      return {
        id: c.id,
        token: c.token,
        created_at: c.created_at,
        updated_at: c.updated_at,
        completed_at: c.completed_at || null,
        recovery_url: c.checkout_url || c.recovery_url || null,
        status: c.completed_at ? "recovered" : "abandoned",
        customer: {
          name: c.customer?.name || c.contact_name || "Sem nome",
          email: c.customer?.email || c.contact_email || null,
          phone: c.customer?.phone || c.contact_phone || null,
        },
        products,
        subtotal,
        shipping_cost: parseFloat(c.shipping_cost_customer || c.shipping_cost || "0") || 0,
        total: parseFloat(c.total || "0") || subtotal,
        currency: c.currency || "BRL",
      };
    });

    return new Response(JSON.stringify(checkouts), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
