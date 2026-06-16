import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "crm-media";

function extOf(mime: string | null, fallback: string) {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/gif": "gif", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/wav": "wav", "video/mp4": "mp4", "video/quicktime": "mov", "application/pdf": "pdf",
  };
  if (map[mime]) return map[mime];
  const sub = mime.split("/")[1];
  return sub ? sub.split(";")[0] : fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { message_id } = await req.json();
    if (!message_id) {
      return new Response(JSON.stringify({ error: "message_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({ error: "Evolution não configurada" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: msg } = await supabase
      .from("crm_messages")
      .select("id, contact_id, evolution_message_id, direcao, media_type, media_mime")
      .eq("id", message_id)
      .maybeSingle();
    if (!msg) {
      return new Response(JSON.stringify({ error: "Mensagem não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!msg.evolution_message_id) {
      return new Response(JSON.stringify({ error: "Sem evolution_message_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contact } = await supabase
      .from("crm_contacts").select("telefone").eq("id", msg.contact_id).maybeSingle();
    if (!contact?.telefone) {
      return new Response(JSON.stringify({ error: "Contato sem telefone" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const remoteJid = `${String(contact.telefone).replace(/\D/g, "")}@s.whatsapp.net`;
    const baseUrl = evolutionUrl.replace(/\/$/, "");

    // 1) Fetch the full stored message from Evolution so we pass the real
    //    message object (with imageMessage/audioMessage/videoMessage/etc.)
    //    instead of letting Baileys re-resolve from just the key, which can
    //    misclassify it as a templateMessage.
    const findResp = await fetch(`${baseUrl}/chat/findMessages/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({
        where: { key: { id: msg.evolution_message_id, remoteJid } },
      }),
    });
    if (!findResp.ok) {
      const t = await findResp.text();
      return new Response(JSON.stringify({ error: "Falha ao localizar mensagem", detail: t }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const findJson = await findResp.json();
    const records = Array.isArray(findJson)
      ? findJson
      : findJson?.records || findJson?.messages?.records || findJson?.data || [];
    const stored = Array.isArray(records) ? records[0] : records;
    if (!stored) {
      return new Response(JSON.stringify({ error: "Mensagem não encontrada na Evolution" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Evolution stores the original Baileys payload under `message` (jsonb)
    const fullMessage = stored.message
      ? { key: stored.key, message: stored.message, messageType: stored.messageType }
      : stored;

    const url = `${baseUrl}/chat/getBase64FromMediaMessage/${instance}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ message: fullMessage, convertToMp4: false }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return new Response(JSON.stringify({ error: "Falha ao buscar mídia", detail: t }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const json = await resp.json();
    const base64 = json?.base64 || json?.data?.base64 || json?.media;
    const mime = json?.mimetype || json?.mediaType || msg.media_mime || "application/octet-stream";
    if (!base64) {
      return new Response(JSON.stringify({ error: "Sem base64 na resposta" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const ext = extOf(mime, "bin");
    const path = `${msg.contact_id}/${msg.evolution_message_id}.${ext}`;
    try { await supabase.storage.createBucket(BUCKET, { public: true }); } catch (_) { /* ignore */ }
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true });
    if (upErr) {
      return new Response(JSON.stringify({ error: "Falha ao salvar", detail: upErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

    // Determine media_type from mime if missing
    let mediaType = msg.media_type;
    if (!mediaType) {
      if (mime.startsWith("image/")) mediaType = "image";
      else if (mime.startsWith("audio/")) mediaType = "audio";
      else if (mime.startsWith("video/")) mediaType = "video";
      else mediaType = "document";
    }

    await supabase.from("crm_messages")
      .update({ media_url: pub.publicUrl, media_mime: mime, media_type: mediaType })
      .eq("id", message_id);

    return new Response(JSON.stringify({ success: true, media_url: pub.publicUrl }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("crm-reprocess-media error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});