// Run: npx tsx --test lib/workflow.test.ts
// The whole deterministic rover workflow, for every combination of answers a user can give and
// every part swap the build step offers: recommend, check, swap, wiring, pins, firmware, carrier
// board and the step-by-step guide. Catches dead ends, crashes and broken text ("undefined", "NaN").
import { test } from "node:test";
import assert from "node:assert/strict";
import { PARTS, PARTS_BY_ID, DESIGNS } from "./catalog";
import { checkBuild } from "./compat/checkBuild";
import type { BuildItem, Slot } from "./compat/types";
import { designCarrierBoard, toBomCsv, toKicadNetlist } from "./electronics/board";
import { generateFirmware } from "./electronics/firmware";
import { planPins } from "./electronics/pins";
import { ENVIRONMENTS, EXPERIENCE, USE_CASES, type Answers, requirementsFrom } from "./flow";
import { buildGuide, guideToMarkdown } from "./quickGuide";
import { recommend, type Locks } from "./recommend";
import { trySwap } from "./swap";
import { planWiring } from "./wiring";

const BROKEN = /\bundefined\b|\bNaN\b|\[object Object\]|\bnull\b|Infinity/;
const REQUIRED: Slot[] = ["chassis", "drive_motor", "motor_driver", "battery"];
const slotOf = (i: BuildItem) => PARTS_BY_ID[i.part_id].slot;
const sig = (items: BuildItem[]) => items.map((i) => `${i.part_id}x${i.quantity}`).sort().join(",");

function answerSets(): Answers[] {
  const out: Answers[] = [];
  for (const uc of USE_CASES)
    for (const env of ENVIRONMENTS)
      for (const exp of EXPERIENCE)
        for (const budget of [undefined, 40, Math.round(uc.defaultBudget * 0.6), uc.defaultBudget * 2, 1200])
          out.push({ robotType: "rover", useCase: uc.id, environment: env.id, experience: exp.id, budget });
  return out;
}

/** Everything the later steps derive from a build, checked for crashes and broken text. */
function checkDownstream(items: BuildItem[], answers: Answers, label: string) {
  const wiring = planWiring(items, PARTS_BY_ID);
  const nodeIds = new Set(wiring.nodes.map((n) => n.id));
  for (const w of wiring.wires) {
    assert.ok(nodeIds.has(w.from) && nodeIds.has(w.to), `${label}: wire ${w.n} ${w.from} to ${w.to} has no box`);
    assert.ok(!BROKEN.test(w.label + w.pins + (w.note ?? "")), `${label}: wire text "${w.pins}"`);
    assert.ok(!w.pins.includes("?"), `${label}: wire ${w.n} has an unassigned pin: ${w.pins}`);
  }
  for (const n of wiring.notes) assert.ok(!BROKEN.test(n), `${label}: ${n}`);

  const plan = planPins(items, PARTS_BY_ID);
  if (plan) {
    const pins = plan.rows.map((r) => r.pin);
    assert.equal(new Set(pins).size, pins.length, `${label}: duplicate pins ${pins.join(" ")}`);
    for (const r of plan.rows) assert.ok(!BROKEN.test(r.label + r.pin + r.to), `${label}: pin row ${JSON.stringify(r)}`);
  }
  const fw = generateFirmware(items, PARTS_BY_ID);
  if (fw) assert.ok(!/\bundefined\b|\bNaN\b|=\s*\?|\(\?\)/.test(fw.code), `${label}: firmware has broken values`);
  const board = designCarrierBoard(items, PARTS_BY_ID);
  if (board) {
    for (const net of board.nets) assert.ok(board.components.flatMap((c) => c.pins).filter((p) => p.net === net).length >= 2, `${label}: net ${net} goes nowhere`);
    assert.ok(!BROKEN.test(toKicadNetlist(board) + toBomCsv(board) + board.notes.join(" ")), `${label}: board export`);
  }

  const sections = buildGuide(items, PARTS_BY_ID, answers);
  assert.ok(sections.length >= 3, `${label}: guide has ${sections.length} sections`);
  const inBuild = new Set(items.map(slotOf));
  for (const s of sections) {
    assert.ok(s.steps.length > 0, `${label}: empty section ${s.title}`);
    for (const st of s.steps) {
      assert.ok(st.title.trim() && st.body.trim(), `${label}: blank step in ${s.title}`);
      assert.ok(!BROKEN.test(st.title + st.body), `${label}: "${st.title}": ${st.body}`);
      for (const id of st.parts ?? []) assert.ok(PARTS_BY_ID[id], `${label}: step part ${id}`);
      const v = st.visual;
      if (v?.kind === "assembly") {
        assert.ok(v.highlight.every((h) => inBuild.has(h)), `${label}: "${st.title}" highlights a part not in the build`);
        assert.ok(v.show.some((h) => inBuild.has(h)), `${label}: "${st.title}" shows nothing`);
      }
      if (v?.kind === "wire") assert.ok(wiring.wires.some((w) => w.n === v.n), `${label}: "${st.title}" points at missing wire ${v.n}`);
      if (v?.kind === "parts") assert.ok(v.ids.length > 0 && v.ids.every((id) => PARTS_BY_ID[id]), `${label}: parts visual`);
      if (v?.kind === "code") assert.ok(v.code.length > 50, `${label}: empty code`);
    }
  }
  assert.ok(!BROKEN.test(guideToMarkdown("Build guide", sections)), `${label}: markdown export`);
}

