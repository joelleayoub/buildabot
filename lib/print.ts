// Print providers and distance sorting for "Get it printed".
import providersJson from "@/data/print_providers.json";

export interface Hub {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

export interface PrintProvider {
  id: string;
  name: string;
  url: string;
  kind: "service" | "marketplace";
  hubs: Hub[];
  /** 1 = budget, 2 = mid, 3 = premium. A typical position, not a quote. */
  price_tier: 1 | 2 | 3;
  notes: string;
}

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export interface Makerspace {
  name: string;
  lat: number;
  lon: number;
  km: number;
  website?: string;
  kind: string;
}

export const PROVIDERS = providersJson as PrintProvider[];

/** Great-circle distance in km. */
export function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export interface RankedProvider extends PrintProvider {
  /** Distance to the nearest production site, or null for marketplaces with makers everywhere. */
  distanceKm: number | null;
  nearestHub: Hub | null;
}

export function rankProviders(where: Place | null, sort: "nearest" | "cheapest"): RankedProvider[] {
  const ranked = PROVIDERS.map((p) => {
    if (!where || p.hubs.length === 0) return { ...p, distanceKm: null, nearestHub: null };
    const best = p.hubs.map((h) => ({ h, d: km(where, h) })).sort((a, b) => a.d - b.d)[0];
    return { ...p, distanceKm: best.d, nearestHub: best.h };
  });
  // Marketplaces route to printers near you, so they count as "near" for sorting.
  const dist = (p: RankedProvider) => (p.distanceKm === null ? (where ? 0 : Infinity) : p.distanceKm);
  return ranked.sort((a, b) => (sort === "cheapest" ? a.price_tier - b.price_tier || dist(a) - dist(b) : dist(a) - dist(b) || a.price_tier - b.price_tier));
}

export const PRICE_TIER_LABEL: Record<1 | 2 | 3, string> = { 1: "Budget", 2: "Mid-range", 3: "Premium" };

export const mapsSearchUrl = (place: string) => `https://www.google.com/maps/search/${encodeURIComponent(`3D printing service near ${place}`)}`;

/** Turns an Overpass response into the nearest named makerspaces and print shops. */
export function parseOverpass(json: { elements?: Record<string, unknown>[] }, from: Place): Makerspace[] {
  const out: Makerspace[] = [];
  const seen = new Set<string>();
  for (const e of json.elements ?? []) {
    const tags = (e.tags ?? {}) as Record<string, string>;
    const lat = Number(e.lat ?? (e.center as { lat?: number } | undefined)?.lat);
    const lon = Number(e.lon ?? (e.center as { lon?: number } | undefined)?.lon);
    if (!tags.name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = tags.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = tags.leisure === "hackerspace" ? (tags.hackerspace === "makerspace" ? "Makerspace" : "Hackerspace") : /fab ?lab/i.test(tags.name) ? "Fab lab" : "3D printing";
    out.push({ name: tags.name, lat, lon, km: km(from, { lat, lon }), website: tags.website ?? tags["contact:website"], kind });
  }
  return out.sort((a, b) => a.km - b.km).slice(0, 8);
}

