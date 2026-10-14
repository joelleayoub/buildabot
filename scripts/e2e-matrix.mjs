// Runs the full rover flow in a real browser for many different users: every use case, different
// floors, experience levels, budgets and reference-design starts, on desktop and phone. Clicks
// through every part, swaps and undoes, adds a sensor, opens every wiring tab, downloads the files,
// shares the build and opens the share link, walks every guide step, asks the advisor, and reloads
// to check the project comes back. Fails on any page error, console error or HTTP 5xx.
// Usage: `node scripts/e2e-matrix.mjs [http://localhost:3000]`. ONLY=3,7 runs just those cases.
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
import { chromium, devices } from "playwright";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
// Two browsers at once; use WORKERS=1 on a slow machine (software WebGL can starve the clicks).
const WORKERS = Number(process.env.WORKERS ?? 2);

const UC = { drive: "Drive it from my phone", avoid: "Wander and avoid obstacles", map: "Map my home and drive to rooms", follow: "Follow me around", carry: "Carry things room to room" };
const ENV = { flat: "Flat floors", mixed: "Rugs and door thresholds", outdoor: "Outdoors" };
const EXP = { first: "This is my first robot", some: "I've done some electronics", linux: "I'm comfortable with Linux" };

const CASES = [
  { uc: "drive", env: "flat", exp: "first" },
  { uc: "drive", env: "outdoor", exp: "some", swap: "Wheels" },
  { uc: "drive", env: "mixed", exp: "first", budget: 40 },
  { uc: "avoid", env: "flat", exp: "first", add: "Camera" },
  { uc: "avoid", env: "mixed", exp: "some", swap: "Distance sensor" },
  { uc: "avoid", env: "outdoor", exp: "linux", swap: "Battery" },
  { uc: "map", env: "flat", exp: "linux" },
  { uc: "map", env: "mixed", exp: "some", swap: "Lidar" },
  { uc: "map", env: "flat", exp: "first", budget: 40 },
  { uc: "follow", env: "flat", exp: "some", swap: "Computer" },
  { uc: "follow", env: "outdoor", exp: "linux" },
  { uc: "carry", env: "mixed", exp: "linux", swap: "Chassis" },
  { uc: "carry", env: "flat", exp: "first", budget: 1200 },
  { uc: "avoid", env: "flat", exp: "some", design: true },
  { uc: "map", env: "flat", exp: "linux", design: true },
  { uc: "drive", env: "flat", exp: "first", mobile: true },
  { uc: "map", env: "mixed", exp: "some", mobile: true, swap: "Battery" },
  { uc: "follow", env: "flat", exp: "linux", mobile: true },
];

const EXPECTED_503 = /\/api\/(chat|guide|cad|arm)\b/; // the AI routes without a key

