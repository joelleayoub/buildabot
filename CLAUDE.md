# BuildABot — MVP brief for Claude Code

## What we're building
A web app that helps a beginner go from "I want a robot that does X" to a **validated parts list
they can buy + a step-by-step build guide**. An AI advisor asks about the use case, explains
trade-offs, shows open-source reference designs, and assembles a build from a curated parts
database. Every build is checked by a deterministic compatibility checker before it's shown.

**MVP scope (1 week): wheeled indoor rovers only.** Arms, legs, humanoids, custom CAD and PCB
generation are explicitly out of scope until real users have tested this version.

## The core loop
1. User describes the robot ("a rover that maps my apartment and follows me").
2. Advisor asks 3–6 questions (environment, tasks, autonomy level, budget, skills, tools they own).
3. Advisor shows 1–3 matching reference designs (`data/reference_designs.json`).
4. Advisor proposes a build: one part per slot, with a one-line reason for each choice.
5. Build is run through `checkBuild()` — errors must be fixed by the advisor before showing;
   warnings are shown to the user.
6. User sees the build as a "cart": swap any part for an alternative in the same slot
   (re-checked live), see total price, open retailer links.
7. User clicks "Generate build guide" → ordered assembly + wiring + first-boot steps.

## Stack
- Next.js (App Router, TypeScript) on Vercel
- Supabase (Postgres + auth) — schema in `supabase/schema.sql`, seed via `scripts/build-seed.mjs`
- Claude API via `@anthropic-ai/sdk`, model `claude-sonnet-5-5`, with tool use
- Tailwind for UI
- Env: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`

## Files already in this kit
| Path | What it is |
|---|---|
| `data/parts.json` | ~45 rover parts with specs, slot, compatibility fields, approx price |
| `data/reference_designs.json` | Open-source rover designs to show as references |
| `supabase/schema.sql` | Tables: parts, reference_designs, projects, messages |
| `scripts/build-seed.mjs` | Turns the JSON into `supabase/seed.sql` |
| `lib/compat/types.ts` | Part / Build types |
| `lib/compat/checkBuild.ts` | Deterministic compatibility checker (no AI) |
| `lib/compat/checkBuild.test.ts` | Tests — run `npx tsx lib/compat/checkBuild.test.ts` |
| `lib/advisor/system-prompt.md` | The advisor's system prompt |
| `lib/advisor/tools.ts` | Tool definitions + handlers for the Claude API tool-use loop |

## Rules for the codebase
- **The AI never invents parts.** It can only recommend parts returned by `search_parts`.
  Every part ID in a build must exist in the DB.
- **The AI never decides compatibility alone.** `check_build` is the source of truth; the model
  explains its results in plain language.
- Prices in `parts.json` are approximate (`price_usd_approx`). Show them as "~$X" and link out.
  `buy_url` values are retailer *search* links until replaced with verified product/affiliate
  links — do not fabricate product URLs.
- Keep the advisor loop server-side (`app/api/chat/route.ts`), stream text to the client.
- Persist each project (requirements, chosen build, messages) so users can come back.

## Build order (7 days)
- **Day 1** — `create-next-app`, Supabase project, run `schema.sql`, seed parts. Page listing parts by slot (sanity check).
- **Day 2** — `/api/chat`: Claude tool-use loop with `lib/advisor/tools.ts`. Plain chat UI. Verify the advisor asks questions, searches parts, and calls `check_build`.
- **Day 3** — Build panel ("cart") next to chat: slots, chosen part, reason, price, swap dropdown per slot, live `checkBuild` errors/warnings, total.
- **Day 4** — Reference designs cards in chat; "Generate build guide" (second Claude call with the final build → markdown guide: tools needed, assembly order, wiring table, first boot, test checklist).
- **Day 5** — Auth + saved projects, shareable read-only build link.
- **Day 6** — Polish, empty states, mobile layout, analytics events (started, build_shown, part_swapped, guide_generated, link_clicked).
- **Day 7** — Deploy, test with 5 real users, collect feedback.

## Definition of done for the MVP
A stranger can open the link, describe a rover, answer questions, get a compatible build with
prices and links, swap a part, and download a build guide — in under 10 minutes, with no errors.
