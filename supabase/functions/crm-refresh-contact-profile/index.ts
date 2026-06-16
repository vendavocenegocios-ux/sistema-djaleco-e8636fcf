import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { contact_id } = await req.json();
    if (!contact_id) {
      return new Response(JSON.stringify({ error: "contact_id obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const instance = Deno.env.get("EVOLUTION_CRM_INSTANCE");
    const apiKey = Deno.env.get("EVOLUTION_CRM_API_KEY");
    if (!evolutionUrl || !instance || !apiKey) {
      return new Response(
        JSON.stringify({ error: "Variáveis Evolution não configuradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: contato, error } = await supabase
      .from("crm_contacts")
      .select("id, telefone")
      .eq("id", contact_id)
      .maybeSingle();
    if (error || !contato) {
      return new Response(JSON.stringify({ error: "Contato não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const number = String(contato.telefone).replace(/\D/g, "");
    const patch: Record<string, unknown> = {};

    // Foto
    try {
      const picResp = await fetch(
        `${evolutionUrl.replace(/\/$/, "")}/chat/fetchProfilePictureUrl/${instance}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify({ number }),
        },
      );
      if (picResp.ok) {
        const pj = await picResp.json();
        const avatarUrl = pj?.profilePictureUrl || pj?.url || null;
        if (avatarUrl) patch.avatar_url = avatarUrl;
      }
    } catch (e) {
      console.error("[refresh] fetchProfilePicture erro", e);
    }

    // Nome (push name) — via findContacts
    try {
      const contactResp = await fetch(
        `${evolutionUrl.replace(/\/$/, "")}/chat/findContacts/${instance}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: apiKey },
          body: JSON.stringify({ where: { id: `${number}@s.whatsapp.net` } }),
        },
      );
      if (contactResp.ok) {
        const cj = await contactResp.json();
        const arr = Array.isArray(cj) ? cj : cj?.records || cj?.data || [];
        const first = arr?.[0];
        const push = first?.pushName || first?.name || first?.notify || null;
        if (push) patch.push_name = push;
      }
    } catch (e) {
      console.error("[refresh] findContacts erro", e);
    }

    if (Object.keys(patch).length > 0) {
      await supabase.from("crm_contacts").update(patch).eq("id", contato.id);
    }

    return new Response(
      JSON.stringify({ success: true, patch }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("crm-refresh-contact-profile error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});