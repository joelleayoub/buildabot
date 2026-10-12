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
