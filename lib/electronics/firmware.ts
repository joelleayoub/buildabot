// Starter code that matches the build's pin plan: wheel test, encoders and the distance sensor.
// Arduino-style C++ for microcontrollers, Python (gpiozero) when a Raspberry Pi drives the motors.
import type { BuildItem, Part } from "../compat/types";
import { planPins, type PinPlan, type PinRow } from "./pins";

export interface Firmware {
  filename: string;
  language: "cpp" | "python";
  code: string;
  /** How to get it onto the board, in plain steps. */
  howTo: string[];
}

const BOARD_SETUP: Record<string, string[]> = {
  arduino_uno_r4: ["Install the Arduino IDE.", "In Boards Manager install 'Arduino UNO R4 Boards', then pick 'Arduino UNO R4 Minima'."],
  esp32: ["Install the Arduino IDE.", "In Boards Manager install 'esp32 by Espressif Systems' (version 3 or newer), then pick 'ESP32 Dev Module'."],
  pico: ["Install the Arduino IDE.", "Add the Raspberry Pi Pico core by Earle Philhower (Boards Manager URL from its GitHub page), then pick 'Raspberry Pi Pico 2'."],
  teensy41: ["Install the Arduino IDE.", "Add Teensyduino (Boards Manager URL from pjrc.com), then pick 'Teensy 4.1'."],
};

/** "D5" -> 5, "A2" -> A2, "GPIO25" -> 25, "GP2" -> 2, "GPIO12 (header pin 32)" -> 12. */
export function codePin(pin: string): string {
  const s = pin.split(" ")[0];
  if (/^A\d+$/.test(s)) return s;
  const m = s.match(/(\d+)$/);
  return m ? m[1] : s;
}

const row = (plan: PinPlan, signal: string) => plan.rows.find((r) => r.signal === signal);

function speedCap(parts: Part[]): { cap: number; why?: string } {
  const motor = parts.find((p) => p.slot === "drive_motor");
  const battery = parts.find((p) => p.slot === "battery");
  const vMax = battery?.compat.battery_max_v;
  const vMotor = motor?.compat.nominal_v;
  if (vMax && vMotor && vMax > vMotor * 1.2) {
    const pct = vMotor / vMax;
    return { cap: Math.round(255 * pct), why: `The battery (${vMax} V full) is above the motors' ${vMotor} V rating, so speed is capped at ${Math.round(pct * 100)}%.` };
  }
  return { cap: 255 };
}

const pinDefs = (plan: PinPlan) =>
  plan.rows.filter((r) => r.kind !== "i2c" && r.kind !== "uart").map((r: PinRow) => `const int ${r.signal.padEnd(10)} = ${codePin(r.pin)};${" ".repeat(Math.max(1, 6 - codePin(r.pin).length))}// ${r.label} -> ${r.to}`);

const outputPins = (plan: PinPlan) => plan.rows.filter((r) => r.kind === "pwm" || (r.kind === "digital" && r.signal !== "SONAR_ECHO")).map((r) => `  pinMode(${r.signal}, OUTPUT);`);

function setMotorCode(plan: PinPlan): string {
  return plan.driverStyle === "dual_pwm"
    ? `void setMotor(bool left, int speed) {
  speed = constrain(speed, -MAX_SPEED, MAX_SPEED);
  int a = left ? LEFT_A : RIGHT_A;
  int b = left ? LEFT_B : RIGHT_B;
  analogWrite(a, speed > 0 ? speed : 0);
  analogWrite(b, speed < 0 ? -speed : 0);
}`
    : plan.driverStyle === "pwm_dir"
      ? `void setMotor(bool left, int speed) {
  speed = constrain(speed, -MAX_SPEED, MAX_SPEED);
  digitalWrite(left ? LEFT_DIR : RIGHT_DIR, speed >= 0 ? HIGH : LOW);
  analogWrite(left ? LEFT_PWM : RIGHT_PWM, abs(speed));
}`
      : `void setMotor(bool left, int speed) {
  speed = constrain(speed, -MAX_SPEED, MAX_SPEED);
  digitalWrite(left ? LEFT_IN1 : RIGHT_IN1, speed > 0 ? HIGH : LOW);
  digitalWrite(left ? LEFT_IN2 : RIGHT_IN2, speed < 0 ? HIGH : LOW);
  analogWrite(left ? LEFT_PWM : RIGHT_PWM, abs(speed));
}`;
}

