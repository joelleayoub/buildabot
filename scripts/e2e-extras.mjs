// Browser checks for everything outside the main rover flow: parts catalog, the part designer
// (text to CAD, STL download, print services), the arm advisor with many tasks and edits, a
// missing share link, and phone layouts. Fails on page errors, console errors, HTTP 5xx, broken
// text ("NaN", "undefined") and sideways scrolling on a phone.
// Usage: `node scripts/e2e-extras.mjs [http://localhost:3000]`
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
import { chromium, devices } from "playwright";
import { readFile } from "node:fs/promises";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const results = [];

async function check(name, opts, fn) {
  const context = await browser.newContext({ ...opts, acceptDownloads: true });
  context.setDefaultTimeout(60000);
  const page = await context.newPage();
  const problems = [];
  const notes = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/WebGL|GPU stall|THREE\.WebGLRenderer|status of 50[234]|status of 404/.test(m.text()) && problems.push(`console: ${m.text().slice(0, 200)}`));
  page.on("response", (r) => r.status() >= 500 && r.status() !== 503 && r.status() !== 502 && problems.push(`HTTP ${r.status()} ${r.url()}`));
  const broken = async (where) => {
    const t = await page.locator("body").innerText();
    const m = t.match(/.{0,40}\b(NaN|undefined|\[object Object\]|Infinity)\b.{0,40}/);
    if (m) problems.push(`${where}: broken text "${m[0]}"`);
  };
  const overflow = async (where) => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (w > 2) problems.push(`${where}: page scrolls sideways by ${w}px`);
  };
  try {
    await fn({ page, problems, notes, broken, overflow });
  } catch (e) {
    problems.push(`stopped: ${e.message.split("\n")[0]}`);
    await page.screenshot({ path: `extras-fail-${results.length}.png` }).catch(() => {});
  }
  await context.close();
  results.push({ name, problems, notes });
  console.log(`${problems.length ? "FAIL" : "ok  "} ${name}: ${notes.join("; ")}${problems.length ? "\n     - " + problems.join("\n     - ") : ""}`);
}

const desktop = { viewport: { width: 1360, height: 900 } };
const phone = devices["iPhone 13"];

await check("parts catalog", desktop, async ({ page, notes, broken, problems }) => {
  await page.goto(`${base}/parts`);
  const n = await page.locator("main li, main article").count();
  notes.push(`${n} entries`);
  if (n < 30) problems.push("catalog looks empty");
  await broken("catalog");
});

await check("parts catalog on a phone", phone, async ({ page, overflow }) => {
  await page.goto(`${base}/parts`);
  await overflow("catalog");
});

await check("missing share link", desktop, async ({ page, notes, problems }) => {
  const res = await page.goto(`${base}/b/not-a-real-link`);
  notes.push(`HTTP ${res.status()}`);
  if (res.status() >= 500) problems.push("share page crashes on a bad link");
});

for (const [label, opts] of [["home", desktop], ["home on a phone", phone]]) {
  await check(label, opts, async ({ page, overflow, broken, notes }) => {
    await page.goto(base);
    await page.getByText("Start with a rover").waitFor();
    await overflow("home");
    await broken("home");
    await page.getByRole("link", { name: /Robot arm/ }).click();
    await page.waitForURL(/\/arm/);
    notes.push("arm tile opens /arm");
  });
}

await check("part designer: text to CAD, STL, printing", desktop, async ({ page, notes, problems, broken }) => {
  await page.goto(base);
  await page.getByText("Start with a rover").click();
  await page.getByText("Wander and avoid obstacles", { exact: true }).click();
  await page.getByRole("button", { name: "See starting points" }).click();
  await page.getByRole("button", { name: "Start from this build" }).click();
  await page.getByRole("button", { name: /Design a part/ }).first().click();
  const dialog = page.getByRole("dialog", { name: "Design a part" });
  await dialog.waitFor();
  for (const text of ["a plate to hold an Arduino Uno, 90 x 70 mm", "bracket for the HC-SR04 sensor", "a riser 25 mm tall for the Raspberry Pi", "a gear with 20 teeth", "zzzz"]) {
    await dialog.getByPlaceholder(/For example/).fill(text);
    await dialog.getByRole("button", { name: "Design it" }).click();
    await page.waitForTimeout(1500);
    const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download STL" }).click()]);
    const stl = await readFile(await dl.path());
    const tris = stl.length > 84 ? stl.readUInt32LE(80) : 0;
    if (stl.length !== 84 + tris * 50 || tris < 12) problems.push(`"${text}": STL is not a valid binary STL (${stl.length} bytes, ${tris} triangles)`);
    notes.push(`"${text.slice(0, 22)}": ${tris} triangles`);
    await broken(`designer after "${text}"`);
  }
  await dialog.getByRole("button", { name: "Get it printed" }).first().click();
  await dialog.getByLabel("Your city and country").fill("Harare, Zimbabwe");
  await dialog.getByRole("button", { name: "Search" }).click();
  await page.waitForTimeout(4000);
  const err = await dialog.locator("p.text-warn").first().textContent().catch(() => "");
  notes.push(err ? `location search: "${err.slice(0, 70)}"` : "location search answered");
  await dialog.getByRole("radio", { name: "Lowest price" }).click();
  const services = await dialog.locator("ul li a[href^='http']").count();
  notes.push(`${services} print services`);
  if (!services) problems.push("no print services listed");
});

