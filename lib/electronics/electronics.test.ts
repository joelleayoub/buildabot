// Run: npx tsx --test lib/electronics/electronics.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PARTS, PARTS_BY_ID } from "../catalog";
import type { BuildItem } from "../compat/types";
import { designCarrierBoard, toBomCsv, toKicadNetlist } from "./board";
import { generateFirmware, generatePhoneDrive } from "./firmware";
import { planPins } from "./pins";

const ids = (slot: string) => PARTS.filter((p) => p.slot === slot).map((p) => p.id);

/** Every controller x driver, with and without encoders, a regulator and each kind of sensor. */
function combos(): BuildItem[][] {
  const out: BuildItem[][] = [];
  for (const ctrl of [...ids("controller"), "compute-rpi5-8gb"])
    for (const drv of ids("motor_driver"))
      for (const sensors of [["dist-hc-sr04"], ["dist-vl53l1x", "imu-bno085"], []])
        for (const motor of ["motor-jgb37-520-12v-encoder", "motor-tt-basic"])
          for (const reg of [["reg-pololu-d36v50f5"], []])
            out.push([ctrl, drv, motor, "batt-3s-liion-18650-bms", "chassis-2wd-37d-plate", ...reg, ...sensors].map((part_id) => ({ part_id, quantity: 1 })));
  return out;
}

const ARDUINO_STUB = `#include <cstdlib>
#define HIGH 1
#define LOW 0
#define INPUT 0
#define OUTPUT 1
#define INPUT_PULLUP 2
#define RISING 3
#define constrain(x, a, b) ((x) < (a) ? (a) : ((x) > (b) ? (b) : (x)))
enum { A0 = 14, A1, A2, A3, A4, A5 };
void pinMode(int, int) {}
void digitalWrite(int, int) {}
int digitalRead(int) { return 0; }
void analogWrite(int, int) {}
void delay(unsigned long) {}
void delayMicroseconds(unsigned int) {}
long pulseIn(int, int, unsigned long) { return 0; }
int digitalPinToInterrupt(int p) { return p; }
void attachInterrupt(int, void (*)(), int) {}
struct SerialT { void begin(long) {} template <class T> void print(T) {} template <class T> void println(T) {} } Serial;
`;

test("pins are never assigned twice and every signal gets a pin", () => {
  for (const items of combos()) {
    const plan = planPins(items, PARTS_BY_ID)!;
    assert.ok(plan, items.map((i) => i.part_id).join(","));
    const pins = plan.rows.map((r) => r.pin);
    assert.equal(new Set(pins).size, pins.length, `duplicate pin: ${pins.join(" ")}`);
    assert.ok(!pins.includes("?"), `ran out of pins: ${plan.warnings.join(" ")}`);
  }
});

test("generated sketches compile and generated Python parses", () => {
  const dir = mkdtempSync(join(tmpdir(), "bab-fw-"));
  writeFileSync(join(dir, "Arduino.h"), ARDUINO_STUB);
  let n = 0;
  for (const items of combos()) {
    const fw = generateFirmware(items, PARTS_BY_ID)!;
    assert.ok(fw, items.map((i) => i.part_id).join(","));
    const f = join(dir, `t${n++}.${fw.language === "cpp" ? "cpp" : "py"}`);
    if (fw.language === "cpp") {
      writeFileSync(f, `#include "Arduino.h"\n${fw.code}\nint main() { setup(); loop(); }\n`);
      execFileSync("g++", ["-std=c++17", "-fsyntax-only", "-Wall", "-Werror", "-Wno-unused-variable", "-Wno-unused-function", f], { stdio: "pipe" });
    } else {
      writeFileSync(f, fw.code);
      execFileSync("python3", ["-c", `import ast,sys; ast.parse(open(sys.argv[1]).read())`, f], { stdio: "pipe" });
    }
  }
  assert.ok(n > 30);
});

