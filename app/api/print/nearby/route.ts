// Finds the user's place and nearby makerspaces from OpenStreetMap (Nominatim + Overpass).
// Both are free community services: keep requests low and identify the app in the User-Agent.
import type { ApiError } from "@/lib/advisor/api";
import { parseOverpass, type Makerspace, type Place } from "@/lib/print";

const UA = `buildabot/0.1 (${process.env.OSM_CONTACT ?? "https://github.com/joelleayoub/buildabot"})`;
const RADIUS_M = 60000;

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "user-agent": UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

async function geocode(q: string): Promise<Place | null> {
  const rows = await getJson(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
  const r = rows?.[0];
  return r ? { name: String(r.display_name).split(",").slice(0, 2).join(",").trim(), lat: Number(r.lat), lon: Number(r.lon) } : null;
}

async function reverse(lat: number, lon: number): Promise<Place> {
  try {
    const r = await getJson(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`);
    const a = r?.address ?? {};
    return { name: [a.city ?? a.town ?? a.village ?? a.county, a.country].filter(Boolean).join(", ") || "Your location", lat, lon };
  } catch {
    return { name: "Your location", lat, lon };
  }
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams.get("q")?.trim().slice(0, 120);
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  try {
    const place = q ? await geocode(q) : Number.isFinite(lat) && Number.isFinite(lon) && u.searchParams.has("lat") ? await reverse(lat, lon) : null;
    if (!place) return Response.json({ error: "not_found", message: "I couldn't find that place. Try a city and country." } satisfies ApiError, { status: 404 });
    let spaces: Makerspace[] = [];
    try {
      const around = `(around:${RADIUS_M},${place.lat},${place.lon})`;
      const query = `[out:json][timeout:15];(nwr["leisure"="hackerspace"]${around};nwr["name"~"3D ?print|fab ?lab|makerspace",i]${around};);out center 40;`;
      spaces = parseOverpass(await getJson("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "content-type": "application/x-www-form-urlencoded" } }), place);
    } catch (err) {
      console.error("overpass lookup failed", err);
    }
    return Response.json({ place, spaces }, { headers: { "cache-control": "public, max-age=86400" } });
  } catch (err) {
    console.error("place lookup failed", err);
    return Response.json({ error: "lookup_failed", message: "Location search isn't available right now. You can still use the online services below." } satisfies ApiError, { status: 502 });
  }
}
