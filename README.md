# BuildABot starter kit

Everything Claude Code needs to build the rover MVP. See `CLAUDE.md` for the full brief and 7-day plan.

## Setup (≈15 min)

```bash
# 1. Create the app, then copy this kit's folders (CLAUDE.md, data/, lib/, scripts/, supabase/) into it
npx create-next-app@latest buildabot --ts --tailwind --app --eslint
cd buildabot
npm i @anthropic-ai/sdk @supabase/supabase-js
npm i -D tsx

# 2. Check the compatibility engine works (12 tests should pass)
npx tsx --test lib/compat/checkBuild.test.ts

# 3. Database: create a Supabase project, then in its SQL editor run
#    supabase/schema.sql, then supabase/seed.sql
node scripts/build-seed.mjs   # regenerate seed.sql whenever data/*.json changes

# 4. .env.local
ANTHROPIC_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## First prompt for Claude Code

> Read CLAUDE.md. Do Day 1 and Day 2: a parts page grouped by slot (using `jsonCatalog` from
> `lib/advisor/agent.ts` for now), and `app/api/chat/route.ts` + a simple chat page that runs
> `advisorTurn`. `presentBuild` should store the build in memory and return it in the API
> response so the page can render it as a cart beside the chat. Don't modify `lib/compat/`
> without updating its tests.

## Before real users see it

- Replace `buy_url` search links with verified product (or affiliate) links.
- Re-check prices and specs marked "approximate" in `data/parts.json`, especially the Jetson's
  input voltage range and generic AliExpress motors.
- The checker uses rules of thumb (see constants at the top of `lib/compat/checkBuild.ts`).
  Tune them as you test real builds.
