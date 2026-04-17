import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const targets = [
      { email: "wnogueira@hotmail.com", password: "Bill@2026" },
      { email: "apaulaalt@gmail.com", password: "AnaPaulaRica2026" },
    ];

    const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) throw listErr;

    const results = [];
    for (const t of targets) {
      const u = list?.users?.find((x: any) => x.email === t.email);
      if (!u) {
        results.push({ email: t.email, status: "not_found" });
        continue;
      }
      const { error } = await supabase.auth.admin.updateUserById(u.id, {
        password: t.password,
        email_confirm: true,
      });
      results.push({
        email: t.email,
        userId: u.id,
        status: error ? "error" : "password_reset",
        error: error?.message,
      });
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
