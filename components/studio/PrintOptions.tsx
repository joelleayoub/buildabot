"use client";
// "Get it printed": print it yourself, find a makerspace nearby, or order from an online service.
import { useEffect, useMemo, useState } from "react";
import { mapsSearchUrl, PRICE_TIER_LABEL, rankProviders, type Makerspace, type Place } from "@/lib/print";

const PLACE_KEY = "buildabot.place";

const readPlace = (): Place | null => {
  try {
    return JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null");
  } catch {
    return null;
  }
};

const fmtKm = (km: number) => (km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString("en-US")} km`);

export default function PrintOptions({ onTrack }: { onTrack?: (providerId: string) => void }) {
  const [place, setPlace] = useState<Place | null>(readPlace);
  const [query, setQuery] = useState(place?.name ?? "");
  const [spaces, setSpaces] = useState<Makerspace[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"nearest" | "cheapest">("nearest");

  const lookup = async (params: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/print/nearby?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setPlace(data.place);
      setQuery(data.place.name);
      setSpaces(data.spaces);
      try {
        localStorage.setItem(PLACE_KEY, JSON.stringify(data.place));
      } catch {
        /* not remembered, still works */
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Location search isn't available right now.");
    } finally {
      setBusy(false);
    }
  };

  // Refresh nearby makerspaces for a remembered place.
  useEffect(() => {
    if (!place) return;
    const t = setTimeout(() => lookup(`lat=${place.lat}&lon=${place.lon}`), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const useMyLocation = () => {
    if (!navigator.geolocation) return setError("Your browser can't share its location. Type your city instead.");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => lookup(`lat=${pos.coords.latitude.toFixed(3)}&lon=${pos.coords.longitude.toFixed(3)}`),
      () => {
        setBusy(false);
        setError("Location access was blocked. Type your city instead.");
      },
      { timeout: 10000 },
    );
  };

  const providers = useMemo(() => rankProviders(place, sort), [place, sort]);

  return (
    <div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) lookup(`q=${encodeURIComponent(query.trim())}`);
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Your city and country"
          aria-label="Your city and country"
          className="h-10 min-w-0 flex-1 rounded-full border border-line px-4 text-sm outline-none focus:border-ink"
        />
        <button type="submit" disabled={busy || !query.trim()} className="h-10 rounded-full bg-ink px-4 text-sm font-semibold text-white disabled:bg-faint">
          {busy ? "Searching…" : "Search"}
        </button>
        <button type="button" onClick={useMyLocation} disabled={busy} className="h-10 rounded-full border border-line px-4 text-sm font-semibold hover:border-ink">
          Use my location
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-warn">{error}</p>}

      {place && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold">Near {place.name}</h4>
          {spaces && spaces.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {spaces.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.name}</p>
                    <p className="text-xs text-mute">
                      {s.kind}, {fmtKm(s.km)} away
                    </p>
                  </div>
                  <a
                    href={s.website ?? `https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lon}#map=17/${s.lat}/${s.lon}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-sm font-semibold text-blue hover:underline"
                  >
                    {s.website ? "Website" : "Map"}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-mute">{spaces === null ? "Looking for makerspaces…" : "No makerspaces are listed on OpenStreetMap within 60 km."}</p>
          )}
          <p className="mt-2 text-sm">
            <a href={mapsSearchUrl(place.name)} target="_blank" rel="noreferrer" className="font-semibold text-blue hover:underline">
              Search maps for print shops near {place.name.split(",")[0]}
            </a>
            <span className="text-mute"> or </span>
            <a href="https://www.fablabs.io/labs/map" target="_blank" rel="noreferrer" className="font-semibold text-blue hover:underline">
              find a fab lab
            </a>
          </p>
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold">Online print services</h4>
        <div className="flex rounded-full bg-stage-2 p-1 text-xs font-semibold" role="radiogroup" aria-label="Sort services">
          {(["nearest", "cheapest"] as const).map((s) => (
            <button key={s} role="radio" aria-checked={sort === s} onClick={() => setSort(s)} className={`rounded-full px-3 py-1.5 ${sort === s ? "bg-paper shadow-sm" : "text-mute"}`}>
              {s === "nearest" ? "Nearest" : "Lowest price"}
            </button>
          ))}
        </div>
      </div>
      <ul className="mt-2 space-y-2">
        {providers.map((p) => (
          <li key={p.id} className="rounded-2xl border border-line px-3.5 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <a href={p.url} target="_blank" rel="noreferrer" onClick={() => onTrack?.(p.id)} className="font-semibold text-blue hover:underline">
                {p.name}
              </a>
              <span className="shrink-0 text-xs text-mute">
                {PRICE_TIER_LABEL[p.price_tier]}
                {p.distanceKm !== null && p.nearestHub ? `, ships from ${p.nearestHub.city} (${fmtKm(p.distanceKm)})` : p.kind === "marketplace" ? ", printers in many countries" : ""}
              </span>
            </div>
            <p className="mt-1 text-sm leading-snug text-mute">{p.notes}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-mute">Price levels are typical, not quotes. Upload the STL on their site for an exact price and delivery date.</p>
    </div>
  );
}
