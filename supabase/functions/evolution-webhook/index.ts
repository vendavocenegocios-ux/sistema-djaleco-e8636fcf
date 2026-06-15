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

    console.log("[webhook] event:", body.event, "fromMe:", body.data?.key?.fromMe);

    if (body.event !== "MESSAGES_UPSERT" && body.event !== "messages.upsert") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    // Suporta ambos os formatos v1 e v2 da Evolution API
    const msgData = body.data?.message || body.data;
    const telefone = (body.data?.key?.remoteJid || msgData?.key?.remoteJid || "")
      .replace("@s.whatsapp.net", "")
      .replace("@c.us", "");

    const conteudo =
      body.data?.message?.conversation ||
      body.data?.message?.extendedTextMessage?.text ||
      msgData?.message?.conversation ||
      msgData?.message?.extendedTextMessage?.text ||
      "[mídia]";

    const nomeWhats = body.data?.pushName || msgData?.pushName || "";
    const fromMe = body.data?.key?.fromMe || msgData?.key?.fromMe || false;

    console.log("[webhook] telefone:", telefone, "conteudo:", conteudo, "fromMe:", fromMe);

    if (!telefone || fromMe) {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    let { data: contato } = await supabase
      .from("crm_contacts")
      .select("id, status")
      .eq("telefone", telefone)
      .maybeSingle();

    console.log("[webhook] contato encontrado:", contato?.id ?? "nenhum");

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

    const { error: insertError } = await supabase.from("crm_messages").insert({
      contact_id: contato!.id,
      conteudo,
      direcao: "recebida",
      canal: "whatsapp",
    });

    if (insertError) {
      console.error("[webhook] insert error:", insertError);
    } else {
      console.log("[webhook] mensagem gravada para contact_id:", contato!.id);
    }

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