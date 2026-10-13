// Run: npx tsx --test lib/shops.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PARTS } from "./catalog";
import { EXTRAS } from "./extras";
import { parseShops } from "./print";
import { COUNTRIES, defaultShopFor, linkFor, RETAILERS, RETAILERS_BY_ID, searchTerm, shopsFor, shopsForPart } from "./shops";

test("retailer data is well formed", () => {
  assert.equal(new Set(RETAILERS.map((r) => r.id)).size, RETAILERS.length);
  const codes = new Set(COUNTRIES.map((c) => c.code));
  assert.equal(codes.size, COUNTRIES.length);
  for (const r of RETAILERS) {
    assert.match(r.home, /^https:\/\/[^/]+\//, r.id);
    if (r.search) assert.match(r.search, /^https:\/\/.*\{q(-dash)?\}/, r.id);
    assert.ok(r.sells_to.length > 0 && r.note.length > 10, r.id);
    for (const c of [...r.local, ...r.sells_to.filter((x) => x !== "*")]) assert.match(c, /^[A-Z]{2}$/, `${r.id}: ${c}`);
    if (r.kind === "finder") assert.ok(r.brands.length > 0, r.id);
  }
});

test("every country gets shops that deliver, in order: local, nearby, worldwide", () => {
  const order = { local: 0, nearby: 1, worldwide: 2, official: 3 };
  for (const c of COUNTRIES) {
    const s = shopsFor(c.code);
    assert.equal(new Set(s.map((x) => x.id)).size, s.length, c.code);
    for (let i = 1; i < s.length; i++) assert.ok(order[s[i - 1].tier] <= order[s[i].tier], `${c.code}: tiers out of order`);
    assert.ok(s.some((x) => x.tier === "worldwide" || x.tier === "local"), c.code);
    for (const x of s.filter((y) => y.tier === "local" || y.tier === "nearby")) assert.ok(x.sells_to.includes("*") || x.sells_to.includes(c.code), `${c.code}: ${x.id} doesn't sell there`);
  }
  // Zimbabwe: South African shops that may deliver, labelled honestly.
  const zw = shopsFor("ZW").filter((x) => x.tier === "nearby");
  assert.ok(zw.some((x) => x.id === "pishop-za"));
  assert.ok(zw.every((x) => /ask whether they deliver to Zimbabwe/.test(x.label)));
  assert.ok(shopsFor("GB").some((x) => x.id === "thepihut" && x.tier === "local"));
});

test("every part and supply has working shop links in every country", () => {
  for (const cc of [undefined, ...COUNTRIES.map((c) => c.code)]) {
    for (const p of PARTS) {
      const options = shopsForPart(p, cc);
      assert.ok(options.length >= 2, `${cc}: ${p.id} has ${options.length} shops`);
      for (const o of options) {
        assert.match(o.link.url, /^https:\/\//);
        assert.ok(!/\{q/.test(o.link.url), o.link.url);
        if (o.slots) assert.ok(o.slots.includes(p.slot), `${o.id} doesn't stock ${p.slot}`);
      }
      const d = defaultShopFor(p, cc);
      assert.ok(d === "original" || RETAILERS_BY_ID[d], `${cc}: ${p.id} default ${d}`);
    }
    for (const e of EXTRAS.filter((x) => x.price_usd_approx > 0)) {
      const carries = e.kind === "tool" ? "tools" : "supplies";
      assert.ok(shopsForPart({ name: e.name, brand: "Generic", buy_url: e.buy_url }, cc, carries).length >= 2, `${cc}: ${e.id}`);
    }
  }
});

test("search terms and links", () => {
  assert.equal(searchTerm("TB6612FNG dual motor driver carrier", "Pololu"), "Pololu TB6612FNG dual motor driver carrier");
  assert.equal(searchTerm("6× AA NiMH holder + cells (7.2 V, 2000 mAh)", "Generic"), "6× AA NiMH holder + cells");
  assert.equal(linkFor(RETAILERS_BY_ID["mercadolibre-ar"], "Raspberry Pi 5 (8 GB)").url, "https://listado.mercadolibre.com.ar/raspberry-pi-5-8-gb");
  assert.equal(linkFor(RETAILERS_BY_ID.aliexpress, "M3 standoff kit").url, "https://www.aliexpress.com/wholesale?SearchText=M3%20standoff%20kit");
  const home = linkFor(RETAILERS_BY_ID["pishop-za"], "Raspberry Pi 5");
  assert.equal(home.direct, false);
  assert.equal(home.url, "https://www.pishop.co.za/");
});

test("nearby shops from OpenStreetMap keep only useful kinds, components first", () => {
  const from = { name: "Harare", lat: -17.83, lon: 31.05 };
  const shops = parseShops(
    {
      elements: [
        { type: "node", id: 1, lat: -17.84, lon: 31.06, tags: { shop: "hardware", name: "Bolt and Nut" } },
        { type: "node", id: 2, lat: -17.9, lon: 31.1, tags: { shop: "radiotechnics", name: "Parts Hub", website: "https://example.org" } },
        { type: "way", id: 3, center: { lat: -17.83, lon: 31.05 }, tags: { shop: "bakery", name: "Bread" } },
        { type: "node", id: 4, lat: -17.83, lon: 31.05, tags: { shop: "electronics" } },
      ],
    },
    from,
  );
  assert.deepEqual(shops.map((s) => s.name), ["Parts Hub", "Bolt and Nut"]);
  assert.equal(shops[1].osm, "https://www.openstreetmap.org/node/1");
});