function cpp(plan: PinPlan, parts: Part[]): string {
  const has = (s: string) => !!row(plan, s);
  const defs = pinDefs(plan);
  const { cap, why } = speedCap(parts);
  const enc = has("ENC_L_A");
  const sonar = has("SONAR_TRIG");
  const i2c = plan.rows.some((r) => r.kind === "i2c");
  const driver = parts.find((p) => p.slot === "motor_driver");

  const setMotor = setMotorCode(plan);

  const outPins = outputPins(plan);

  return `// buildabot starter code
// Controller: ${plan.hostName}. Motor driver: ${driver?.name ?? "none"}.
// 1. Lift the robot so the wheels are off the table: they will spin.
// 2. Upload, then open the Serial Monitor at 115200 baud.
// 3. Each wheel should spin forward, then backward. If one runs the wrong way, swap its two motor wires.
${why ? `// ${why}\n` : ""}${i2c ? "// I2C sensors are on the board's default SDA/SCL pins; see the pin map for which ones.\n" : ""}
#if defined(ESP32)
#define ISR_ATTR IRAM_ATTR
#else
#define ISR_ATTR
#endif

// Pins, matching the pin map in buildabot
${defs.join("\n")}

const int MAX_SPEED = ${cap};        // 0 to 255
const bool AVOID_OBSTACLES = false; // set to true once the wheel test works${sonar ? "" : " (needs a distance sensor)"}
${enc ? `
volatile long leftTicks = 0;
volatile long rightTicks = 0;
void ISR_ATTR onLeftEncoder() { leftTicks += digitalRead(ENC_L_B) ? -1 : 1; }
void ISR_ATTR onRightEncoder() { rightTicks += digitalRead(ENC_R_B) ? 1 : -1; }
` : ""}
// speed: -MAX_SPEED (full reverse) to MAX_SPEED (full forward)
${setMotor}

void drive(int left, int right, int ms) {
  setMotor(true, left);
  setMotor(false, right);
  delay(ms);
}
${sonar ? `
float distanceCm() {
  digitalWrite(SONAR_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(SONAR_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(SONAR_TRIG, LOW);
  long us = pulseIn(SONAR_ECHO, HIGH, 30000); // 0 if nothing within about 5 m
  return us ? us / 58.0 : -1;
}
` : ""}
void setup() {
  Serial.begin(115200);
${outPins.join("\n")}
${sonar ? "  pinMode(SONAR_ECHO, INPUT);\n" : ""}${enc ? `  pinMode(ENC_L_A, INPUT_PULLUP);
  pinMode(ENC_L_B, INPUT_PULLUP);
  pinMode(ENC_R_A, INPUT_PULLUP);
  pinMode(ENC_R_B, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(ENC_L_A), onLeftEncoder, RISING);
  attachInterrupt(digitalPinToInterrupt(ENC_R_A), onRightEncoder, RISING);
` : ""}  drive(0, 0, 500);
  Serial.println("buildabot: ready");
}

void loop() {
  if (AVOID_OBSTACLES) {
${sonar ? `    float d = distanceCm();
    if (d > 0 && d < 25) {
      drive(-MAX_SPEED / 2, -MAX_SPEED / 2, 400); // back up
      drive(MAX_SPEED / 2, -MAX_SPEED / 2, 350);  // turn
    } else {
      drive(MAX_SPEED / 2, MAX_SPEED / 2, 50);
    }
    return;` : "    return;"}
  }

  Serial.println("forward");
  drive(MAX_SPEED / 2, MAX_SPEED / 2, 1000);
  drive(0, 0, 500);
  Serial.println("backward");
  drive(-MAX_SPEED / 2, -MAX_SPEED / 2, 1000);
  drive(0, 0, 500);
  Serial.println("spin left, then right");
  drive(-MAX_SPEED / 2, MAX_SPEED / 2, 700);
  drive(MAX_SPEED / 2, -MAX_SPEED / 2, 700);
  drive(0, 0, 500);
${enc ? `  Serial.print("encoder ticks  left: ");
  Serial.print(leftTicks);
  Serial.print("  right: ");
  Serial.println(rightTicks);
` : ""}${sonar ? `  Serial.print("distance cm: ");
  Serial.println(distanceCm());
` : ""}  delay(2000);
}
`;
}

function python(plan: PinPlan, parts: Part[]): string {
  const n = (s: string) => codePin(row(plan, s)?.pin ?? "?");
  const { cap, why } = speedCap(parts);
  const sp = Math.round((cap / 255) * 50) / 100; // half of the allowed maximum
  const motors =
    plan.driverStyle === "dual_pwm"
      ? `left = Motor(forward=${n("LEFT_A")}, backward=${n("LEFT_B")})\nright = Motor(forward=${n("RIGHT_A")}, backward=${n("RIGHT_B")})`
      : plan.driverStyle === "pwm_dir"
        ? `left = PhaseEnableMotor(phase=${n("LEFT_DIR")}, enable=${n("LEFT_PWM")})\nright = PhaseEnableMotor(phase=${n("RIGHT_DIR")}, enable=${n("RIGHT_PWM")})`
        : `left = Motor(forward=${n("LEFT_IN1")}, backward=${n("LEFT_IN2")}, enable=${n("LEFT_PWM")})\nright = Motor(forward=${n("RIGHT_IN1")}, backward=${n("RIGHT_IN2")}, enable=${n("RIGHT_PWM")})`;
  const sonar = !!row(plan, "SONAR_TRIG");
  return `# buildabot starter code for ${plan.hostName}
# Lift the robot so the wheels are off the table, then run:  python3 robot_test.py
# Needs gpiozero:  sudo apt install python3-gpiozero
${why ? `# ${why}\n` : ""}from time import sleep
from gpiozero import ${plan.driverStyle === "pwm_dir" ? "PhaseEnableMotor" : "Motor"}${sonar ? ", DistanceSensor" : ""}

# GPIO numbers (BCM), matching the pin map in buildabot
${motors}
${sonar ? `sonar = DistanceSensor(echo=${n("SONAR_ECHO")}, trigger=${n("SONAR_TRIG")})\n` : ""}
SPEED = ${sp}  # 0 to 1


def drive(l, r, seconds):
    for motor, v in ((left, l), (right, r)):
        if v > 0:
            motor.forward(v)
        elif v < 0:
            motor.backward(-v)
        else:
            motor.stop()
    sleep(seconds)


print("forward")
drive(SPEED, SPEED, 1)
drive(0, 0, 0.5)
print("backward")
drive(-SPEED, -SPEED, 1)
drive(0, 0, 0.5)
print("spin left, then right")
drive(-SPEED, SPEED, 0.7)
drive(SPEED, -SPEED, 0.7)
drive(0, 0, 0.5)
${sonar ? `print(f"distance: {sonar.distance * 100:.0f} cm")\n` : ""}`;
}

export function generateFirmware(items: BuildItem[], byId: Record<string, Part>): Firmware | null {
  const plan = planPins(items, byId);
  if (!plan || !plan.driverStyle) return null;
  const parts = items.map((i) => byId[i.part_id]).filter(Boolean);
  if (plan.host === "raspberry_pi") {
    return {
      filename: "robot_test.py",
      language: "python",
      code: python(plan, parts),
      howTo: ["Copy robot_test.py to the Raspberry Pi (for example with scp, or a USB stick).", "Install gpiozero: sudo apt install python3-gpiozero", "Lift the robot, then run: python3 robot_test.py"],
    };
  }
  return {
    filename: "buildabot_test.ino",
    language: "cpp",
    code: cpp(plan, parts),
    howTo: [...(BOARD_SETUP[plan.host] ?? []), "Open buildabot_test.ino, plug in the board by USB, and click Upload.", "Lift the robot and open the Serial Monitor at 115200 baud."],
  };
}

// ---------------------------------------------------------------- drive from your phone

const PHONE_PAGE = `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">
<title>buildabot</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#eceef1;color:#15171c;display:flex;flex-direction:column;align-items:center;gap:16px;padding:20px;touch-action:none;user-select:none}
  h1{font-size:20px;margin:0} p{margin:0;color:#5d6472;font-size:14px}
  #pad{width:80vmin;height:80vmin;max-width:340px;max-height:340px;border-radius:50%;background:#fff;position:relative;box-shadow:0 2px 12px #0002}
  #knob{width:30%;height:30%;border-radius:50%;background:#2a44f5;position:absolute;left:35%;top:35%}
  #stop{width:80vmin;max-width:340px;height:64px;border:0;border-radius:32px;background:#15171c;color:#fff;font-size:20px;font-weight:700}
  #speed{width:80vmin;max-width:340px}
</style></head><body>
<h1>buildabot</h1><p>Drag the blue dot to drive. Let go to stop.</p>
<div id="pad"><div id="knob"></div></div>
<label><p>Speed</p><input id="speed" type="range" min="20" max="100" value="60"></label>
<button id="stop">STOP</button>
<p id="status">connecting...</p>
<script>
const pad=document.getElementById('pad'),knob=document.getElementById('knob'),st=document.getElementById('status'),speed=document.getElementById('speed');
let x=0,y=0,active=false;
function place(){knob.style.left=(35+x*35)+'%';knob.style.top=(35-y*35)+'%';}
function move(e){const r=pad.getBoundingClientRect();let dx=(e.clientX-r.left)/r.width*2-1,dy=1-(e.clientY-r.top)/r.height*2;const d=Math.hypot(dx,dy);if(d>1){dx/=d;dy/=d;}x=dx;y=dy;place();}
pad.addEventListener('pointerdown',e=>{active=true;pad.setPointerCapture(e.pointerId);move(e);});
pad.addEventListener('pointermove',e=>{if(active)move(e);});
function release(){active=false;x=0;y=0;place();}
pad.addEventListener('pointerup',release);pad.addEventListener('pointercancel',release);
document.getElementById('stop').addEventListener('click',release);
setInterval(()=>{const s=speed.value/100;const l=Math.max(-1,Math.min(1,y+x))*s,r=Math.max(-1,Math.min(1,y-x))*s;
fetch('/drive?l='+Math.round(l*100)+'&r='+Math.round(r*100)).then(t=>t.text()).then(t=>st.textContent=t).catch(()=>st.textContent='not connected');},120);
</script></body></html>`;

function phoneCpp(plan: PinPlan, parts: Part[]): string {
  const { cap, why } = speedCap(parts);
  const sonar = !!row(plan, "SONAR_TRIG");
  return `// buildabot: drive from your phone
// The robot makes its own Wi-Fi network. On your phone, join "buildabot-robot"
// (password below), then open http://192.168.4.1 and drag the blue dot.
// The wheels stop by themselves if the phone stops sending for half a second.
${why ? `// ${why}\n` : ""}
#include <WiFi.h>
#include <WebServer.h>

const char* WIFI_NAME = "buildabot-robot";
const char* WIFI_PASSWORD = "build1234"; // at least 8 characters: change it

// Pins, matching the pin map in buildabot
${pinDefs(plan).join("\n")}

const int MAX_SPEED = ${cap}; // 0 to 255
${sonar ? "const float STOP_CM = 15;   // won't drive forward into anything closer than this\n" : ""}
WebServer server(80);
unsigned long lastCommand = 0;

const char PAGE[] = R"PAGE(${PHONE_PAGE})PAGE";

${setMotorCode(plan)}
${sonar ? `
float distanceCm() {
  digitalWrite(SONAR_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(SONAR_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(SONAR_TRIG, LOW);
  long us = pulseIn(SONAR_ECHO, HIGH, 20000);
  return us ? us / 58.0 : -1;
}
` : ""}
void handleDrive() {
  int l = constrain(server.arg("l").toInt(), -100, 100);
  int r = constrain(server.arg("r").toInt(), -100, 100);
${sonar ? `  float d = distanceCm();
  if (d > 0 && d < STOP_CM && l > 0 && r > 0) {
    l = 0;
    r = 0;
  }
` : ""}  setMotor(true, l * MAX_SPEED / 100);
  setMotor(false, r * MAX_SPEED / 100);
  lastCommand = millis();
${sonar ? `  server.send(200, "text/plain", d > 0 ? String("connected, ") + String((int)d) + " cm ahead" : String("connected"));` : `  server.send(200, "text/plain", "connected");`}
}

void setup() {
  Serial.begin(115200);
${outputPins(plan).join("\n")}
${sonar ? "  pinMode(SONAR_ECHO, INPUT);\n" : ""}  setMotor(true, 0);
  setMotor(false, 0);
  WiFi.softAP(WIFI_NAME, WIFI_PASSWORD);
  server.on("/", []() { server.send(200, "text/html", PAGE); });
  server.on("/drive", handleDrive);
  server.begin();
  Serial.print("Join Wi-Fi ");
  Serial.print(WIFI_NAME);
  Serial.print(", then open http://");
  Serial.println(WiFi.softAPIP());
}

void loop() {
  server.handleClient();
  if (millis() - lastCommand > 500) {
    setMotor(true, 0);
    setMotor(false, 0);
  }
}
`;
}

/** A sketch that turns an ESP32 into a Wi-Fi joystick page for the "drive it from my phone" job. */
export function generatePhoneDrive(items: BuildItem[], byId: Record<string, Part>): Firmware | null {
  const plan = planPins(items, byId);
  if (!plan || !plan.driverStyle || plan.host !== "esp32") return null;
  const parts = items.map((i) => byId[i.part_id]).filter(Boolean);
  return {
    filename: "buildabot_phone_drive.ino",
    language: "cpp",
    code: phoneCpp(plan, parts),
    howTo: [
      ...BOARD_SETUP.esp32,
      "Open buildabot_phone_drive.ino, change WIFI_PASSWORD, plug in the board by USB and click Upload.",
      "Unplug the USB, switch the robot on, and join the buildabot-robot Wi-Fi on your phone.",
      "Open http://192.168.4.1 in your phone's browser and drag the blue dot. Start with the speed slider low.",
    ],
  };
}
