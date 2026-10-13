// Run: npx tsx --test lib/copy.test.ts
// House style: no em dashes anywhere in the product (UI copy, prompts, data, comments, docs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const EM_DASH = String.fromCharCode(0x2014);

function files(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return files(path);
    return /\.(tsx?|mjs|json|md|sql|css)$/.test(e.name) ? [path] : [];
  });
}

test("no em dashes in source, data or docs", () => {
  const scanned = [...["app", "components", "lib", "data", "scripts", "supabase", "docs"].flatMap(files), "CLAUDE.md", "README.md"];
  const offenders = scanned.filter((f) => readFileSync(join(root, f), "utf8").includes(EM_DASH));
  assert.deepEqual(offenders, []);
});
