"use client";
// The user's place, shared by the cart (shops that deliver, shops nearby) and "Get it printed"
// (makerspaces, print services). Remembered in this browser; changing it anywhere updates both.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { LocalShop, Makerspace, Place } from "./print";

const KEY = "buildabot.place";
const EVENT = "buildabot:place";

function read(): Place | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return v && typeof v.lat === "number" && typeof v.lon === "number" ? v : null;
  } catch {
    return null;
  }
}

let cached: { raw: string | null; place: Place | null } = { raw: null, place: null };
function snapshot(): Place | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    /* storage blocked */
  }
  if (raw !== cached.raw) cached = { raw, place: read() };
  return cached.place;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function store(place: Place | null) {
  try {
    if (place) localStorage.setItem(KEY, JSON.stringify(place));
    else localStorage.removeItem(KEY);
  } catch {
    /* not remembered, still works for this page */
    cached = { raw: place ? JSON.stringify(place) : null, place };
  }
  window.dispatchEvent(new Event(EVENT));
}

interface Nearby {
  spaces: Makerspace[];
  shops: LocalShop[];
}
const nearbyCache = new Map<string, Nearby>();
const keyOf = (p: Place) => `${p.lat.toFixed(3)},${p.lon.toFixed(3)}`;

export function usePlace() {
  const place = useSyncExternalStore(subscribe, snapshot, () => null);
  const [nearby, setNearby] = useState<Nearby | null>(() => (place ? (nearbyCache.get(keyOf(place)) ?? null) : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (params: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/nearby?want=spaces,shops&${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      const n = { spaces: data.spaces ?? [], shops: data.shops ?? [] };
      nearbyCache.set(keyOf(data.place), n);
      setNearby(n);
      store(data.place);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "Location search isn't available right now.");
    } finally {
      setBusy(false);
    }
  }, []);

  // A remembered place: fetch what's near it once.
  useEffect(() => {
    if (!place || place.approx) return;
    const hit = nearbyCache.get(keyOf(place));
    if (hit) {
      const t = setTimeout(() => setNearby(hit), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => lookup(`lat=${place.lat}&lon=${place.lon}`), 0);
    return () => clearTimeout(t);
  }, [place, lookup]);

  const search = (q: string) => q.trim() && lookup(`q=${encodeURIComponent(q.trim())}`);
  const locate = () => {
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
  /** Pick a country without a lookup (the location services are down, or the user prefers not to say more). */
  const setCountry = (code: string, name: string, lat: number, lon: number) => store({ name, lat, lon, country_code: code, country: name, approx: true });
  const clear = () => {
    setNearby(null);
    store(null);
  };
  // Only what was found around this exact place (not a previous one, not a country's capital).
  const here = place && !place.approx ? (nearbyCache.get(keyOf(place)) ?? nearby) : null;
  const valid = here && place && nearbyCache.get(keyOf(place)) === here ? here : null;
  return { place, spaces: valid?.spaces ?? null, shops: valid?.shops ?? null, busy, error, search, locate, setCountry, clear };
}
