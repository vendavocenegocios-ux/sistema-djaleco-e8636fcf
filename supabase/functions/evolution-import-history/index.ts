import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "crm-media";

const MEDIA_KEYS = [
  ["imageMessage", "image"],
  ["videoMessage", "video"],
  ["audioMessage", "audio"],
  ["documentMessage", "document"],
  ["stickerMessage", "sticker"],
] as const;

function extractMediaInfo(message: any) {
  if (!message) return null;
  for (const [key, type] of MEDIA_KEYS) {
    const node = message[key];
    if (node) {
      return {
        type,
        mimetype: node.mimetype || null,
        caption: node.caption || null,
        filename: node.fileName || node.title || null,
      };
    }
  }
  return null;
}

function extOf(mime: string | null, fallback: string) {
  if (!mime) return fallback;
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/webp": "webp", "image/gif": "gif",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/wav": "wav",
    "video/mp4": "mp4", "video/quicktime": "mov", "application/pdf": "pdf",
  };
  if (map[mime]) return map[mime];
  const sub = mime.split("/")[1];
  return sub ? sub.split(";")[0] : fallback;
}

async function ensureBucket(supabase: any) {
  try { await supabase.storage.createBucket(BUCKET, { public: true }); } catch (_) {}
}

async function downloadAndStoreMedia(
  supabase: any, evolutionUrl: string, instance: string, apiKey: string,
  keyObj: any, contactId: string, messageId: string, mimeHint: string | null,
) {
  try {
    const url = `${evolutionUrl.replace(/\/$/, "")}/chat/getBase64FromMediaMessage/${instance}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ message: { key: keyObj }, convertToMp4: false }),
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const base64 = json?.base64 || json?.data?.base64 || json?.media;
    const mime = json?.mimetype || json?.mediaType || mimeHint || "application/octet-stream";
    if (!base64) return null;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const ext = extOf(mime, "bin");
    const path = `${contactId}/${messageId}.${ext}`;
    await ensureBucket(supabase);
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime, upsert: true,
    });
    if (error) { console.error("[media] upload erro", error); return null; }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, mime };
  } catch (e) { console.error("[media] exceção", e); return null; }
}

function extractText(msg: any): string {
  return (
    msg?.message?.conversation ||
    msg?.message?.extendedTextMessage?.text ||
    msg?.conversation ||
    msg?.text ||
    ""
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
    const url = `${evolutionUrl.replace(/\/$/, "")}/chat/findMessages/${instance}`;

    const jidCandidates = [
      `${telDigits}@s.whatsapp.net`,
      `${telDigits}@c.us`,
    ];

    const debug: Record<string, unknown> = { url, telDigits, attempts: [] };
    let records: any[] = [];
    let usedJid = jidCandidates[0];
    let lastStatus = 0;
    let lastSample: any = null;

    for (const remoteJid of jidCandidates) {
      console.log("[import-history] tentando", { url, remoteJid });
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: apiKey },
        body: JSON.stringify({ where: { key: { remoteJid } } }),
      });
      lastStatus = resp.status;
      const text = await resp.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch { /* not json */ }

      const found: any[] =
        json?.messages?.records ||
        json?.records ||
        json?.data ||
        (Array.isArray(json) ? json : []) ||
        [];

      const topKeys = json && typeof json === "object" ? Object.keys(json).slice(0, 10) : [];
      lastSample = { topKeys, snippet: text.slice(0, 300) };
      (debug.attempts as any[]).push({ remoteJid, status: resp.status, count: found.length, topKeys });
      console.log("[import-history] resposta", { remoteJid, status: resp.status, count: found.length, topKeys });

      if (found.length > 0) {
        records = found;
        usedJid = remoteJid;
        break;
      }
    }

    debug.usedJid = usedJid;
    debug.lastStatus = lastStatus;
    debug.sample = lastSample;

    let imported = 0;
    for (const m of records) {
      const evolutionId = m?.key?.id || m?.id || null;
      if (!evolutionId) continue;
      const fromMe = m?.key?.fromMe ?? false;
      const innerMessage = m?.message || null;
      const mediaInfo = extractMediaInfo(innerMessage);
      const textoConteudo = extractText(m);
      const conteudo = textoConteudo || mediaInfo?.caption || (mediaInfo ? "" : "[mídia]");
      const createdAt = m?.messageTimestamp
        ? new Date(
            Number(m.messageTimestamp) * (String(m.messageTimestamp).length > 10 ? 1 : 1000),
          ).toISOString()
        : new Date().toISOString();

      let mediaUrl: string | null = null;
      let mediaMime: string | null = mediaInfo?.mimetype ?? null;
      if (mediaInfo && m?.key) {
        const stored = await downloadAndStoreMedia(
          supabase, evolutionUrl, instance, apiKey,
          m.key, contato.id, evolutionId, mediaInfo.mimetype,
        );
        if (stored) { mediaUrl = stored.url; mediaMime = stored.mime; }
      }

      const payload: Record<string, unknown> = {
        contact_id: contato.id,
        conteudo,
        direcao: fromMe ? "enviada" : "recebida",
        evolution_message_id: evolutionId,
        created_at: createdAt,
      };
      if (mediaInfo) {
        payload.media_type = mediaInfo.type;
        payload.media_mime = mediaMime;
        payload.media_url = mediaUrl;
        payload.media_filename = mediaInfo.filename;
        payload.caption = mediaInfo.caption;
      }

      const { error } = await supabase.from("crm_messages").upsert(payload, {
        onConflict: "evolution_message_id", ignoreDuplicates: true,
      });
      if (!error) imported++;
    }

    // Importação não deve marcar como não lido — zera o contador após importar.
    await supabase
      .from("crm_contacts")
      .update({ unread_count: 0 })
      .eq("id", contato.id);

    return new Response(
      JSON.stringify({ success: true, imported, total: records.length, debug }),
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