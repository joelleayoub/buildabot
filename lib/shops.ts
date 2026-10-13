// Where to buy, for where the user is: shops in their country, shops nearby that may deliver,
// and shops that ship worldwide, plus official seller finders for branded boards. Links are
// shop searches or home pages, never guessed product pages.
import retailersJson from "@/data/retailers.json";
import countriesJson from "@/data/countries.json";
import type { Part } from "./compat/types";

export type ShopKind = "marketplace" | "specialist" | "distributor" | "finder";
export type Carries = "parts" | "supplies" | "tools";

export interface Retailer {
  id: string;
  name: string;
  home: string;
  /** Search URL with {q} (URL-encoded) or {q-dash} (words-joined-by-dashes). */
  search?: string;
  kind: ShopKind;
  /** Country the shop ships from (display name or ISO code for national marketplaces). */
  based: string;
  /** Countries where it's a local shop. */
  local: string[];
  /** Countries it sells to; "*" means worldwide. */
  sells_to: string[];
  carries: Carries[];
  brands: string[];
  /** Part slots it stocks, when it doesn't stock everything. */
  slots?: string[];
  note: string;
}

export interface Country {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

export type Tier = "local" | "nearby" | "worldwide" | "official";

export interface RankedShop extends Retailer {
  tier: Tier;
  /** Short line on where it ships from and whether it delivers to the user. */
  label: string;
}

export const RETAILERS = retailersJson as Retailer[];
export const RETAILERS_BY_ID: Record<string, Retailer> = Object.fromEntries(RETAILERS.map((r) => [r.id, r]));
export const COUNTRIES = (countriesJson as Country[]).sort((a, b) => a.name.localeCompare(b.name));
export const countryName = (code?: string) => COUNTRIES.find((c) => c.code === code)?.name ?? code ?? "";

const KIND_ORDER: Record<ShopKind, number> = { specialist: 0, marketplace: 1, distributor: 2, finder: 3 };
const WORLDWIDE_ORDER = ["aliexpress", "pololu", "adafruit", "thepihut", "pimoroni", "cytron", "digikey", "mouser", "sparkfun", "robotshop", "seeed", "dfrobot", "waveshare", "rs", "farnell"];

const basedName = (r: Retailer) => (r.based.length === 2 ? countryName(r.based) : r.based);

export function shopsFor(cc?: string): RankedShop[] {
  const where = countryName(cc);
  const out: RankedShop[] = [];
  for (const r of RETAILERS) {
    if (r.kind === "finder") {
      out.push({ ...r, tier: "official", label: r.note });
      continue;
    }
    const worldwide = r.sells_to.includes("*");
    if (cc && r.local.includes(cc)) out.push({ ...r, tier: "local", label: `In ${where}` });
    else if (cc && r.sells_to.includes(cc)) out.push({ ...r, tier: "nearby", label: r.based.length === 2 || ["Germany", "France", "Poland", "Netherlands", "United Kingdom"].includes(r.based) ? `Ships from ${basedName(r)}` : `Ships from ${basedName(r)}: ask whether they deliver to ${where}` });
    else if (worldwide) out.push({ ...r, tier: "worldwide", label: `Ships worldwide from ${basedName(r)}` });
  }
  const tierOrder: Record<Tier, number> = { local: 0, nearby: 1, worldwide: 2, official: 3 };
  const ww = (r: RankedShop) => (r.tier === "worldwide" ? WORLDWIDE_ORDER.indexOf(r.id) + 1 || 99 : 0);
  return out.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier] || ww(a) - ww(b) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
}

/** What to type into a shop's search box for a part: its name without the details in brackets. */
export function searchTerm(name: string, brand?: string): string {
  const base = name.replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const b = brand && !/generic|diy/i.test(brand) ? brand.split(" / ")[0] : "";
  return b && !base.toLowerCase().includes(b.toLowerCase()) ? `${b} ${base}` : base;
}

export interface ShopLink {
  url: string;
  /** True when the link runs the search; false when it opens the shop and the user searches for `term`. */
  direct: boolean;
  term: string;
}

export function linkFor(r: Retailer, term: string): ShopLink {
  if (!r.search) return { url: r.home, direct: false, term };
  const dashed = term
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return { url: r.search.replace("{q}", encodeURIComponent(term)).replace("{q-dash}", dashed), direct: true, term };
}

/** The catalog's own link points at one of these shops, if any. */
export function originalShop(url: string): Retailer | undefined {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return RETAILERS.find((r) => r.kind !== "finder" && new URL(r.home).hostname.replace(/^www\./, "") === host);
}

const brandOf = (p: Part) => p.brand.split(" / ").map((b) => b.trim());

/** Ranked shops for one part (or supply), best first, for the user's country. */
type Buyable = Pick<Part, "name" | "brand" | "buy_url"> & { slot?: string };

export function shopsForPart(part: Buyable, cc: string | undefined, carries: Carries = "parts", limit = 6): (RankedShop & { link: ShopLink })[] {
  const brands = brandOf(part as Part);
  const term = searchTerm(part.name, part.brand);
  const ranked = shopsFor(cc).filter(
    (r) => r.carries.includes(carries) && (!r.slots || !part.slot || r.slots.includes(part.slot)) && (r.kind !== "finder" || r.brands.some((b) => brands.includes(b))),
  );
  // The brand's own store and official finders go first for genuine branded boards.
  const own = (r: RankedShop) => (r.brands.some((b) => brands.includes(b)) || brands.some((b) => r.name.toLowerCase().startsWith(b.toLowerCase())) ? -1 : 0);
  const original = originalShop(part.buy_url);
  const sorted = [...ranked].sort((a, b) => {
    const t = (x: RankedShop) => (x.tier === "local" ? 0 : x.tier === "nearby" ? 1 : 2);
    const direct = (x: RankedShop) => (x.search ? 0 : 1);
    return t(a) - t(b) || own(a) - own(b) || Number(b.id === original?.id) - Number(a.id === original?.id) || direct(a) - direct(b);
  });
  return sorted.slice(0, limit).map((r) => ({ ...r, link: linkFor(r, term) }));
}

/** The shop a part goes to in the order plan unless the user picks another: the first one that delivers and has a direct search. */
export function defaultShopFor(part: Buyable, cc: string | undefined, carries: Carries = "parts"): string {
  const original = originalShop(part.buy_url);
  if (!cc) return original?.id ?? "original";
  const options = shopsForPart(part, cc, carries, 30).filter((s) => s.kind !== "finder");
  const localDirect = options.find((s) => s.tier === "local" && s.link.direct);
  if (localDirect) return localDirect.id;
  if (original && (original.sells_to.includes("*") || original.sells_to.includes(cc))) return original.id;
  // Genuine branded boards: a specialist that delivers nearby beats a marketplace.
  const branded = !/generic|diy/i.test(part.brand);
  const nearbySpecialist = options.find((s) => s.tier !== "worldwide" && s.kind === "specialist");
  if (branded && nearbySpecialist) return nearbySpecialist.id;
  return options.find((s) => s.link.direct)?.id ?? options[0]?.id ?? "original";
}
