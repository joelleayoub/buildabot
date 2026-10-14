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
ADMIN_KEY=...                      # opens /admin?key=... (usage funnel, feedback, top links)
NEXT_PUBLIC_SITE_URL=https://...   # used for share previews; Vercel's own URL is the fallback
RATE_LIMIT_SALT=...                # any random text; visitors are counted by a salted IP hash
# Optional limits on the AI routes (defaults shown): calls per visitor per hour, and per day for everyone
AI_LIMIT_CHAT=40
AI_LIMIT_GUIDE=6
AI_LIMIT_CAD=30
AI_LIMIT_ARM=30
AI_DAILY_LIMIT=1500
```

Everything except the chat and the AI guide works without an Anthropic key.

Database: in the Supabase SQL editor run `supabase/schema.sql`, then `supabase/seed.sql`. Regenerate the seed with `node scripts/build-seed.mjs` when `data/*.json` changes.

Tests: `npx tsx --test lib/*.test.ts lib/compat/*.test.ts lib/cad/*.test.ts lib/electronics/*.test.ts lib/arm/*.test.ts`

Location search uses OpenStreetMap's free Nominatim and Overpass services. Set `OSM_CONTACT` (an email or URL) in production so they can reach you, as their usage policy asks.

## Deploy

Import the GitHub repo on vercel.com and add the same variables under Project Settings, Environment Variables. Every push gets its own preview link.

## Before real users see it

- Part pictures are studio renders of the 3D models. Add a photo by setting `"image_url"` on a part in `data/parts.json` (only images you have the rights to).
- Prices and specs in `data/parts.json` are approximate, and "Find at" links are shop searches until they're replaced with product or affiliate links.
- The AI routes (`/api/chat`, `/api/guide`, `/api/cad`, `/api/arm`) have usage limits (see the variables above). Still set a monthly spending limit on the Anthropic key.
- Re-run `supabase/schema.sql` after pulling: it adds the `ai_usage` table and the `custom_parts` column, and is safe to run twice.
- Run `node scripts/check-shop-links.mjs` from a machine with normal internet before relying on shop search links.

## User test

`docs/USER_TEST.md` has the deploy checklist, the session script and the SQL to read results.
`node scripts/smoke.mjs https://your-app.vercel.app` walks the whole rover flow and fails on any
error. `node scripts/e2e-matrix.mjs <url>` runs it for 18 different users (about 30 minutes) and
`node scripts/e2e-extras.mjs <url>` checks the catalog, part designer and arm advisor. Testers send feedback with the Feedback tab on every page; it lands in the Supabase
`feedback` table, next to the analytics `events`.

## Arm advisor (preview)

`/arm` sizes a robot arm for a described task: which kind of machine fits, the torque each joint
needs, motors that cover it, a parts list and open-source reference designs. It also says when a
ready-made arm is the better choice. When a SCARA arm or an XYZ gantry fits better than a jointed
arm, it sizes that machine axis by axis (belt and lead screw torques, speed, accuracy) and lets you
compare it with a jointed arm. It isn't part of the rover flow yet.

## Other pages

- **My robots** (header): every build made in this browser, to reopen, rename, copy or delete.
- **Save as PDF** on the Guide step: parts with shops, supplies and tools, wiring, pin map, all steps and the code.
- **/admin?key=ADMIN_KEY**: visitors, how far they got, feedback, most-clicked shop links and arm tasks.
