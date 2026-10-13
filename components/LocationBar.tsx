"use client";
// "Where are you?": type a city, use the browser's location, or just pick a country.
// Shared by the cart and "Get it printed" through lib/usePlace.
import { useState } from "react";
import { COUNTRIES, countryName } from "@/lib/shops";
import { usePlace } from "@/lib/usePlace";

export function LocationBar({ compact = false, why }: { compact?: boolean; why?: string }) {
  const { place, busy, error, search, locate, setCountry, clear } = usePlace();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);

  if (place && !editing) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-blue-soft px-4 py-3 text-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-blue" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
        <span className="font-semibold">{place.name}</span>
        {place.country_code && !place.name.includes(countryName(place.country_code)) && <span className="text-mute">{countryName(place.country_code)}</span>}
        <span className="ml-auto flex gap-3">
          <button onClick={() => setEditing(true)} className="font-semibold text-blue hover:underline">
            Change
          </button>
          <button onClick={clear} className="text-mute hover:text-ink">
            Forget
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className={compact ? "" : "rounded-2xl border border-line p-4"}>
      {!compact && <p className="text-sm font-semibold">Where are you?</p>}
      {!compact && why && <p className="mt-0.5 text-sm text-mute">{why}</p>}
      <form
        className="mt-2 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
          setEditing(false);
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
        <button
          type="button"
          onClick={() => {
            locate();
            setEditing(false);
          }}
          disabled={busy}
          className="h-10 rounded-full border border-line px-4 text-sm font-semibold hover:border-ink"
        >
          Use my location
        </button>
      </form>
      <label className="mt-2 flex flex-wrap items-center gap-2 text-sm text-mute">
        Or just pick your country:
        <select
          aria-label="Your country"
          value=""
          onChange={(e) => {
            const c = COUNTRIES.find((x) => x.code === e.target.value);
            if (c) setCountry(c.code, c.name, c.lat, c.lon);
            setEditing(false);
          }}
          className="h-9 rounded-full border border-line bg-paper px-3 text-sm text-ink"
        >
          <option value="">Choose…</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
        {editing && (
          <button type="button" onClick={() => setEditing(false)} className="font-semibold text-ink hover:underline">
            Cancel
          </button>
        )}
      </label>
      {error && <p className="mt-2 text-sm text-warn">{error}</p>}
    </div>
  );
}
