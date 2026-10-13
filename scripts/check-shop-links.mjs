// Opens every shop's home page and search URL from data/retailers.json with a test search and
// reports which ones fail, so broken links are caught before users see them.
// Usage: `node scripts/check-shop-links.mjs` (needs internet; some shops block scripts and show 403).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shops = JSON.parse(readFileSync(join(root, "data/retailers.json"), "utf8"));
const TERM = "TB6612FNG motor driver";
const dashed = TERM.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const urls = shops.flatMap((s) => [{ id: s.id, what: "home", url: s.home }, ...(s.search ? [{ id: s.id, what: "search", url: s.search.replace("{q}", encodeURIComponent(TERM)).replace("{q-dash}", dashed) }] : [])]);

const results = await Promise.all(
  urls.map(async (u) => {
    try {
      const res = await fetch(u.url, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (buildabot link check)" }, signal: AbortSignal.timeout(20000) });
      return { ...u, status: res.status };
    } catch (e) {
      return { ...u, status: 0, error: e.message };
    }
  }),
);
let bad = 0;
for (const r of results) {
  const ok = r.status >= 200 && r.status < 400;
  const blocked = r.status === 403 || r.status === 429;
  if (!ok) bad += blocked ? 0 : 1;
  console.log(`${ok ? "ok     " : blocked ? "blocked" : "FAIL   "} ${String(r.status).padEnd(4)} ${r.id.padEnd(22)} ${r.what.padEnd(7)} ${r.url}${r.error ? `  (${r.error})` : ""}`);
}
console.log(`\n${results.length - bad} of ${results.length} links answered (blocked ones need a check in a browser).`);
process.exit(bad ? 1 : 0);
