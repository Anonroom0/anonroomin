// supabase/functions/instagram-scrape/index.ts
import { serve } from "https://deno.land/std/http/server.ts";

const IG_ENDPOINT = (username: string) =>
  `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  "X-IG-App-ID": "936619743392459",
  "Referer": "https://www.instagram.com/",
  "Accept": "*/*",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function isValidUsername(username: string) {
  return /^[a-zA-Z0-9._]{1,30}$/.test(username);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
  return new Response("ok", { headers: CORS_HEADERS });
}
  console.log("=== New request received ===");

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  let username: string | undefined;
  try {
    const body = await req.json();
    username = (body?.username ?? "").toString().trim().replace(/^@/, "");
  } catch {
    console.log("Failed to parse request body");
    return jsonResponse({ error: "invalid_body" }, 400);
  }

  console.log("Requested username:", username);

  if (!username || !isValidUsername(username)) {
    console.log("Username failed validation");
    return jsonResponse({ error: "invalid_username" }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(IG_ENDPOINT(username), {
      headers: HEADERS,
      signal: controller.signal,
    });

    console.log("IG response status:", res.status);

    const raw = await res.text();
    console.log("IG raw body (first 500 chars):", raw.slice(0, 500));

    if (res.status === 404) return jsonResponse({ error: "not_found" }, 404);
  if (res.status === 429 || res.status === 401 || res.status === 403) {
  return jsonResponse({ fallback: true, username });
}
    if (!res.ok) return jsonResponse({ error: "upstream_error", status: res.status }, 502);

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      console.log("IG response was not valid JSON — likely a block page");
      return jsonResponse({ error: "upstream_non_json" }, 502);
    }

   if (data?.require_login) {
  console.log("Instagram is rate-limiting this server — returning fallback card");
  return jsonResponse({ fallback: true, username });
}

const u = data?.data?.user;
if (!u) {
  console.log("Parsed JSON but no user object found. Keys were:", Object.keys(data || {}));
  return jsonResponse({ error: "not_found" }, 404);
}

    console.log("Success — found user:", u.username);

    return jsonResponse({
      username: u.username,
      full_name: u.full_name || null,
      bio: u.biography || null,
      pfp_url: u.profile_pic_url_hd || u.profile_pic_url || null,
      followers: u.edge_followed_by?.count ?? null,
      following: u.edge_follow?.count ?? null,
      posts: u.edge_owner_to_timeline_media?.count ?? null,
      is_verified: !!u.is_verified,
      is_private: !!u.is_private,
      external_url: u.external_url || null,
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    console.log("Fetch threw an error:", timedOut ? "timeout" : String(err));
    return jsonResponse({ error: timedOut ? "timeout" : "fetch_failed" }, timedOut ? 504 : 502);
  } finally {
    clearTimeout(timeout);
  }
});