const recs = new Map<string, { answers: Answers; items: BuildItem[] }>();
const noBuild: string[] = [];
const overBudget: string[] = [];

test("every answer combination gets a compatible build, or a clear 'no build at this budget'", () => {
  for (const a of answerSets()) {
    const label = `${a.useCase}/${a.environment}/${a.experience}/$${a.budget ?? "default"}`;
    const rec = recommend(PARTS, a);
    if (!rec) {
      noBuild.push(label);
      // Only allowed below the default budget: at the suggested budget there must always be a build.
      assert.ok(a.budget !== undefined && a.budget < (USE_CASES.find((u) => u.id === a.useCase)!.defaultBudget), `no build for ${label}`);
      continue;
    }
    assert.equal(rec.report.ok, true, `${label}: ${JSON.stringify(rec.report.issues.filter((i) => i.severity === "error"))}`);
    const slots = rec.items.map(slotOf);
    for (const s of REQUIRED) assert.ok(slots.includes(s), `${label}: no ${s}`);
    assert.ok(slots.includes("controller") || slots.includes("compute"), `${label}: no brain`);
    assert.equal(new Set(slots).size, slots.length, `${label}: two parts in one slot`);
    const uc = USE_CASES.find((u) => u.id === a.useCase)!;
    for (const s of Object.keys(uc.sensors) as Slot[]) assert.ok(slots.includes(s), `${label}: the job needs a ${s}`);
    if (uc.needsCompute) assert.ok(slots.includes("compute"), `${label}: the job needs a computer`);
    if (rec.report.totals.price_usd_approx > requirementsFrom(a).budget_usd!) overBudget.push(`${label} ($${Math.round(rec.report.totals.price_usd_approx)})`);
    for (const i of rec.items) assert.ok(i.quantity >= 1 && Number.isInteger(i.quantity), `${label}: quantity ${i.quantity}`);
    const re = checkBuild(rec.items, PARTS_BY_ID, requirementsFrom(a));
    assert.equal(re.ok, true, `${label}: recheck failed`);
    recs.set(sig(rec.items) + "|" + a.useCase + a.experience, { answers: a, items: rec.items });
  }
  console.log(`  over budget (shown as a warning): ${overBudget.length}, e.g. ${overBudget.slice(0, 4).join(", ")}`);
  console.log(`  ${answerSets().length} answer sets, ${recs.size} distinct builds, ${noBuild.length} with no build: ${noBuild.join(" ")}`);
});

test("wiring, pins, code, board and guide work for every recommended build", () => {
  for (const [k, { answers, items }] of recs) checkDownstream(items, answers, k);
});

