// Run: npx tsx --test lib/recommend.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PARTS } from "./catalog";
import { ENVIRONMENTS, EXPERIENCE, USE_CASES, type Answers } from "./flow";
import { recommend } from "./recommend";
import { trySwap } from "./swap";

test("every use case, floor type and experience level gets a compatible build", () => {
  for (const uc of USE_CASES)
    for (const env of ENVIRONMENTS)
      for (const ex of EXPERIENCE) {
        const answers: Answers = { robotType: "rover", useCase: uc.id, environment: env.id, experience: ex.id };
        const rec = recommend(PARTS, answers);
        assert.ok(rec, `${uc.id}/${env.id}/${ex.id}: no build`);
        assert.equal(rec.report.ok, true, `${uc.id}/${env.id}/${ex.id}: ${JSON.stringify(rec.report.issues)}`);
        assert.ok(rec.items.every((i) => i.reason), "every part has a reason");
      }
});

test("swapping the chassis re-plans dependent parts and stays compatible", () => {
  const answers: Answers = { robotType: "rover", useCase: "map", environment: "indoor_flat", experience: "first" };
  const rec = recommend(PARTS, answers)!;
  for (const chassis of PARTS.filter((p) => p.slot === "chassis")) {
    const r = trySwap(PARTS, answers, rec.items, "chassis", chassis.id);
    assert.equal(r.report.ok, true, `${chassis.id}: ${JSON.stringify(r.report.issues.filter((i) => i.severity === "error"))}`);
  }
});

test("print providers sort by distance and by price tier", async () => {
  const { rankProviders, parseOverpass, km } = await import("./print");
  const harare = { name: "Harare", lat: -17.83, lon: 31.05 };
  const paris = { name: "Paris", lat: 48.86, lon: 2.35 };
  const nearParis = rankProviders(paris, "nearest").filter((p) => p.distanceKm !== null);
  assert.equal(nearParis[0].id, "sculpteo");
  const cheap = rankProviders(harare, "cheapest");
  assert.equal(cheap[0].price_tier, 1);
  assert.ok(Math.abs(km(harare, paris) - 7940) < 50);
  const spaces = parseOverpass(
    { elements: [{ type: "node", lat: -17.8, lon: 31.04, tags: { name: "Harare Makerspace", leisure: "hackerspace", hackerspace: "makerspace" } }, { type: "way", center: { lat: -17.9, lon: 31.1 }, tags: { name: "Fab Lab Test" } }, { type: "node", lat: 0, lon: 0, tags: {} }] },
    harare,
  );
  assert.deepEqual(spaces.map((s) => s.kind), ["Makerspace", "Fab lab"]);
});
