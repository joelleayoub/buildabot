// Run: npx tsx --test lib/rateLimit.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLimit, resetMemoryLimits, visitorOf } from "./rateLimit";

const req = (ip: string) => new Request("http://x/api/chat", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

test("each visitor gets a number of calls per hour, then a friendly 429", async () => {
  resetMemoryLimits();
  process.env.AI_LIMIT_GUIDE = "3";
  const t = 1_000_000_000_000;
  for (let i = 0; i < 3; i++) assert.equal((await checkLimit(req("1.1.1.1"), "guide", t + i)).ok, true);
  const blocked = await checkLimit(req("1.1.1.1"), "guide", t + 10);
  assert.equal(blocked.ok, false);
  assert.match(blocked.body!.message, /try again/);
  // Another visitor and another route are counted separately.
  assert.equal((await checkLimit(req("2.2.2.2"), "guide", t + 11)).ok, true);
  assert.equal((await checkLimit(req("1.1.1.1"), "chat", t + 12)).ok, true);
  // An hour later it's allowed again.
  assert.equal((await checkLimit(req("1.1.1.1"), "guide", t + 3600_001)).ok, true);
  delete process.env.AI_LIMIT_GUIDE;
});

test("everyone together has a daily cap", async () => {
  resetMemoryLimits();
  process.env.AI_DAILY_LIMIT = "5";
  const t = 2_000_000_000_000;
  for (let i = 0; i < 5; i++) assert.equal((await checkLimit(req(`9.9.9.${i}`), "chat", t + i)).ok, true);
  const r = await checkLimit(req("8.8.8.8"), "chat", t + 6);
  assert.equal(r.ok, false);
  assert.equal(r.body!.error, "daily_limit");
  delete process.env.AI_DAILY_LIMIT;
});

test("visitors are hashed, never stored as IPs", () => {
  const v = visitorOf(req("203.0.113.7"));
  assert.match(v, /^[0-9a-f]{24}$/);
  assert.ok(!v.includes("203"));
});
