import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { telefone, mensagem, contact_id, audio_base64 } = await req.json();

    if (!telefone || (!mensagem && !audio_base64)) {
      return new Response(
        JSON.stringify({ error: "telefone e mensagem/audio são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const instance = Deno.env.get("EVOLUTION_CRM_INSTANCE");
    const apiKey = Deno.env.get("EVOLUTION_CRM_API_KEY");

    if (!evolutionUrl || !instance || !apiKey) {
      return new Response(
        JSON.stringify({ error: "Variáveis de ambiente não configuradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const number = String(telefone).replace(/\D/g, "");
    const baseUrl = evolutionUrl.replace(/\/$/, "");

    let url: string;
    let body: Record<string, unknown>;
    if (audio_base64) {
      url = `${baseUrl}/message/sendWhatsAppAudio/${instance}`;
      body = { number, audio: audio_base64, encoding: true };
    } else {
      url = `${baseUrl}/message/sendText/${instance}`;
      body = { number, text: mensagem };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    const evolutionMessageId =
      result?.key?.id || result?.messageId || result?.id || null;

    return new Response(
      JSON.stringify({
        success: response.ok,
        result,
        contact_id,
        evolution_message_id: evolutionMessageId,
      }),
      {
        status: response.ok ? 200 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("evolution-send-message error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
