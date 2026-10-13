// Finds the user's place and what's near it, from OpenStreetMap (Nominatim + Overpass):
// makerspaces and print shops, and shops that may stock electronics, screws and tools.
// Both are free community services: keep requests low and identify the app in the User-Agent.
import type { ApiError } from "@/lib/advisor/api";
import { parseOverpass, parseShops, type LocalShop, type Makerspace, type Place } from "@/lib/print";

const UA = `buildabot/0.1 (${process.env.OSM_CONTACT ?? "https://github.com/joelleayoub/buildabot"})`;
const SPACES_M = 60000;
const SHOPS_M = 25000;

async function getJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, headers: { "user-agent": UA, ...(init?.headers ?? {}) }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.json();
}

const country = (a: Record<string, string> | undefined) => ({ country_code: a?.country_code?.toUpperCase(), country: a?.country });

async function geocode(q: string): Promise<Place | null> {
  const rows = await getJson(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(q)}`);
  const r = rows?.[0];
  return r ? { name: String(r.display_name).split(",").slice(0, 2).join(",").trim(), lat: Number(r.lat), lon: Number(r.lon), ...country(r.address) } : null;
}

async function reverse(lat: number, lon: number): Promise<Place> {
  try {
    const r = await getJson(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`);
    const a = r?.address ?? {};
    return { name: [a.city ?? a.town ?? a.village ?? a.county, a.country].filter(Boolean).join(", ") || "Your location", lat, lon, ...country(a) };
  } catch {
    return { name: "Your location", lat, lon };
  }
}

const overpass = (query: string) => getJson("https://overpass-api.de/api/interpreter", { method: "POST", body: "data=" + encodeURIComponent(query), headers: { "content-type": "application/x-www-form-urlencoded" } });

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams.get("q")?.trim().slice(0, 120);
  const lat = Number(u.searchParams.get("lat"));
  const lon = Number(u.searchParams.get("lon"));
  const want = new Set((u.searchParams.get("want") ?? "spaces").split(","));
  try {
    const place = q ? await geocode(q) : Number.isFinite(lat) && Number.isFinite(lon) && u.searchParams.has("lat") ? await reverse(lat, lon) : null;
    if (!place) return Response.json({ error: "not_found", message: "I couldn't find that place. Try a city and country." } satisfies ApiError, { status: 404 });
    let spaces: Makerspace[] = [];
    let shops: LocalShop[] = [];
    const at = (r: number) => `(around:${r},${place.lat},${place.lon})`;
    await Promise.all([
      want.has("spaces") &&
        overpass(`[out:json][timeout:15];(nwr["leisure"="hackerspace"]${at(SPACES_M)};nwr["name"~"3D ?print|fab ?lab|makerspace",i]${at(SPACES_M)};);out center 40;`)
          .then((j) => (spaces = parseOverpass(j, place)))
          .catch((err) => console.error("overpass spaces failed", err)),
      want.has("shops") &&
        overpass(`[out:json][timeout:15];nwr["shop"~"^(radiotechnics|electronics|hardware|doityourself|electrical)$"]["name"]${at(SHOPS_M)};out center 80;`)
          .then((j) => (shops = parseShops(j, place)))
          .catch((err) => console.error("overpass shops failed", err)),
    ]);
    return Response.json({ place, spaces, shops }, { headers: { "cache-control": "public, max-age=86400" } });
  } catch (err) {
    console.error("place lookup failed", err);
    return Response.json({ error: "lookup_failed", message: "Location search isn't available right now. You can still use the online shops below." } satisfies ApiError, { status: 502 });
  }
}