async function run(c, i) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  });
  const context = await browser.newContext(c.mobile ? { ...devices["iPhone 13"], acceptDownloads: true } : { viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  context.setDefaultTimeout(60000); // software WebGL is slow on CI machines
  const page = await context.newPage();
  const problems = [];
  const notes = [];
  const out503 = new Set();
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/WebGL|GPU stall|THREE\.WebGLRenderer|status of 503/.test(t)) return;
    problems.push(`console: ${t.slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() === 503 && EXPECTED_503.test(r.url())) out503.add(new URL(r.url()).pathname);
    else if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`);
  });
  const name = `#${i} ${c.uc}/${c.env}/${c.exp}${c.budget ? `/$${c.budget}` : ""}${c.design ? "/reference" : ""}${c.mobile ? "/phone" : ""}`;
  const step = async (what, fn) => {
    try {
      await fn();
    } catch (e) {
      problems.push(`${what}: ${e.message.split("\n")[0]}`);
      await page.screenshot({ path: `e2e-fail-${i}.png` }).catch(() => {});
      throw e;
    }
  };
  const btn = (n) => page.getByRole("button", { name: n }).first();
  const overflow = async (where) => {
    if (!c.mobile) return;
    const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (w > 2) problems.push(`${where}: page scrolls sideways by ${w}px on a phone`);
  };
  const total = async () => (await page.locator("text=/^\\$[\\d,]+$/").first().textContent({ timeout: 5000 }).catch(() => "?"))?.trim();
  const t0 = Date.now();

  try {
    await step("open", async () => {
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await page.getByText("Start with a rover").click({ timeout: 30000 });
    });
    await step("answer", async () => {
      await page.getByText(UC[c.uc], { exact: true }).click();
      await page.getByText(ENV[c.env], { exact: true }).click();
      await page.getByText(EXP[c.exp], { exact: true }).click();
      if (c.budget) await page.locator("input[type=range]").fill(String(c.budget));
      await overflow("questions");
      await btn("See starting points").click();
    });
    await step("start", async () => {
      await page.waitForTimeout(800);
      await overflow("starting points");
      if (await page.getByText("No compatible build at this budget").isVisible()) {
        notes.push("no build at this budget (empty state shown)");
        throw new Error("stop");
      }
      const startBtn = c.design ? page.getByRole("button", { name: /^Start from (?!this)/ }).first() : btn("Start from this build");
      if (c.design) notes.push(`started from "${(await startBtn.textContent()).replace("Start from ", "")}"`);
      await startBtn.click();
      await page.getByRole("tablist", { name: "Parts on your robot" }).waitFor({ timeout: 20000 });
    });
    const startTotal = await total();
    notes.push(`build ${startTotal}`);
    await step("build: every part", async () => {
      const tabs = page.getByRole("tablist", { name: "Parts on your robot" }).getByRole("tab");
      const n = await tabs.count();
      for (let k = 0; k < n; k++) {
        await tabs.nth(k).click();
        await page.waitForTimeout(250);
      }
      notes.push(`${n} parts`);
      const errs = await page.getByText(/won't work|Doesn't fit this build/).count();
      if (errs && !c.budget) notes.push(`${errs} non-fitting options listed`);
      await overflow("build");
    });
    if (c.swap) {
      await step(`build: swap ${c.swap}`, async () => {
        const tab = page.getByRole("tab", { name: new RegExp(c.swap) });
        // Not on the bot yet (wheels that come with the chassis kit, say): add one instead.
        const add = page.getByRole("button", { name: new RegExp(`^\\+\\s*${c.swap}`) });
        if (await tab.count()) await tab.click();
        else if (await add.count()) await add.click();
        else return notes.push(`no ${c.swap} to change (it comes with the kit)`);
        // A part that fits (blue button), like a user would pick; fall back to any option.
        const fitting = page.locator("button.bg-blue").filter({ hasText: /^(Swap in|Add to bot)$/ }).first();
        const fits = (await fitting.count()) > 0;
        const swapBtn = fits ? fitting : page.getByRole("button", { name: /^(Swap in|Add to bot)$/ }).first();
        if (!fits) notes.push(`no other ${c.swap.toLowerCase()} fits this build`);
        if (!(await swapBtn.isVisible())) return notes.push(`no alternative for ${c.swap}`);
        await swapBtn.click();
        const toast = page.getByRole("status");
        await toast.waitFor({ timeout: 5000 });
        const said = (await toast.textContent()).replace("Undo", "").trim();
        await page.getByRole("button", { name: "Undo" }).click({ timeout: 15000 });
        notes.push(`swap: "${said.slice(0, 110)}"`);
        await page.waitForTimeout(400);
        const undone = await total();
        if (undone !== startTotal) problems.push(`undo didn't restore the build (${startTotal}, after undo ${undone})`);
        if (fits) {
          await swapBtn.click();
          await page.waitForTimeout(400);
        }
      });
    }
    if (c.add) {
      await step(`build: add ${c.add}`, async () => {
        await page.getByRole("button", { name: new RegExp(`^\\+\\s*${c.add}`) }).click();
        await btn("Add to bot").click();
        await page.getByRole("status").waitFor({ timeout: 5000 });
        notes.push(`add: "${(await page.getByRole("status").textContent()).replace("Undo", "").trim().slice(0, 110)}"`);
      });
    }
    await step("wiring", async () => {
      await btn("Next: wiring").click();
      await page.getByText("How it all connects").waitFor();
      const wires = await page.locator("svg[aria-label='Wiring diagram'] text").count();
      if (!wires) problems.push("wiring diagram is empty");
      await overflow("wiring diagram");
      await page.getByRole("tab", { name: "Pin map and code" }).click();
      const rows = await page.locator("table tbody tr").count();
      notes.push(`${rows} pins`);
      const code = page.getByRole("button", { name: "Download" }).first();
      if (await code.isVisible()) {
        const [dl] = await Promise.all([page.waitForEvent("download"), code.click()]);
        notes.push(`code ${dl.suggestedFilename()}`);
      }
      await overflow("pin map");
      await page.getByRole("tab", { name: "Custom PCB" }).click();
      const net = btn("Download KiCad netlist");
      if (await net.isVisible()) {
        const [dl] = await Promise.all([page.waitForEvent("download"), net.click()]);
        if (!dl.suggestedFilename().endsWith(".net")) problems.push("netlist download name");
      }
      await overflow("PCB");
    });
    await step("cart", async () => {
      await btn("Next: cart").click();
      await page.waitForTimeout(500);
      const links = await page.locator('main a[href^="http"]').count();
      notes.push(`${links} shop links`);
      if (!links) problems.push("cart has no shop links");
      const [csv] = await Promise.all([page.waitForEvent("download"), btn("Download parts list").click()]);
      const body = await (await import("node:fs/promises")).readFile(await csv.path(), "utf8");
      if (body.split("\n").length < 4 || /undefined|NaN/.test(body)) problems.push("parts list CSV looks wrong");
      await btn("Share this build").click();
      const link = page.locator("text=/\\/b\\//").first();
      await link.waitFor({ timeout: 10000 });
      const url = (await link.textContent()).trim();
      const share = await context.newPage();
      const res = await share.goto(url);
      if (!res.ok()) problems.push(`share link ${res.status()}`);
      else if (!(await share.locator("text=/\\$\\d/").count())) problems.push("share page shows no prices");
      await share.close();
      await overflow("cart");
    });
    await step("guide", async () => {
      await btn("Get the build guide").click();
      await page.getByRole("heading", { name: "Build it, step by step" }).waitFor();
      let n = 1;
      const next = page.getByRole("button", { name: /^(Next step|Finish)$/ });
      while (n < 60 && (await next.isEnabled())) {
        const label = await next.textContent();
        await next.click();
        await page.waitForTimeout(c.mobile ? 500 : 350);
        if (label === "Finish") break;
        n++;
      }
      notes.push(`${n} guide steps`);
      await overflow("picture guide");
      await page.getByRole("tab", { name: "Checklist" }).click();
      const [dl] = await Promise.all([page.waitForEvent("download"), btn("Download checklist").click()]);
      const md = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
      if (/undefined|NaN|\[object/.test(md)) problems.push("checklist has broken text");
      const ai = page.getByRole("tab", { name: "Detailed guide by buildabot" });
      if (await ai.isEnabled()) {
        await ai.click();
        await page.waitForTimeout(1500);
      } else notes.push("AI guide tab disabled (build has errors)");
    });
    await step("advisor", async () => {
      await page.getByRole("button", { name: "Ask buildabot" }).first().click();
      await page.getByPlaceholder("Ask about your robot…").fill("Can it climb a 2 cm step?");
      await btn("Send").click();
      await page.waitForTimeout(2000);
      await page.keyboard.press("Escape");
    });
    await step("reload", async () => {
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "Build it, step by step" }).waitFor({ timeout: 20000 });
    });
  } catch (e) {
    if (e.message !== "stop") {
      /* already recorded */
    }
  }
  await browser.close();
  return { name, problems, notes, secs: Math.round((Date.now() - t0) / 1000), ai503: [...out503] };
}

const only = process.env.ONLY?.split(",").map(Number);
const queue = CASES.map((c, i) => [c, i]).filter(([, i]) => !only || only.includes(i));
const results = [];
await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    while (queue.length) {
      const [c, i] = queue.shift();
      const r = await run(c, i);
      results[i] = r;
      console.log(`${r.problems.length ? "FAIL" : "ok  "} ${r.name} (${r.secs} s): ${r.notes.join("; ")}${r.problems.length ? "\n     - " + r.problems.join("\n     - ") : ""}`);
    }
  }),
);
const failed = results.filter((r) => r && r.problems.length);
console.log(`\n${results.filter(Boolean).length - failed.length} of ${results.filter(Boolean).length} flows passed.`);
process.exit(failed.length ? 1 : 0);
