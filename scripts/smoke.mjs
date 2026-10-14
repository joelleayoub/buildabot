// End-to-end check of the "definition of done": a stranger opens the link, picks a rover and a use
// case, gets a build, swaps a part, goes through wiring and cart, and downloads the build guide.
// Fails on any page error, failed request or console error, and reports how long each step took.
// Usage: `node scripts/smoke.mjs [http://localhost:3000]` (also works against the deployed URL).
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
// FEEDBACK=1 also sends a test message through the Feedback button.
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => m.type() === "error" && !/WebGL|GPU stall|THREE\.WebGLRenderer/.test(m.text()) && problems.push(`console error: ${m.text()}`));
page.on("response", (r) => r.status() >= 500 && problems.push(`HTTP ${r.status()} ${r.url()}`));

const t0 = Date.now();
let last = t0;
const lap = (name) => {
  const now = Date.now();
  console.log(`ok  ${name.padEnd(34)} ${((now - last) / 1000).toFixed(1)} s`);
  last = now;
};
const click = (role, name) => page.getByRole(role, { name }).first().click({ timeout: 20000 });

try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByText("Start with a rover").click({ timeout: 20000 });
  lap("pick a rover");

  await page.getByText("Wander and avoid obstacles").first().click({ timeout: 20000 });
  await click("button", "See starting points");
  lap("pick a use case");

  await click("button", "Start from this build");
  await page.getByText("Choose your chassis").waitFor({ timeout: 20000 });
  lap("get a recommended build");

  const before = await page.locator("text=/^\\$\\d+$/").first().textContent();
  await click("button", "Swap in");
  await page.waitForTimeout(1500);
  const after = await page.locator("text=/^\\$\\d+$/").first().textContent();
  if (before === after) problems.push(`swapping a part didn't change the total (${before})`);
  lap(`swap a part (${before} to ${after})`);

  await click("button", "Next: wiring");
  await page.getByText("How it all connects").waitFor();
  for (const tab of ["Pin map and code", "Custom PCB", "Wiring diagram"]) await click("tab", tab);
  lap("wiring, pin map and PCB tabs");

  await click("button", "Next: cart");
  const links = await page.locator('a[href^="http"]').count();
  if (links === 0) problems.push("cart has no retailer links");
  lap(`cart (${links} retailer links)`);

  await click("button", "Get the build guide");
  await page.getByRole("heading", { name: "Build it, step by step" }).waitFor();
  for (let i = 0; i < 5; i++) await click("button", /Next step/);
  lap("picture guide, 5 steps");

  await click("tab", "Checklist");
  const [download] = await Promise.all([page.waitForEvent("download"), click("button", "Download checklist")]);
  const file = await download.path();
  if (!file) problems.push("checklist download failed");
  lap(`download the guide (${download.suggestedFilename()})`);

  if (process.env.FEEDBACK) {
    await click("button", "Feedback");
    await page.getByRole("radio", { name: "4" }).click();
    await page.getByLabel("What happened?").fill("Smoke test message, please ignore.");
    await click("button", "Send");
    await page.getByText("Thank you!").waitFor();
    lap("send feedback");
  }
} catch (e) {
  problems.push(`step failed: ${e.message.split("\n")[0]}`);
  await page.screenshot({ path: "smoke-failure.png" }).catch(() => {});
}

await browser.close();
const total = (Date.now() - t0) / 1000;
console.log(`\nTotal ${total.toFixed(0)} s (a real user has 10 minutes).`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("No errors.");
