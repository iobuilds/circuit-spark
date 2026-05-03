import type { CircuitComponent, Wire, BoardId } from "@/sim/types";

/** A single sketch attached to a specific board component on the canvas. */
export interface BoardSketch {
  /** componentId of the board this sketch should attach to. */
  boardCompId: string;
  /** filename shown in the IDE (e.g. master.ino, slave.ino). */
  fileName: string;
  /** sketch source code. */
  code: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  boardId: BoardId;
  /** Single-board legacy entry (used when sketches[] is absent). */
  code: string;
  components: CircuitComponent[];
  wires: Wire[];
  /** Optional per-board sketches for multi-board projects. The componentIds
   *  here MUST match the ids in `components` so the IDE attaches the right
   *  .ino file to the right board on the canvas. */
  sketches?: BoardSketch[];
}

export const TEMPLATES: ProjectTemplate[] = [
  {
    id: "blink",
    name: "Blink LED",
    description: "Classic Arduino hello world. Blinks an LED on pin 13.",
    boardId: "uno",
    code: `void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  digitalWrite(13, HIGH);
  Serial.println("ON");
  delay(500);
  digitalWrite(13, LOW);
  Serial.println("OFF");
  delay(500);
}
`,
    components: [
      { id: "led1", kind: "led", x: 540, y: 130, rotation: 0, props: { color: "red" } },
      { id: "r1", kind: "resistor", x: 520, y: 240, rotation: 0, props: { ohms: 220 } },
    ],
    wires: [
      { id: "w1", from: { componentId: "board", pinId: "D13" }, to: { componentId: "led1", pinId: "A" } },
      { id: "w2", from: { componentId: "led1", pinId: "K" }, to: { componentId: "r1", pinId: "1" } },
      { id: "w3", from: { componentId: "r1", pinId: "2" }, to: { componentId: "board", pinId: "GND_TOP" } },
    ],
  },
  {
    id: "button-led",
    name: "Button + LED",
    description: "Press the button to light up the LED.",
    boardId: "uno",
    code: `void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int v = digitalRead(2);
  digitalWrite(13, v == 0 ? 1 : 0);
  Serial.println(v);
  delay(50);
}
`,
    components: [
      { id: "led1", kind: "led", x: 560, y: 130, rotation: 0, props: { color: "green" } },
      { id: "r1", kind: "resistor", x: 540, y: 240, rotation: 0, props: { ohms: 220 } },
      { id: "btn1", kind: "button", x: 200, y: 360, rotation: 0, props: {} },
    ],
    wires: [
      { id: "w1", from: { componentId: "board", pinId: "D13" }, to: { componentId: "led1", pinId: "A" } },
      { id: "w2", from: { componentId: "led1", pinId: "K" }, to: { componentId: "r1", pinId: "1" } },
      { id: "w3", from: { componentId: "r1", pinId: "2" }, to: { componentId: "board", pinId: "GND_TOP" } },
      { id: "w4", from: { componentId: "board", pinId: "D2" }, to: { componentId: "btn1", pinId: "A" } },
      { id: "w5", from: { componentId: "btn1", pinId: "B" }, to: { componentId: "board", pinId: "GND1" } },
    ],
  },
  {
    id: "pot-serial",
    name: "Potentiometer + Serial",
    description: "Read a potentiometer and print the value to serial.",
    boardId: "uno",
    code: `void setup() {
  Serial.begin(9600);
}

void loop() {
  int v = analogRead(A0);
  Serial.print("A0 = ");
  Serial.println(v);
  delay(200);
}
`,
    components: [
      { id: "pot1", kind: "potentiometer", x: 200, y: 360, rotation: 0, props: { value: 512 } },
    ],
    wires: [
      { id: "w1", from: { componentId: "pot1", pinId: "1" }, to: { componentId: "board", pinId: "GND1" } },
      { id: "w2", from: { componentId: "pot1", pinId: "2" }, to: { componentId: "board", pinId: "5V" } },
      { id: "w3", from: { componentId: "pot1", pinId: "W" }, to: { componentId: "board", pinId: "A0" } },
    ],
  },
  {
    id: "fade",
    name: "PWM Fade",
    description: "Fade an LED in and out with analogWrite (PWM).",
    boardId: "uno",
    code: `int v = 0;
int dir = 5;
void setup() { pinMode(9, OUTPUT); }
void loop() {
  analogWrite(9, v);
  v = v + dir;
  if (v >= 255 || v <= 0) dir = -dir;
  delay(30);
}
`,
    components: [
      { id: "led1", kind: "led", x: 360, y: 130, rotation: 0, props: { color: "blue" } },
      { id: "r1", kind: "resistor", x: 340, y: 240, rotation: 0, props: { ohms: 220 } },
    ],
    wires: [
      { id: "w1", from: { componentId: "board", pinId: "D9" }, to: { componentId: "led1", pinId: "A" } },
      { id: "w2", from: { componentId: "led1", pinId: "K" }, to: { componentId: "r1", pinId: "1" } },
      { id: "w3", from: { componentId: "r1", pinId: "2" }, to: { componentId: "board", pinId: "GND_TOP" } },
    ],
  },

  // ─────────────────────────── Multi-board examples ────────────────────────
  // Two Unos placed offset so both fit on screen. Per-board sketches are
  // attached via `sketches[]` and the IDE creates one .ino per board on load.

  {
    id: "two-board-serial-relay",
    name: "Two-Board Signal Relay",
    description: "Master Uno blinks D5 — Slave Uno mirrors it onto its built-in LED. Demonstrates inter-board GPIO over a wire.",
    boardId: "uno",
    code: "// See per-board tabs: master.ino on Uno #1, slave.ino on Uno #2.",
    components: [
      { id: "uno_master", kind: "board", x: 60, y: 60, rotation: 0, props: { boardId: "uno" } },
      { id: "uno_slave",  kind: "board", x: 60, y: 420, rotation: 0, props: { boardId: "uno" } },
    ],
    wires: [
      { id: "w1", from: { componentId: "uno_master", pinId: "D5" }, to: { componentId: "uno_slave",  pinId: "D2" } },
      { id: "w2", from: { componentId: "uno_master", pinId: "GND_TOP" }, to: { componentId: "uno_slave", pinId: "GND_TOP" } },
    ],
    sketches: [
      {
        boardCompId: "uno_master",
        fileName: "master.ino",
        code: `// MASTER — toggle D5 every 500 ms.\nvoid setup() {\n  pinMode(5, OUTPUT);\n  Serial.begin(9600);\n  Serial.println("master ready");\n}\n\nvoid loop() {\n  digitalWrite(5, HIGH);\n  Serial.println("tick HIGH");\n  delay(500);\n  digitalWrite(5, LOW);\n  Serial.println("tick LOW");\n  delay(500);\n}\n`,
      },
      {
        boardCompId: "uno_slave",
        fileName: "slave.ino",
        code: `// SLAVE — read D2 (driven by master D5), mirror onto built-in LED (D13).\nvoid setup() {\n  pinMode(2, INPUT);\n  pinMode(13, OUTPUT);\n  Serial.begin(9600);\n  Serial.println("slave ready");\n}\n\nvoid loop() {\n  int v = digitalRead(2);\n  digitalWrite(13, v);\n  Serial.print("got "); Serial.println(v);\n  delay(50);\n}\n`,
      },
    ],
  },

  {
    id: "two-board-i2c-temp",
    name: "I²C Temp Sensor → Display",
    description: "Slave acts as a fake temp sensor — every second the master requests a reading over I²C and prints it.",
    boardId: "uno",
    code: "// See per-board tabs: i2c_master.ino and i2c_slave.ino.",
    components: [
      { id: "uno_master", kind: "board", x: 60, y: 60, rotation: 0, props: { boardId: "uno" } },
      { id: "uno_slave",  kind: "board", x: 60, y: 420, rotation: 0, props: { boardId: "uno" } },
    ],
    wires: [
      { id: "w1", from: { componentId: "uno_master", pinId: "A4" }, to: { componentId: "uno_slave", pinId: "A4" } },
      { id: "w2", from: { componentId: "uno_master", pinId: "A5" }, to: { componentId: "uno_slave", pinId: "A5" } },
      { id: "w3", from: { componentId: "uno_master", pinId: "GND_TOP" }, to: { componentId: "uno_slave", pinId: "GND_TOP" } },
    ],
    sketches: [
      {
        boardCompId: "uno_master",
        fileName: "i2c_master.ino",
        code: `#include <Wire.h>\n\nvoid setup() {\n  Wire.begin();\n  Serial.begin(9600);\n  Serial.println("master: I2C ready");\n}\n\nvoid loop() {\n  Wire.requestFrom(8, 2);   // 2 bytes from slave 0x08\n  int hi = Wire.read();\n  int lo = Wire.read();\n  int temp = (hi << 8) | lo;\n  Serial.print("temp = ");\n  Serial.print(temp / 10);\n  Serial.println(" C");\n  delay(1000);\n}\n`,
      },
      {
        boardCompId: "uno_slave",
        fileName: "i2c_slave.ino",
        code: `#include <Wire.h>\n\nint t = 230; // 23.0 C, will drift slowly\n\nvoid onRequest() {\n  Wire.write((t >> 8) & 0xFF);\n  Wire.write(t & 0xFF);\n}\n\nvoid setup() {\n  Wire.begin(8);\n  Wire.onRequest(onRequest);\n  Serial.begin(9600);\n  Serial.println("slave: I2C @ 0x08");\n}\n\nvoid loop() {\n  t = t + (random(0, 3) - 1);\n  if (t < 200) t = 200;\n  if (t > 280) t = 280;\n  delay(500);\n}\n`,
      },
    ],
  },

  {
    id: "two-board-spi-shift",
    name: "SPI Shift-Register Demo",
    description: "Master clocks an 8-bit pattern out via SPI; slave samples MOSI on each SCK edge and pulses a STATUS line back.",
    boardId: "uno",
    code: "// See per-board tabs: spi_master.ino and spi_slave.ino.",
    components: [
      { id: "uno_master", kind: "board", x: 60, y: 60, rotation: 0, props: { boardId: "uno" } },
      { id: "uno_slave",  kind: "board", x: 60, y: 420, rotation: 0, props: { boardId: "uno" } },
    ],
    wires: [
      { id: "w1", from: { componentId: "uno_master", pinId: "D11" }, to: { componentId: "uno_slave", pinId: "D11" } },
      { id: "w2", from: { componentId: "uno_master", pinId: "D13" }, to: { componentId: "uno_slave", pinId: "D13" } },
      { id: "w3", from: { componentId: "uno_master", pinId: "D10" }, to: { componentId: "uno_slave", pinId: "D10" } },
      { id: "w4", from: { componentId: "uno_slave",  pinId: "D7"  }, to: { componentId: "uno_master", pinId: "D2" } },
      { id: "w5", from: { componentId: "uno_master", pinId: "GND_TOP" }, to: { componentId: "uno_slave", pinId: "GND_TOP" } },
    ],
    sketches: [
      {
        boardCompId: "uno_master",
        fileName: "spi_master.ino",
        code: `#include <SPI.h>\n\nconst int SS_PIN = 10;\nconst int STATUS = 2;\nbyte pattern = 0x55;\n\nvoid setup() {\n  pinMode(SS_PIN, OUTPUT);\n  pinMode(STATUS, INPUT);\n  digitalWrite(SS_PIN, HIGH);\n  SPI.begin();\n  Serial.begin(9600);\n  Serial.println("master: SPI ready");\n}\n\nvoid loop() {\n  digitalWrite(SS_PIN, LOW);\n  SPI.transfer(pattern);\n  digitalWrite(SS_PIN, HIGH);\n  Serial.print("sent 0x"); Serial.println(pattern);\n  if (digitalRead(STATUS) == HIGH) {\n    Serial.println("slave ACK");\n  }\n  pattern = pattern == 0x55 ? 0xAA : 0x55;\n  delay(800);\n}\n`,
      },
      {
        boardCompId: "uno_slave",
        fileName: "spi_slave.ino",
        code: `// Functional SPI slave: count SCK pulses, sample MOSI, pulse STATUS\n// on D7 once a full byte is in.\nvolatile int rx = 0;\nvolatile int bits = 0;\n\nvoid sckRise() {\n  int b = digitalRead(11); // MOSI\n  rx = ((rx << 1) | (b & 1)) & 0xFF;\n  bits++;\n  if (bits == 8) {\n    bits = 0;\n    Serial.print("got 0x"); Serial.println(rx);\n    digitalWrite(7, HIGH);\n    delay(5);\n    digitalWrite(7, LOW);\n  }\n}\n\nvoid setup() {\n  pinMode(11, INPUT);\n  pinMode(13, INPUT);\n  pinMode(10, INPUT);\n  pinMode(7, OUTPUT);\n  digitalWrite(7, LOW);\n  attachInterrupt(digitalPinToInterrupt(13), sckRise, RISING);\n  Serial.begin(9600);\n  Serial.println("slave: SPI ready");\n}\n\nvoid loop() {\n  delay(50);\n}\n`,
      },
    ],
  },
];
