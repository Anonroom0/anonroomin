// supabase/functions/capture-profile-metadata/index.ts
//
// Same behavior as before (INSERT-only history, never updates/deletes),
// plus: records WHY coordinates were missing (geo_error) instead of
// silently treating every non-coords case as a plain IP fallback. This
// makes it possible to tell from the database whether a bad location
// came from a real IP fallback vs. a failed/denied browser prompt.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ClientMetadata {
  device_type?: string | null;
  browser?: string | null;
  os?: string | null;
  language?: string | null;
  timezone?: string | null;
  screen_resolution?: string | null;
  referrer?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  accuracy_m?: number | null;
  geo_error?: string | null; // 'denied' | 'timeout' | 'unavailable' | 'unsupported' | 'insecure_context'
}

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first || null;
}

function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<{ city: string | null; region: string | null; country: string | null }> {
  const empty = { city: null, region: null, country: null };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    // zoom=14 gives a finer-grained match than city-level (10), which
    // matters near state borders (UP/Uttarakhand, etc.)
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`,
      {
        signal: controller.signal,
        headers: { "User-Agent": "profile-metadata-capture/1.0" },
      },
    );
    clearTimeout(timeout);
    if (!res.ok) return empty;

    const data = await res.json();
    const addr = data?.address ?? {};
    return {
      city: addr.city ?? addr.town ?? addr.village ?? addr.county ?? null,
      region: addr.state ?? null,
      country: addr.country ?? null,
    };
  } catch (_err) {
    return empty;
  }
}

async function lookupIpGeoInfo(ip: string | null): Promise<{
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}> {
  const empty = { city: null, region: null, country: null, latitude: null, longitude: null };
  if (!ip) return empty;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country,lat,lon`,
      { signal: controller.signal },
    );
    clearTimeout(timeout);
    if (!res.ok) return empty;

    const data = await res.json();
    if (data.status !== "success") return empty;

    return {
      city: data.city ?? null,
      region: data.regionName ?? null,
      country: data.country ?? null,
      latitude: typeof data.lat === "number" ? data.lat : null,
      longitude: typeof data.lon === "number" ? data.lon : null,
    };
  } catch (_err) {
    return empty;
  }
}

async function resolveLocationRow(
  ip: string | null,
  clientLat: unknown,
  clientLng: unknown,
  clientAccuracy: unknown,
  geoError: unknown,
) {
  if (isValidCoordinate(clientLat, clientLng)) {
    const reverse = await reverseGeocode(clientLat, clientLng as number);
    return {
      latitude: clientLat,
      longitude: clientLng as number,
      accuracy_m: typeof clientAccuracy === "number" ? clientAccuracy : null,
      city: reverse.city,
      region: reverse.region,
      country: reverse.country,
      source: "coords" as const,
      geo_error: null,
    };
  }

  const ipGeo = await lookupIpGeoInfo(ip);
  return {
    latitude: ipGeo.latitude,
    longitude: ipGeo.longitude,
    accuracy_m: null,
    city: ipGeo.city,
    region: ipGeo.region,
    country: ipGeo.country,
    source: "ip" as const,
    // Records WHY we ended up on the IP fallback path, if the client told us.
    geo_error: typeof geoError === "string" ? geoError : null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

    if (!token) {
      return jsonResponse({ ok: false, error: "Missing access token" }, 401);
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);

    if (userError || !userData?.user) {
      return jsonResponse({ ok: false, error: "Invalid or expired session" }, 401);
    }

    const userId = userData.user.id;

    let body: ClientMetadata = {};
    try {
      body = await req.json();
    } catch (_err) {
      body = {};
    }

    const {
      device_type = null,
      browser = null,
      os = null,
      language = null,
      timezone = null,
      screen_resolution = null,
      referrer = null,
      latitude = null,
      longitude = null,
      accuracy_m = null,
      geo_error = null,
    } = body;

    const ipAddress = getClientIp(req);
    const userAgent = req.headers.get("user-agent") ?? null;
    const locationRow = await resolveLocationRow(ipAddress, latitude, longitude, accuracy_m, geo_error);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error: insertError } = await adminClient.from("profile_locations").insert({
      user_id: userId,
      latitude: locationRow.latitude,
      longitude: locationRow.longitude,
      accuracy_m: locationRow.accuracy_m,
      city: locationRow.city,
      region: locationRow.region,
      country: locationRow.country,
      source: locationRow.source,
      geo_error: locationRow.geo_error,
    });

    if (insertError) {
      return jsonResponse({ ok: false, error: "Failed to insert location history" }, 500);
    }

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({
        ip_address: ipAddress,
        user_agent: userAgent,
        device_type,
        browser,
        os,
        language,
        timezone,
        screen_resolution,
        referrer,
      })
      .eq("id", userId);

    if (updateError) {
      return jsonResponse(
        { ok: true, location_source: locationRow.source, geo_error: locationRow.geo_error, profile_update_error: updateError.message },
        200,
      );
    }

    return jsonResponse({ ok: true, location_source: locationRow.source, geo_error: locationRow.geo_error }, 200);
  } catch (_err) {
    return jsonResponse({ ok: false, error: "Unexpected server error" }, 500);
  }
});