const WIFI_STUB = `#include <string>
#include <functional>
struct String {
  std::string s;
  String(const char* c = "") : s(c) {}
  String(int v) : s(std::to_string(v)) {}
  String operator+(const String& o) const { String r; r.s = s + o.s; return r; }
  String operator+(const char* o) const { String r; r.s = s + o; return r; }
  long toInt() const { return std::atol(s.c_str()); }
};
struct IPAddress {};
struct WiFiClass { bool softAP(const char*, const char*) { return true; } IPAddress softAPIP() { return {}; } } WiFi;
struct WebServer {
  WebServer(int) {}
  void on(const char*, std::function<void()>) {}
  void begin() {}
  void handleClient() {}
  String arg(const char*) { return String("0"); }
  void send(int, const char*, const char*) {}
  void send(int, const char*, const String&) {}
};
unsigned long millis() { return 0; }
template <class T> T abs(T v) { return v < 0 ? -v : v; }
`;

test("phone driving sketches compile for every ESP32 build", () => {
  const dir = mkdtempSync(join(tmpdir(), "bab-phone-"));
  writeFileSync(join(dir, "Arduino.h"), ARDUINO_STUB.replace("struct SerialT {", "struct IPAddress;\nstruct SerialT {") + "\n");
  writeFileSync(join(dir, "WiFi.h"), "");
  writeFileSync(join(dir, "WebServer.h"), "");
  let n = 0;
  for (const items of combos()) {
    const fw = generatePhoneDrive(items, PARTS_BY_ID);
    const esp = items.some((i) => i.part_id === "ctrl-esp32-devkitc");
    assert.equal(!!fw, esp, items.map((i) => i.part_id).join(","));
    if (!fw) continue;
    assert.match(fw.code, /WiFi\.softAP/);
    assert.match(fw.code, /millis\(\) - lastCommand > 500/, "stops when the phone goes quiet");
    const f = join(dir, `p${n++}.cpp`);
    writeFileSync(f, `#include "Arduino.h"\n${WIFI_STUB}\n${fw.code.replace(/#include <WiFi.h>|#include <WebServer.h>/g, "")}\nint main() { setup(); loop(); }\n`);
    execFileSync("g++", ["-std=c++17", "-fsyntax-only", "-Wall", "-Werror", "-Wno-unused-variable", "-Wno-unused-function", f], { stdio: "pipe" });
  }
  assert.ok(n > 5);
});

test("carrier board nets connect at least two pins and the netlist is well formed", () => {
  for (const items of combos()) {
    const b = designCarrierBoard(items, PARTS_BY_ID)!;
    for (const net of b.nets) {
      const nodes = b.components.flatMap((c) => c.pins.filter((p) => p.net === net));
      assert.ok(nodes.length >= 2, `net ${net} has one pin`);
    }
    const nl = toKicadNetlist(b);
    let depth = 0;
    for (const ch of nl.replace(/"(?:[^"\\]|\\.)*"/g, "")) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      assert.ok(depth >= 0);
    }
    assert.equal(depth, 0);
    assert.ok(toBomCsv(b).split("\n").length > b.components.length);
    // refs are unique
    assert.equal(new Set(b.components.map((c) => c.ref)).size, b.components.length);
  }
});

test("5 V ultrasonic on a 3.3 V controller gets a level-shifting divider on the board", () => {
  const items = ["ctrl-pico-2", "driver-cytron-mdd3a", "motor-tt-encoder", "batt-aa-nimh-6x", "reg-lm2596-3a", "dist-hc-sr04"].map((part_id) => ({ part_id, quantity: 1 }));
  const b = designCarrierBoard(items, PARTS_BY_ID)!;
  assert.ok(b.components.some((c) => c.ref === "R2") && b.components.some((c) => c.ref === "R3"));
  const uno = designCarrierBoard(items.map((i) => (i.part_id === "ctrl-pico-2" ? { ...i, part_id: "ctrl-arduino-uno-r4-minima" } : i)), PARTS_BY_ID)!;
  assert.ok(!uno.components.some((c) => c.ref === "R2"));
});
