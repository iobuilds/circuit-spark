// Arduino Uno pin layout calibrated to the embedded PNG (960x704 viewBox).
// Coordinates are pixel positions within that viewBox so wires snap to the
// actual header sockets in the illustration.

export interface BoardPin {
  id: string;        // e.g. "D0", "D13", "A0", "5V", "GND", "RESET"
  label: string;
  kind: "digital" | "analog" | "power" | "ground" | "other";
  x: number;
  y: number;
  /** the Arduino pin number for digital/analog (0..13 for D, 14..19 for A0..A5 mapped) */
  number?: number;
}

export const UNO_WIDTH = 960;
export const UNO_HEIGHT = 704;

// Top digital header: pins read 13..8 (left block) then 7..0 (right block).
// Pitch ≈ 35px. Left block starts at x≈287 (D13). Right block at x≈542 (D7).
const TOP_Y = 92;
const PITCH = 35;
const LEFT_BLOCK_X = 287;   // D13
const RIGHT_BLOCK_X = 542;  // D7

function topDigitalX(num: number): number {
  // num: 0..13. Right block: 0..7 → D7..D0 left→right. Left block: 8..13 → D13..D8 left→right.
  if (num <= 7) {
    // D7 at RIGHT_BLOCK_X, D0 at RIGHT_BLOCK_X + 7*PITCH
    return RIGHT_BLOCK_X + (7 - num) * PITCH;
  }
  // D13 at LEFT_BLOCK_X, D8 at LEFT_BLOCK_X + 5*PITCH
  return LEFT_BLOCK_X + (13 - num) * PITCH;
}

const digitalPins: BoardPin[] = [];
for (let i = 0; i <= 13; i++) {
  digitalPins.push({
    id: `D${i}`,
    label: `D${i}`,
    kind: "digital",
    number: i,
    x: topDigitalX(i),
    y: TOP_Y,
  });
}
// GND + AREF sit to the LEFT of D13 in the same top header strip.
digitalPins.push({ id: "GND_TOP", label: "GND",  kind: "ground", x: 253, y: TOP_Y });
digitalPins.push({ id: "AREF",    label: "AREF", kind: "other",  x: 218, y: TOP_Y });

// Bottom headers, y≈648.
const BOTTOM_Y = 648;

// Power header (left block on the bottom).
const powerPins: BoardPin[] = [
  { id: "IOREF", label: "IOREF", kind: "other",  x: 360, y: BOTTOM_Y },
  { id: "RESET", label: "RST",   kind: "other",  x: 395, y: BOTTOM_Y },
  { id: "3V3",   label: "3.3V",  kind: "power",  x: 430, y: BOTTOM_Y },
  { id: "5V",    label: "5V",    kind: "power",  x: 465, y: BOTTOM_Y },
  { id: "GND1",  label: "GND",   kind: "ground", x: 500, y: BOTTOM_Y },
  { id: "GND2",  label: "GND",   kind: "ground", x: 535, y: BOTTOM_Y },
  { id: "VIN",   label: "VIN",   kind: "power",  x: 570, y: BOTTOM_Y },
];

// Analog header (right block on the bottom). A0..A5 left→right.
const analogPins: BoardPin[] = [];
const A0_X = 645;
for (let i = 0; i <= 5; i++) {
  analogPins.push({
    id: `A${i}`,
    label: `A${i}`,
    kind: "analog",
    number: 14 + i,
    x: A0_X + i * PITCH,
    y: BOTTOM_Y,
  });
}

export const UNO_PINS: BoardPin[] = [...digitalPins, ...powerPins, ...analogPins];

export function findUnoPin(id: string) {
  return UNO_PINS.find((p) => p.id === id);
}
