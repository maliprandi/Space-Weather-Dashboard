import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TTL_MIN = 30;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const u = new URL(req.url);
    const startDate = u.searchParams.get("startDate");
    const endDate = u.searchParams.get("endDate");
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(SB_URL, SB_SRK);
    const key = `fireball:${startDate}:${endDate}`;
    const { data: cached } = await supabase
      .from("nasa_cache")
      .select("payload, expires_at")
      .eq("cache_key", key)
      .maybeSingle();
    if (cached && new Date(cached.expires_at) > new Date()) {
      return new Response(JSON.stringify(cached.payload), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const url = `https://ssd-api.jpl.nasa.gov/fireball.api?date-min=${startDate}&date-max=${endDate}&req-loc=true`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`fireball ${r.status}: ${await r.text()}`);
    const payload = await r.json();
    const expires = new Date(Date.now() + TTL_MIN * 60_000).toISOString();
    await supabase.from("nasa_cache").upsert({
      cache_key: key,
      endpoint: "fireball",
      payload,
      fetched_at: new Date().toISOString(),
      expires_at: expires,
    });
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
