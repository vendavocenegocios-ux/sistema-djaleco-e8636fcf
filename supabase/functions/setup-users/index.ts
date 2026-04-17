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

    const users = [
      { email: "wnogueira@hotmail.com", password: "Bill@2026", nome: "William Nogueira", role: "admin" },
      { email: "apaulaalt@gmail.com", password: "AnaPaulaRica2026", nome: "Ana Paula", role: "user" },
    ];

    const results = [];

    for (const u of users) {
      const { data: existing } = await supabase.auth.admin.listUsers();
      const existingUser = existing?.users?.find((eu: any) => eu.email === u.email);

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;
        // Force password reset + confirm email
        const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
          password: u.password,
          email_confirm: true,
        });
        if (updateError) {
          results.push({ email: u.email, status: "update_error", error: updateError.message });
          continue;
        }
        results.push({ email: u.email, status: "password_reset", userId });
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { nome: u.nome },
        });

        if (error) {
          results.push({ email: u.email, status: "create_error", error: error.message });
          continue;
        }
        userId = data.user.id;
        results.push({ email: u.email, status: "created", userId });
      }

      const { error: roleError } = await supabase
        .from("user_roles")
        .upsert({ user_id: userId, role: u.role }, { onConflict: "user_id,role" });

      if (roleError) {
        results.push({ email: u.email, roleStatus: "error", error: roleError.message });
      } else {
        results.push({ email: u.email, roleStatus: "role_assigned", role: u.role });
      }
    }

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
