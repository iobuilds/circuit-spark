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
      // Components placed clear of the Uno PCB (60..1020 × 60..764).
      { id: "led1", kind: "led", x: 1120, y: 200, rotation: 0, props: { color: "red" } },
      { id: "r1",   kind: "resistor", x: 1100, y: 360, rotation: 0, props: { ohms: 220 } },
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
      { id: "led1", kind: "led", x: 1120, y: 200, rotation: 0, props: { color: "green" } },
      { id: "r1",   kind: "resistor", x: 1100, y: 360, rotation: 0, props: { ohms: 220 } },
      { id: "btn1", kind: "button",   x: 1120, y: 480, rotation: 0, props: {} },
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
      { id: "pot1", kind: "potentiometer", x: 1120, y: 480, rotation: 0, props: { value: 512 } },
      { id: "led1", kind: "led",      x: 1120, y: 200, rotation: 0, props: { color: "blue" } },
      { id: "r1",   kind: "resistor", x: 1100, y: 360, rotation: 0, props: { ohms: 220 } },
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
      // Place the RTC well clear of the Uno PCB (Uno spans 40..1000 × 40..744).
      { id: "rtc1", kind: "ds3231", x: 1080, y: 300, rotation: 0, props: {} },
    ],
    wires: [
      { id: "w1", from: { componentId: "uno1", pinId: "5V"   }, to: { componentId: "rtc1", pinId: "VCC" } },
      { id: "w2", from: { componentId: "uno1", pinId: "GND1" }, to: { componentId: "rtc1", pinId: "GND" } },
      { id: "w3", from: { componentId: "uno1", pinId: "A4"   }, to: { componentId: "rtc1", pinId: "SDA" } },
      { id: "w4", from: { componentId: "uno1", pinId: "A5"   }, to: { componentId: "rtc1", pinId: "SCL" } },
    ],
  },

  // 8 ── SSD1306 OLED · animated counter
  {
    id: "ex-oled-counter",
    name: "8 · OLED 0.96\" Counter",
    description:
      "Drives a 128×64 SSD1306 OLED over I²C (A4=SDA, A5=SCL @ 0x3C) using only Wire.h. Shows a splash, animated counter and a bouncing progress bar.",
    boardId: "uno",
    code: `// SSD1306 128x64 OLED — pure Wire.h driver (no external library).
// Wiring (Arduino Uno):
//   OLED GND -> GND
//   OLED VCC -> 5V (or 3.3V on some modules)
//   OLED SCL -> A5
//   OLED SDA -> A4
#include <Wire.h>

#define OLED_ADDR 0x3C

// Compact 5x7 font. Each glyph = 5 columns, bit0=top.
static const uint8_t FONT5x7[][5] PROGMEM = {
  {0x3E,0x51,0x49,0x45,0x3E}, // 0
  {0x00,0x42,0x7F,0x40,0x00}, // 1
  {0x42,0x61,0x51,0x49,0x46}, // 2
  {0x21,0x41,0x45,0x4B,0x31}, // 3
  {0x18,0x14,0x12,0x7F,0x10}, // 4
  {0x27,0x45,0x45,0x45,0x39}, // 5
  {0x3C,0x4A,0x49,0x49,0x30}, // 6
  {0x01,0x71,0x09,0x05,0x03}, // 7
  {0x36,0x49,0x49,0x49,0x36}, // 8
  {0x06,0x49,0x49,0x29,0x1E}, // 9
  {0x7C,0x12,0x11,0x12,0x7C}, // A
  {0x7F,0x49,0x49,0x49,0x36}, // B
  {0x3E,0x41,0x41,0x41,0x22}, // C
  {0x7F,0x09,0x09,0x09,0x01}, // E
  {0x3E,0x41,0x49,0x49,0x7A}, // G
  {0x7F,0x08,0x14,0x22,0x41}, // K
  {0x7F,0x40,0x40,0x40,0x40}, // L
  {0x7F,0x02,0x0C,0x02,0x7F}, // M
  {0x7F,0x04,0x08,0x10,0x7F}, // N
  {0x3E,0x41,0x41,0x41,0x3E}, // O
  {0x7F,0x09,0x19,0x29,0x46}, // R
  {0x46,0x49,0x49,0x49,0x31}, // S
  {0x01,0x01,0x7F,0x01,0x01}, // T
  {0x3F,0x40,0x40,0x40,0x3F}, // U
  {0x3F,0x40,0x38,0x40,0x3F}, // W
  {0x00,0x00,0x00,0x00,0x00}, // space
  {0x00,0x36,0x36,0x00,0x00}, // :
  {0x00,0x60,0x60,0x00,0x00}, // .
};

static int8_t glyph(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  switch (c) {
    case 'A': return 10; case 'B': return 11; case 'C': return 12;
    case 'E': return 13; case 'G': return 14; case 'K': return 15;
    case 'L': return 16; case 'M': return 17; case 'N': return 18;
    case 'O': return 19; case 'R': return 20; case 'S': return 21;
    case 'T': return 22; case 'U': return 23; case 'W': return 24;
    case ':': return 26; case '.': return 27;
    default:  return 25; // space
  }
}

// 128 cols × 8 pages framebuffer (1 KB).
static uint8_t fb[1024];

static void cmd(uint8_t c) {
  Wire.beginTransmission(OLED_ADDR);
  Wire.write(0x00); Wire.write(c);
  Wire.endTransmission();
}
static void cmd2(uint8_t c, uint8_t a) {
  Wire.beginTransmission(OLED_ADDR);
  Wire.write(0x00); Wire.write(c); Wire.write(a);
  Wire.endTransmission();
}

static void oledInit() {
  delay(50);
  cmd(0xAE);
  cmd2(0xD5, 0x80); cmd2(0xA8, 0x3F); cmd2(0xD3, 0x00);
  cmd(0x40);        cmd2(0x8D, 0x14); cmd2(0x20, 0x00);
  cmd(0xA1);        cmd(0xC8);
  cmd2(0xDA, 0x12); cmd2(0x81, 0xCF);
  cmd2(0xD9, 0xF1); cmd2(0xDB, 0x40);
  cmd(0xA4);        cmd(0xA6);        cmd(0xAF);
}

static void oledFlush() {
  cmd2(0x21, 0); cmd(127);
  cmd2(0x22, 0); cmd(7);
  for (uint16_t i = 0; i < 1024; i += 16) {
    Wire.beginTransmission(OLED_ADDR);
    Wire.write(0x40);
    for (uint8_t j = 0; j < 16; j++) Wire.write(fb[i + j]);
    Wire.endTransmission();
  }
}

static void clearFB() { memset(fb, 0, sizeof(fb)); }

static void setPixel(uint8_t x, uint8_t y) {
  if (x >= 128 || y >= 64) return;
  fb[(y >> 3) * 128 + x] |= (1 << (y & 7));
}

static void drawChar(uint8_t x, uint8_t y, char c, uint8_t s) {
  int8_t g = glyph(c);
  for (uint8_t col = 0; col < 5; col++) {
    uint8_t bits = pgm_read_byte(&FONT5x7[g][col]);
    for (uint8_t row = 0; row < 7; row++) {
      if (bits & (1 << row)) {
        for (uint8_t sx = 0; sx < s; sx++)
          for (uint8_t sy = 0; sy < s; sy++)
            setPixel(x + col * s + sx, y + row * s + sy);
      }
    }
  }
}

static void drawText(uint8_t x, uint8_t y, const char *str, uint8_t s) {
  while (*str) { drawChar(x, y, *str++, s); x += 6 * s; }
}

static void drawRect(uint8_t x, uint8_t y, uint8_t w, uint8_t h) {
  for (uint8_t i = 0; i < w; i++) { setPixel(x + i, y); setPixel(x + i, y + h - 1); }
  for (uint8_t i = 0; i < h; i++) { setPixel(x, y + i); setPixel(x + w - 1, y + i); }
}

static void fillRect(uint8_t x, uint8_t y, uint8_t w, uint8_t h) {
  for (uint8_t j = 0; j < h; j++)
    for (uint8_t i = 0; i < w; i++) setPixel(x + i, y + j);
}

void setup() {
  Wire.begin();
  Serial.begin(9600);
  oledInit();

  clearFB();
  drawText(22, 8, "LOVABLE", 1);
  drawText(8,  28, "OLED 128 64", 1);
  drawText(34, 48, "READY", 1);
  oledFlush();
  delay(900);
}

void loop() {
  static uint16_t n = 0;
  clearFB();

  // Header
  drawText(0, 0, "COUNT:", 1);
  char buf[8];
  snprintf(buf, sizeof(buf), "%05u", n);
  drawText(40, 0, buf, 1);

  // Big number in the middle (3x scale)
  snprintf(buf, sizeof(buf), "%03u", n % 1000);
  drawText(34, 18, buf, 3);

  // Bouncing bar in a frame at the bottom
  drawRect(0, 54, 128, 10);
  uint8_t cyc = (n * 3) % 240;
  uint8_t pos = cyc > 120 ? 240 - cyc : cyc;
  fillRect(2 + pos, 56, 8, 6);

  oledFlush();
  Serial.print("frame "); Serial.println(n);
  n++;
  delay(80);
}
`,
    components: [
      BOARD("uno1", 40, 40),
      { id: "oled1", kind: "oled", x: 1080, y: 220, rotation: 0, props: {} },
    ],
    wires: [
      { id: "w1", from: { componentId: "uno1", pinId: "5V"   }, to: { componentId: "oled1", pinId: "VCC" } },
      { id: "w2", from: { componentId: "uno1", pinId: "GND1" }, to: { componentId: "oled1", pinId: "GND" } },
      { id: "w3", from: { componentId: "uno1", pinId: "A4"   }, to: { componentId: "oled1", pinId: "SDA" } },
      { id: "w4", from: { componentId: "uno1", pinId: "A5"   }, to: { componentId: "oled1", pinId: "SCL" } },
    ],
  },
];
