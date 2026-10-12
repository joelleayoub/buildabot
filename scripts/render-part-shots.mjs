// Renders a studio image of every part in data/parts.json to public/parts/<id>.png.
// Usage: start `npm run dev`, then `node scripts/render-part-shots.mjs [http://localhost:3000]`.
// Add "image_url": "/parts/<id>.png" to the part in data/parts.json to use it.
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv[2] ?? "http://localhost:3000";
// ONLY=id1,id2 re-renders just those parts.
const only = process.env.ONLY?.split(",");
const parts = JSON.parse(readFileSync(join(root, "data/parts.json"), "utf8")).filter((p) => !only || only.includes(p.id));
mkdirSync(join(root, "public/parts"), { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 });
for (const p of parts) {
  await page.goto(`${base}/dev/shot?id=${p.id}`, { waitUntil: "networkidle" });
  await page.waitForSelector("#shot canvas");
  await page.waitForTimeout(2500); // let the camera settle on the part
  await page.locator("#shot").screenshot({ path: join(root, "public/parts", `${p.id}.png`), omitBackground: true });
  console.log("rendered", p.id);
}
await browser.close();
