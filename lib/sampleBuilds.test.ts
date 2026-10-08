// Run: npx tsx --test lib/sampleBuilds.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBuild } from "./compat/checkBuild";
import type { Part } from "./compat/types";
import { SAMPLE_BUILDS } from "./sampleBuilds";

const parts: Part[] = JSON.parse(readFileSync(join(__dirname, "../data/parts.json"), "utf8"));
const byId = Object.fromEntries(parts.map((p) => [p.id, p]));
const designs: { id: string }[] = JSON.parse(readFileSync(join(__dirname, "../data/reference_designs.json"), "utf8"));

for (const sample of SAMPLE_BUILDS) {
  test(`sample build "${sample.id}" passes the checker`, () => {
    const r = checkBuild(sample.items, byId, sample.requirements);
    assert.equal(r.ok, true, JSON.stringify(r.issues, null, 2));
    assert.ok(designs.some((d) => d.id === sample.reference_design_id), sample.reference_design_id);
    for (const i of sample.items) assert.ok(i.reason, `${i.part_id} needs a reason`);
  });
}
