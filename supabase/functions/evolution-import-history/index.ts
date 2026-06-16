import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function extractText(msg: any): string {
  return (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.conversation ||
    msg?.text ||
    "[mídia]"
  );
}

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

    const { data: contato, error: contatoErr } = await supabase
      .from("crm_contacts")
      .select("id, telefone")
      .eq("id", contact_id)
      .maybeSingle();
    if (contatoErr || !contato) {
      return new Response(JSON.stringify({ error: "Contato não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const telDigits = String(contato.telefone).replace(/\D/g, "");
    const remoteJid = `${telDigits}@s.whatsapp.net`;

    const url = `${evolutionUrl.replace(/\/$/, "")}/chat/findMessages/${instance}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ where: { key: { remoteJid } } }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(
        JSON.stringify({ error: `Evolution API ${resp.status}: ${txt}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await resp.json();
    // Evolution v2 returns { messages: { records: [...] } } or array
    const records: any[] =
      json?.messages?.records ||
      json?.records ||
      (Array.isArray(json) ? json : []) ||
      [];

    let imported = 0;
    for (const m of records) {
      const evolutionId = m?.key?.id || m?.id || null;
      if (!evolutionId) continue;
      const fromMe = m?.key?.fromMe ?? false;
      const conteudo = extractText(m);
      const createdAt = m?.messageTimestamp
        ? new Date(
            Number(m.messageTimestamp) * (String(m.messageTimestamp).length > 10 ? 1 : 1000),
          ).toISOString()
        : new Date().toISOString();

      const { error } = await supabase.from("crm_messages").upsert(
        {
          contact_id: contato.id,
          conteudo,
          direcao: fromMe ? "enviada" : "recebida",
          evolution_message_id: evolutionId,
          created_at: createdAt,
        },
        { onConflict: "evolution_message_id", ignoreDuplicates: true },
      );
      if (!error) imported++;
    }

    // Importação não deve marcar como não lido — zera o contador após importar.
    await supabase
      .from("crm_contacts")
      .update({ unread_count: 0 })
      .eq("id", contato.id);

    return new Response(
      JSON.stringify({ success: true, imported, total: records.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("evolution-import-history error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});