import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    if (body.event !== "messages.upsert") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const msg = body.data;
    const telefone = msg.key?.remoteJid?.replace("@s.whatsapp.net", "");
    const conteudo =
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      "[mídia]";
    const nomeWhats = msg.pushName || "";

    if (!telefone || msg.key?.fromMe) {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    let { data: contato } = await supabase
      .from("crm_contacts")
      .select("id, status")
      .eq("telefone", telefone)
      .maybeSingle();

    if (!contato) {
      const { data: novo } = await supabase
        .from("crm_contacts")
        .insert({
          nome: nomeWhats || telefone,
          telefone,
          origem: "whatsapp",
          status: "novo",
        })
        .select("id, status")
        .single();
      contato = novo;
    }

    await supabase.from("crm_messages").insert({
      contact_id: contato!.id,
      conteudo,
      direcao: "recebida",
      canal: "whatsapp",
    });

    await supabase
      .from("crm_contacts")
      .update({ ultimo_contato: new Date().toISOString() })
      .eq("id", contato!.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Erro no webhook:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});