const ARM_TASKS = [
  ...["Sort coloured", "Move 350 g cans", "Pour a 300 g", "Draw on A4", "Pick 15 g sweets", "Load a 2 kg"].map((p) => ({ preset: p })),
  { text: "pick up chess pieces and move them on the board" },
  { text: "hand me tools from my workbench, about 500 g each, 50 cm away" },
  { text: "fold laundry" },
  { text: "asdf qwerty" },
  { text: "move 5 kg boxes 1 m away, 6 per minute" },
];

await check("arm advisor: presets, typed tasks and edits", desktop, async ({ page, notes, problems, broken }) => {
  await page.goto(`${base}/arm`);
  for (const t of ARM_TASKS) {
    if (t.preset) await page.getByRole("button", { name: new RegExp(`^${t.preset}`) }).click();
    else {
      await page.getByLabel("Describe the task").fill(t.text);
      await page.getByRole("button", { name: "Size it" }).click();
    }
    await page.getByText("What I understood").waitFor();
    await page.waitForTimeout(600);
    const verdict = await page.locator("section h2").filter({ hasText: /build this|Buy a ready-made/ }).first().textContent();
    const best = await page.getByText("Best fit").locator("xpath=ancestor::div[contains(@class,'rounded-3xl')][1]").locator("p.text-lg").textContent();
    // Every motor option renders.
    const tabs = page.getByRole("tablist", { name: "Motor type" }).getByRole("tab");
    for (let k = 0; k < (await tabs.count()); k++) {
      await tabs.nth(k).click();
      await page.waitForTimeout(150);
      await broken(`${t.preset ?? t.text}, motor tab ${k}`);
    }
    notes.push(`${(t.preset ?? t.text).slice(0, 18)}: ${best} / ${verdict}`);
  }
  // Edits update the plan live.
  const weight = page.getByLabel("Heaviest object", { exact: true });
  await weight.fill("5000");
  await page.waitForTimeout(300);
  if (!(await page.getByText("Buy a ready-made arm for this").count())) problems.push("5 kg didn't change the verdict to buy");
  await weight.fill("20");
  await page.getByLabel("Reach", { exact: true }).fill("20");
  await page.waitForTimeout(300);
  await page.getByRole("radio", { name: "Tilt it" }).click();
  await page.getByText("People work within its reach").click();
  await page.waitForTimeout(300);
  await broken("after edits");
  const links = await page.locator("main a[href^='http']").count();
  notes.push(`${links} links after edits`);
  // Reload keeps the task.
  await page.reload();
  await page.getByText("What I understood").waitFor();
  if ((await page.getByLabel("Heaviest object", { exact: true }).inputValue()) !== "20") problems.push("edits weren't remembered after a reload");
});

await check("arm advisor on a phone", phone, async ({ page, overflow, broken }) => {
  await page.goto(`${base}/arm`);
  await overflow("arm advisor, empty");
  for (const p of ["Move 350 g cans", "Pour a 300 g", "Draw on A4"]) {
    await page.getByRole("button", { name: new RegExp(`^${p}`) }).click();
    await page.getByText("What I understood").waitFor();
    await page.waitForTimeout(500);
    await overflow(`arm advisor, ${p}`);
    await broken(`arm advisor, ${p}`);
  }
});

await check("feedback without a message", desktop, async ({ page, problems }) => {
  await page.goto(`${base}/arm`);
  await page.getByRole("button", { name: "Feedback" }).click();
  if (await page.getByRole("button", { name: "Send" }).isEnabled()) problems.push("Send is enabled with nothing written");
  await page.keyboard.press("Escape");
  if (await page.getByRole("dialog").count()) problems.push("Escape didn't close feedback");
});

await browser.close();
const failed = results.filter((r) => r.problems.length);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
