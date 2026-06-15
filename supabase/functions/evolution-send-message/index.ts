import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { telefone, mensagem } = await req.json();

    if (!telefone || !mensagem) {
      return new Response(
        JSON.stringify({ error: "telefone e mensagem são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const evolutionUrl = Deno.env.get("EVOLUTION_API_URL");
    const instance = Deno.env.get("EVOLUTION_CRM_INSTANCE");
    const apiKey = Deno.env.get("EVOLUTION_CRM_API_KEY");

    const response = await fetch(`${evolutionUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey!,
      },
      body: JSON.stringify({
        number: String(telefone).replace(/\D/g, ""),
        text: mensagem,
      }),
    });

    const result = await response.json();

    return new Response(JSON.stringify({ success: response.ok, result }), {
      status: response.ok ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("evolution-send-message error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});