// =====================================================================
// MiRadio → AzuraCast bridge (Supabase Edge Function, name: "azuracast")
//
// Called from the admin dashboard. Keeps the AzuraCast API key secret.
// Needs two secrets (Supabase → Edge Functions → Secrets):
//   AZURACAST_URL      e.g. https://stream.miradio.fm   (no trailing slash)
//   AZURACAST_API_KEY  an AzuraCast API key from an administrator account
//
// Actions (POST JSON):
//   { "action": "provision",   "station_id": "<uuid>" }  create the station on AzuraCast
//   { "action": "set_enabled", "station_id": "<uuid>", "enabled": true|false }
//   { "action": "ping" }                                  check the connection
// =====================================================================
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AZ = (Deno.env.get("AZURACAST_URL") ?? "").trim().replace(/\/+$/, "");
const KEY = (Deno.env.get("AZURACAST_API_KEY") ?? "").trim();
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// What a station owner may do in the AzuraCast control panel (their station only).
const OWNER_PERMISSIONS = [
  "view station management",
  "view station reports",
  "view station logs",
  "manage station profile",
  "manage station broadcasting",
  "manage station streamers",
  "manage station media",
  "delete station media",
  "manage station automation",
  "manage station podcasts",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function az(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${AZ}/api${path}`, {
    method,
    headers: { "X-API-Key": KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const msg = typeof data === "object" && data
      ? data.formatted_message || data.message || JSON.stringify(data)
      : String(data).slice(0, 200);
    throw new Error(`AzuraCast ${method} ${path} → ${res.status}: ${msg}`);
  }
  return data;
}

function password(len = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(len)), (b) => chars[b % chars.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  try {
    // Only MiRadio admins may use this function.
    const userClient = createClient(SB_URL, SB_ANON, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");
    if (adminErr || isAdmin !== true) return json({ error: "Admins only." }, 403);

    if (!AZ || !KEY) {
      return json({ error: "The streaming server isn't connected yet. Set AZURACAST_URL and AZURACAST_API_KEY in Supabase → Edge Functions → Secrets." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (action === "ping") {
      const status = await az("/status");
      return json({ ok: true, azuracast: status });
    }

    const db = createClient(SB_URL, SB_SERVICE);
    const { data: st, error: stErr } = await db.from("stations").select("*").eq("id", body.station_id).single();
    if (stErr || !st) return json({ error: "Station not found." }, 404);

    if (action === "set_enabled") {
      if (!st.azuracast_id) return json({ ok: true, skipped: "no stream yet" });
      await az(`/admin/station/${st.azuracast_id}`, "PUT", { is_enabled: !!body.enabled });
      return json({ ok: true });
    }

    if (action !== "provision") return json({ error: "Unknown action." }, 400);
    if (st.azuracast_id) return json({ ok: true, already: true });

    const warnings: string[] = [];
    const shortName = (st.slug || "station").slice(0, 40);

    // 1) The station itself: Icecast output + Liquidsoap AutoDJ, live DJs allowed.
    const created = await az("/admin/stations", "POST", {
      name: st.station_name,
      short_name: shortName,
      description: `${st.genre ? st.genre + " radio" : "Radio"} on MiRadio`,
      genre: st.genre ?? "",
      is_enabled: true,
      frontend_type: "icecast",
      backend_type: "liquidsoap",
      enable_streamers: true,
      enable_public_page: true,
    });
    const id: number = created.id;

    // 2) A DJ account so the owner can broadcast live.
    const djUser = (shortName.replace(/[^a-z0-9]/gi, "") || "dj").slice(0, 24).toLowerCase();
    const djPass = password();
    try {
      await az(`/station/${id}/streamers`, "POST", {
        streamer_username: djUser,
        streamer_password: djPass,
        display_name: st.owner_name || st.station_name,
        is_active: true,
      });
    } catch (e) {
      warnings.push("DJ account: " + (e as Error).message);
    }

    // 3) A control-panel login for the owner, limited to their own station.
    let panelPass: string | null = null;
    try {
      const role = await az("/admin/roles", "POST", {
        name: `MiRadio: ${st.station_name} (#${id})`,
        permissions: { global: [], station: [{ id, permissions: OWNER_PERMISSIONS }] },
      });
      panelPass = password();
      await az("/admin/users", "POST", {
        email: st.email,
        name: st.owner_name || st.station_name,
        new_password: panelPass,
        roles: [role.id],
      });
    } catch (e) {
      panelPass = null;
      warnings.push("Owner control-panel login: " + (e as Error).message);
    }

    // 4) Start it up.
    try { await az(`/station/${id}/restart`, "POST"); } catch (e) { warnings.push("Restart: " + (e as Error).message); }

    // 5) Read back the public addresses and the live-DJ port.
    const info = await az(`/station/${id}`);
    let djPort: number | null = null;
    try {
      const adminInfo = await az(`/admin/station/${id}`);
      const base = Number(adminInfo?.frontend_config?.port) || null;
      djPort = Number(adminInfo?.backend_config?.dj_port) || (base ? base + 5 : null);
    } catch { /* optional */ }

    const { error: upErr } = await db.from("stations").update({
      azuracast_id: id,
      azuracast_short: info.shortcode || shortName,
      stream_url: info.listen_url ?? null,
      player_url: info.public_player_url ?? null,
      dj_username: djUser,
      dj_password: djPass,
      dj_port: djPort,
      panel_password: panelPass,
      status: st.status === "pending" ? "approved" : st.status,
    }).eq("id", st.id);
    if (upErr) warnings.push("Saving stream details: " + upErr.message);

    return json({ ok: true, azuracast_id: id, warnings });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
