# buildabot

Answer a few questions and get a robot build where every part works together. You see it in 3D (point at any part to see what it does), then get a wiring diagram, a parts list with shop links, a share link and a step-by-step build guide. You can also design 3D-printable parts (mounting plates, sensor brackets, battery trays, risers) by describing them, download the STL, and find a makerspace or print service near you. An AI advisor ("Ask buildabot") can explain parts, change the build, write a detailed guide and turn part descriptions into designs.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

`.env.local` (not committed):

```
ANTHROPIC_API_KEY=...              # turns on the advisor chat and the detailed AI guide
NEXT_PUBLIC_SUPABASE_URL=...       # without these two, projects are kept in memory
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Everything except the chat and the AI guide works without an Anthropic key.

Database: in the Supabase SQL editor run `supabase/schema.sql`, then `supabase/seed.sql`. Regenerate the seed with `node scripts/build-seed.mjs` when `data/*.json` changes.

Tests: `npx tsx --test lib/*.test.ts lib/compat/*.test.ts lib/cad/*.test.ts lib/electronics/*.test.ts`

Location search uses OpenStreetMap's free Nominatim and Overpass services. Set `OSM_CONTACT` (an email or URL) in production so they can reach you, as their usage policy asks.

## Deploy

Import the GitHub repo on vercel.com and add the same variables under Project Settings, Environment Variables. Every push gets its own preview link.

## Before real users see it

- Part pictures are drawn illustrations. Add a photo by setting `"image_url"` on a part in `data/parts.json` (only images you have the rights to).
- Prices and specs in `data/parts.json` are approximate, and "Find at" links are shop searches until they're replaced with product or affiliate links.
- Add a usage limit on `/api/chat` and `/api/guide` before the link goes public, since both spend Anthropic credit.
