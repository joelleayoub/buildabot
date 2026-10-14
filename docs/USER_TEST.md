# User test: 5 people, rover flow

Goal: check the definition of done. A stranger opens the link, describes a rover, gets a compatible
build with prices and links, swaps a part, and downloads a build guide, in under 10 minutes, with
no errors.

## 1. Deploy (once, about 30 minutes)

1. **Supabase**: create a project, open the SQL editor and run `supabase/schema.sql` (it also
   creates the `events`, `feedback` and `ai_usage` tables; it is safe to run again after an update), then `supabase/seed.sql` to load the parts.
   If `data/*.json` changed, regenerate the seed first with `node scripts/build-seed.mjs`.
2. **Vercel**: import the GitHub repo, pick the `showroom` branch, and add these environment
   variables: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, plus `ADMIN_KEY` (any long random text, for `/admin`) and
   `RATE_LIMIT_SALT` (any random text). `NEXT_PUBLIC_SITE_URL` is optional once you have a domain.
   The AI usage limits default to sensible values; see the README to change them. Deploy.
3. **Set a spending limit** on the Anthropic key before sharing the link.
4. **Smoke test the live URL** from your laptop:
   `npm i -D playwright && npx playwright install chromium`, then
   `FEEDBACK=1 node scripts/smoke.mjs https://your-app.vercel.app`.
   It walks the whole flow, fails on any error, and prints how long each step took. Delete the
   test row from the `feedback` table afterwards.
5. Open the link on your phone too. A third of testers will.
6. During and after the sessions, open `https://your-app.vercel.app/admin?key=YOUR_ADMIN_KEY` to see
   how far each visitor got and what they wrote in the Feedback tab.

## 2. Who to recruit

Five people who have never built a robot but would like to: students, a curious friend, someone
from a makerspace newsletter. At least two should not be engineers. Avoid people who have seen
buildabot before.

## 3. Running a session (20 minutes each, video call with screen share)

Say: "I'm testing the website, not you. Please think out loud. I won't help unless you're stuck
for more than a minute."

Tasks, read one at a time:

1. "You want a small robot that drives around your flat and avoids walls. Use this site to work
   out what to buy." (Start a timer.)
2. "The build is a bit over your budget. Make it cheaper." (Swapping a part.)
3. "How would you wire the battery to the motors?" (Wiring step.)
4. "Where would you buy the battery?" (Cart and retailer link.)
5. "Get the instructions so you could build it this weekend." (Guide and download. Stop the timer.)
6. "Ask buildabot one question you still have." (AI advisor.)
7. "Use the Feedback button to tell us one thing." (Checks the button is findable.)

Write down, per task: done or not, time, where they hesitated, the words they used.

Questions at the end:

- What did you expect to happen that didn't?
- Was anything confusing or scary (batteries, soldering, wiring)?
- Would you actually order these parts? What would stop you?
- What would you pay for, if anything? (Ask last, and don't defend the answer.)

## 4. Reading the results

Events and feedback land in Supabase. Useful queries:

```sql
-- How far each session got, in order
select session, array_agg(event order by id) as path, max(created_at) - min(created_at) as duration
from events group by session order by min(created_at) desc;

-- Funnel
select event, count(distinct session) from events group by event order by 2 desc;

-- All feedback, newest first
select created_at, rating, step, goal, message from feedback order by id desc;
```

Running locally without Supabase, `GET /api/feedback` returns the same data from memory.

## 5. What counts as a pass

- 4 of 5 people finish tasks 1 to 5 without help.
- Median time for tasks 1 to 5 is under 10 minutes.
- No errors (check the Vercel logs and the browser console on your own run).

Fix the top three problems you saw, then test with the next five people.