test("every swap the build step offers either fits or says why, and nothing downstream breaks", () => {
  let total = 0;
  let fits = 0;
  const seen = new Set<string>();
  const broken: string[] = [];
  // One build per use case and experience at the default budget keeps this to a few thousand swaps.
  const bases = [...recs.values()];
  for (const { answers, items } of bases) {
    for (const slot of [...new Set(PARTS.map((p) => p.slot))]) {
      const current = items.find((i) => slotOf(i) === slot)?.part_id;
      for (const p of PARTS.filter((x) => x.slot === slot && x.id !== current)) {
        const key = sig(items) + slot + p.id;
        if (seen.has(key)) continue;
        seen.add(key);
        total++;
        const r = trySwap(PARTS, answers, items, slot, p.id);
        const label = `${answers.useCase}/${answers.environment}/${answers.experience}: ${slot} to ${p.id}`;
        assert.ok(r.items.some((i) => i.part_id === p.id), `${label}: swapped part missing`);
        const slots = r.items.map(slotOf);
        assert.equal(new Set(slots).size, slots.length, `${label}: two parts in one slot`);
        for (const s of REQUIRED) assert.ok(slots.includes(s), `${label}: lost the ${s}`);
        if (r.report.ok) fits++;
        else {
          const errs = r.report.issues.filter((i) => i.severity === "error");
          assert.ok(errs.length > 0 && errs.every((e) => e.message.length > 10 && !BROKEN.test(e.message)), `${label}: not ok but no readable reason`);
        }
        try {
          checkDownstream(r.items, answers, label);
        } catch (e) {
          broken.push((e as Error).message.split("\n")[0]);
        }
      }
      // Removing an optional part.
      if (current && !REQUIRED.includes(slot)) {
        const r = trySwap(PARTS, answers, items, slot, null);
        assert.ok(!r.items.some((i) => i.part_id === current));
        try {
          checkDownstream(r.items, answers, `remove ${slot}`);
        } catch (e) {
          broken.push((e as Error).message.split("\n")[0]);
        }
      }
    }
  }
  console.log(`  ${total} swaps from ${bases.length} builds: ${fits} fit (${Math.round((fits / total) * 100)}%), ${total - fits} need other changes`);
  assert.deepEqual([...new Set(broken)].slice(0, 15), []);
});

test("chains of swaps (a user clicking around) never corrupt the build", () => {
  let seed = 7;
  const rand = (n: number) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const slots = [...new Set(PARTS.map((p) => p.slot))];
  let steps = 0;
  for (const { answers, items: start } of recs.values()) {
    let items = start;
    for (let k = 0; k < 6; k++) {
      const slot = slots[rand(slots.length)];
      const options = PARTS.filter((p) => p.slot === slot);
      const pick = rand(options.length + 1);
      const current = items.find((i) => slotOf(i) === slot);
      if (pick === options.length && (!current || REQUIRED.includes(slot))) continue;
      const partId = pick === options.length ? null : options[pick].id;
      const r = trySwap(PARTS, answers, items, slot, partId);
      if (partId) assert.ok(r.items.some((i) => i.part_id === partId), `${slot} to ${partId} dropped`);
      const ss = r.items.map(slotOf);
      assert.equal(new Set(ss).size, ss.length, "two parts in one slot");
      for (const s of REQUIRED) assert.ok(ss.includes(s), `lost the ${s}`);
      items = r.items;
      steps++;
    }
    checkDownstream(items, answers, `after clicking around from ${sig(start)}`);
  }
  console.log(`  ${steps} chained swaps`);
});

test("every reference design can be used as a starting point for its use cases", () => {
  const dropOrder: Slot[] = ["battery", "regulator", "motor_driver", "controller", "compute", "distance_sensor", "camera", "lidar", "imu", "wheels", "caster", "drive_motor", "chassis"];
  for (const d of DESIGNS) {
    for (const uc of USE_CASES) {
      const a: Answers = { robotType: "rover", useCase: uc.id, environment: "indoor_flat", experience: "some" };
      const locks: Locks = {};
      for (const id of d.similar_part_ids) {
        const p = PARTS_BY_ID[id];
        assert.ok(p, `${d.id} lists unknown part ${id}`);
        if (!locks[p.slot]) locks[p.slot] = id;
      }
      let rec = recommend(PARTS, a, locks);
      for (const s of dropOrder) {
        if (rec) break;
        if (locks[s]) {
          delete locks[s];
          rec = recommend(PARTS, a, locks);
        }
      }
      rec ??= recommend(PARTS, a);
      assert.ok(rec && rec.report.ok, `${d.id} for ${uc.id}: no build`);
      checkDownstream(rec.items, a, `${d.id} for ${uc.id}`);
    }
  }
});
