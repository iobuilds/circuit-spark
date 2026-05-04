import type { CircuitComponent, Wire, BoardId } from "@/sim/types";

/** A single sketch attached to a specific board component on the canvas. */
export interface BoardSketch {
  boardCompId: string;
  fileName: string;
  code: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  boardId: BoardId;
  code: string;
  components: CircuitComponent[];
  wires: Wire[];
  sketches?: BoardSketch[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const BOARD = (id: string, x: number, y: number, boardId: BoardId = "uno"): CircuitComponent => ({
  id, kind: "board", x, y, rotation: 0, props: { boardId },
});

// ─────────────────────────────────────────────────────────────────────────────
// Fresh example library. Old templates removed.
// Each example is wired against an explicit board component (no legacy "board"
// id) so wires track the board when moved.
// ─────────────────────────────────────────────────────────────────────────────

export const TEMPLATES: ProjectTemplate[] = [
  // 1 ── Single board · Blink
  {
    id: "ex-blink",
    name: "1 · Blink",
    description: "The classic. Toggles the on-board LED on D13 every 500 ms.",
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
      BOARD("uno1", 60, 60),
      { id: "led1", kind: "led", x: 540, y: 130, rotation: 0, props: { color: "red" } },
      { id: "r1",   kind: "resistor", x: 520, y: 240, rotation: 0, props: { ohms: 220 } },
    ],
    wires: [
      { id: "w1", from: { componentId: "uno1", pinId: "D13" }, to: { componentId: "led1", pinId: "A" } },
      { id: "w2", from: { componentId: "led1", pinId: "K"   }, to: { componentId: "r1",   pinId: "1" } },
      { id: "w3", from: { componentId: "r1",   pinId: "2"   }, to: { componentId: "uno1", pinId: "GND_TOP" } },
    ],
  },

  // 2 ── Single board · Button + LED
  {
    id: "ex-button",
    name: "2 · Button + LED",
    description: "Reads a button on D2 (INPUT_PULLUP) and lights an LED on D13 while it is held.",
    boardId: "uno",
    code: `void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int v = digitalRead(2);
  digitalWrite(13, v == LOW ? HIGH : LOW);
  Serial.println(v);
  delay(50);
}
`,
    components: [
      BOARD("uno1", 60, 60),
      { id: "led1", kind: "led", x: 560, y: 130, rotation: 0, props: { color: "green" } },
      { id: "r1",   kind: "resistor", x: 540, y: 240, rotation: 0, props: { ohms: 220 } },
      { id: "btn1", kind: "button",   x: 220, y: 360, rotation: 0, props: {} },
    ],
    wires: [
      { id: "w1", from: { componentId: "uno1", pinId: "D13" }, to: { componentId: "led1", pinId: "A" } },
      { id: "w2", from: { componentId: "led1", pinId: "K"   }, to: { componentId: "r1",   pinId: "1" } },
      { id: "w3", from: { componentId: "r1",   pinId: "2"   }, to: { componentId: "uno1", pinId: "GND_TOP" } },
      { id: "w4", from: { componentId: "uno1", pinId: "D2"  }, to: { componentId: "btn1", pinId: "A" } },
      { id: "w5", from: { componentId: "btn1", pinId: "B"   }, to: { componentId: "uno1", pinId: "GND1" } },
    ],
  },

  // 3 ── Single board · Potentiometer + PWM LED
  {
    id: "ex-pot-pwm",
    name: "3 · Pot → PWM Brightness",
    description: "Read A0 and use it to set the brightness of an LED on D9 via analogWrite.",
    boardId: "uno",
    code: `void setup() {
  pinMode(9, OUTPUT);
  Serial.begin(9600);
}

void loop() {
  int v = analogRead(A0);
  int duty = v / 4; // 0..1023 → 0..255
  analogWrite(9, duty);
  Serial.print("A0="); Serial.print(v);
  Serial.print(" duty="); Serial.println(duty);
  delay(30);
}
`,
    components: [
      BOARD("uno1", 60, 60),
      { id: "pot1", kind: "potentiometer", x: 220, y: 360, rotation: 0, props: { value: 512 } },
      { id: "led1", kind: "led",      x: 560, y: 130, rotation: 0, props: { color: "blue" } },
      { id: "r1",   kind: "resistor", x: 540, y: 240, rotation: 0, props: { ohms: 220 } },
    ],
    wires: [
      { id: "w1", from: { componentId: "pot1", pinId: "1" }, to: { componentId: "uno1", pinId: "GND1" } },
      { id: "w2", from: { componentId: "pot1", pinId: "2" }, to: { componentId: "uno1", pinId: "5V"   } },
      { id: "w3", from: { componentId: "pot1", pinId: "W" }, to: { componentId: "uno1", pinId: "A0"   } },
      { id: "w4", from: { componentId: "uno1", pinId: "D9" }, to: { componentId: "led1", pinId: "A"  } },
      { id: "w5", from: { componentId: "led1", pinId: "K" }, to: { componentId: "r1",   pinId: "1"  } },
      { id: "w6", from: { componentId: "r1",   pinId: "2" }, to: { componentId: "uno1", pinId: "GND_TOP" } },
    ],
  },

  // 4 ── Multi-board · Serial UART relay
  {
    id: "ex-uart-relay",
    name: "4 · Two Boards · UART Relay",
    description: "Master sends a counter over TX → Slave RX. Slave echoes back & blinks D13 on every byte.",
    boardId: "uno",
    code: "// Per-board sketches: master_uart.ino + slave_uart.ino.",
    components: [
      BOARD("uno_master", 40,  40),
      BOARD("uno_slave",  40, 460),
    ],
    wires: [
      // TX(D1) of master → RX(D0) of slave, and vice versa
      { id: "w1", from: { componentId: "uno_master", pinId: "D1" }, to: { componentId: "uno_slave",  pinId: "D0" } },
      { id: "w2", from: { componentId: "uno_slave",  pinId: "D1" }, to: { componentId: "uno_master", pinId: "D0" } },
      { id: "w3", from: { componentId: "uno_master", pinId: "GND_TOP" }, to: { componentId: "uno_slave", pinId: "GND_TOP" } },
    ],
    sketches: [
      {
        boardCompId: "uno_master",
        fileName: "master_uart.ino",
        code: `// MASTER — send a counter once per second, print echoes from slave.
int n = 0;
void setup() {
  Serial.begin(9600);
}
void loop() {
  Serial.print("PING ");
  Serial.println(n++);
  delay(1000);
}
`,
      },
      {
        boardCompId: "uno_slave",
        fileName: "slave_uart.ino",
        code: `// SLAVE — blink D13 on every received byte, echo line back.
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}
void loop() {
  if (Serial.available()) {
    String s = Serial.readStringUntil('\\n');
    digitalWrite(13, HIGH);
    delay(20);
    digitalWrite(13, LOW);
    Serial.print("ACK ");
    Serial.println(s);
  }
}
`,
      },
    ],
  },

  // 5 ── Multi-board · I2C temperature sensor
  {
    id: "ex-i2c-temp",
    name: "5 · Two Boards · I²C Temp Sensor",
    description: "Slave (addr 0x08) reports a drifting temperature. Master polls it once per second over I²C.",
    boardId: "uno",
    code: "// Per-board sketches: i2c_master.ino + i2c_slave.ino.",
    components: [
      BOARD("uno_master", 40,  40),
      BOARD("uno_slave",  40, 460),
    ],
    wires: [
      { id: "w1", from: { componentId: "uno_master", pinId: "A4" }, to: { componentId: "uno_slave", pinId: "A4" } }, // SDA
      { id: "w2", from: { componentId: "uno_master", pinId: "A5" }, to: { componentId: "uno_slave", pinId: "A5" } }, // SCL
      { id: "w3", from: { componentId: "uno_master", pinId: "GND_TOP" }, to: { componentId: "uno_slave", pinId: "GND_TOP" } },
    ],
    sketches: [
      {
        boardCompId: "uno_master",
        fileName: "i2c_master.ino",
        code: `#include <Wire.h>
void setup() {
  Wire.begin();
  Serial.begin(9600);
  Serial.println("master ready");
}
void loop() {
  Wire.requestFrom(8, 2);
  int hi = Wire.read();
  int lo = Wire.read();
  int t = (hi << 8) | lo;
  Serial.print("temp = ");
  Serial.print(t / 10.0, 1);
  Serial.println(" C");
  delay(1000);
}
`,
      },
      {
        boardCompId: "uno_slave",
        fileName: "i2c_slave.ino",
        code: `#include <Wire.h>
int t = 230;
void onRequest() {
  Wire.write((t >> 8) & 0xFF);
  Wire.write(t & 0xFF);
}
void setup() {
  Wire.begin(8);
  Wire.onRequest(onRequest);
  Serial.begin(9600);
  Serial.println("slave @ 0x08");
}
void loop() {
  t += (random(0, 3) - 1);
  if (t < 200) t = 200;
  if (t > 280) t = 280;
  delay(500);
}
`,
      },
    ],
  },

  // 6 ── Multi-board · GPIO mirror
  {
    id: "ex-gpio-mirror",
    name: "6 · Two Boards · GPIO Mirror",
    description: "Master toggles D5 every 500 ms. Slave reads its D2 and mirrors it onto D13.",
    boardId: "uno",
    code: "// Per-board sketches: master_gpio.ino + slave_gpio.ino.",
    components: [
      BOARD("uno_master", 40,  40),
      BOARD("uno_slave",  40, 460),
    ],
    wires: [
      { id: "w1", from: { componentId: "uno_master", pinId: "D5" }, to: { componentId: "uno_slave",  pinId: "D2" } },
      { id: "w2", from: { componentId: "uno_master", pinId: "GND_TOP" }, to: { componentId: "uno_slave", pinId: "GND_TOP" } },
    ],
    sketches: [
      {
        boardCompId: "uno_master",
        fileName: "master_gpio.ino",
        code: `void setup() {
  pinMode(5, OUTPUT);
  Serial.begin(9600);
}
void loop() {
  digitalWrite(5, HIGH); Serial.println("HIGH"); delay(500);
  digitalWrite(5, LOW);  Serial.println("LOW");  delay(500);
}
`,
      },
      {
        boardCompId: "uno_slave",
        fileName: "slave_gpio.ino",
        code: `void setup() {
  pinMode(2, INPUT);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}
void loop() {
  int v = digitalRead(2);
  digitalWrite(13, v);
  Serial.print("mirror "); Serial.println(v);
  delay(50);
}
`,
      },
    ],
  },

  // 7 ── DS3231 RTC · read & print time
  {
    id: "ex-ds3231-rtc",
    name: "7 · DS3231 RTC Clock",
    description:
      "Reads time from a DS3231 over I²C (A4 = SDA, A5 = SCL) and prints it every second on the Serial Monitor.",
    boardId: "uno",
    code: `// DS3231 RTC — print time every second over Serial.
// Wiring (Arduino Uno):
//   DS3231 VCC -> 5V
//   DS3231 GND -> GND
//   DS3231 SDA -> A4
//   DS3231 SCL -> A5
#include <Wire.h>

#define DS3231_ADDR 0x68

static uint8_t bcd2dec(uint8_t b) { return (b >> 4) * 10 + (b & 0x0F); }

void setup() {
  Wire.begin();
  Serial.begin(9600);
  Serial.println("DS3231 RTC ready");
}

void loop() {
  // Point to register 0x00 (seconds), then read 7 time/date bytes.
  Wire.beginTransmission(DS3231_ADDR);
  Wire.write((uint8_t)0x00);
  Wire.endTransmission();
  Wire.requestFrom(DS3231_ADDR, 7);

  uint8_t s  = bcd2dec(Wire.read() & 0x7F);
  uint8_t mi = bcd2dec(Wire.read() & 0x7F);
  uint8_t h  = bcd2dec(Wire.read() & 0x3F);
  Wire.read();                                 // weekday (skip)
  uint8_t d  = bcd2dec(Wire.read() & 0x3F);
  uint8_t mo = bcd2dec(Wire.read() & 0x1F);
  uint16_t y = 2000 + bcd2dec(Wire.read());

  char buf[40];
  snprintf(buf, sizeof(buf), "%04u-%02u-%02u %02u:%02u:%02u",
           y, mo, d, h, mi, s);
  Serial.println(buf);
  delay(1000);
}
`,
    components: [
      BOARD("uno1", 40, 40),
      { id: "rtc1", kind: "ds3231", x: 540, y: 380, rotation: 0, props: {} },
    ],
    wires: [
      { id: "w1", from: { componentId: "uno1", pinId: "5V"   }, to: { componentId: "rtc1", pinId: "VCC" } },
      { id: "w2", from: { componentId: "uno1", pinId: "GND1" }, to: { componentId: "rtc1", pinId: "GND" } },
      { id: "w3", from: { componentId: "uno1", pinId: "A4"   }, to: { componentId: "rtc1", pinId: "SDA" } },
      { id: "w4", from: { componentId: "uno1", pinId: "A5"   }, to: { componentId: "rtc1", pinId: "SCL" } },
    ],
  },
];
