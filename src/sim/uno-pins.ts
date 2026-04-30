// Arduino Uno SVG pin layout. Coordinates are in board-local units (matches the SVG viewBox).
// Board SVG is 360 wide x 240 tall.

export interface BoardPin {
  id: string;        // e.g. "D0", "D13", "A0", "5V", "GND", "RESET"
  label: string;
  kind: "digital" | "analog" | "power" | "ground" | "other";
  x: number;
  y: number;
  /** the Arduino pin number for digital/analog (0..13 for D, 14..19 for A0..A5 mapped) */
  number?: number;
}

export const UNO_WIDTH = 360;
export const UNO_HEIGHT = 240;

// Top header: D0..D13 + GND + AREF (right to left in real board, but we lay out left to right)
// Bottom header: power pins + A0..A5
const topY = 18;
const bottomY = 222;

const digitalPins: BoardPin[] = [];
// Right block on top: D8..D13 + GND + AREF + SDA(SCL share with A4/A5)
// We'll just lay D0..D13 evenly across the top, two groups separated by a gap.
const dStartX = 95;
for (let i = 0; i <= 13; i++) {
  const groupGap = i >= 8 ? 14 : 0;
  digitalPins.push({
    id: `D${i}`,
    label: `D${i}`,
    kind: "digital",
    number: i,
    x: dStartX + i * 14 + groupGap,
    y: topY,
  });
}
// GND + AREF after D13
digitalPins.push({ id: "GND_TOP", label: "GND", kind: "ground", x: dStartX + 14 * 14 + 14, y: topY });
digitalPins.push({ id: "AREF", label: "AREF", kind: "other", x: dStartX + 15 * 14 + 14, y: topY });

const analogPins: BoardPin[] = [];
for (let i = 0; i <= 5; i++) {
  analogPins.push({
    id: `A${i}`,
    label: `A${i}`,
    kind: "analog",
    number: 14 + i,
    x: 240 + i * 14,
    y: bottomY,
  });
}

const powerPins: BoardPin[] = [
  { id: "VIN", label: "VIN", kind: "power", x: 100, y: bottomY },
  { id: "GND1", label: "GND", kind: "ground", x: 114, y: bottomY },
  { id: "GND2", label: "GND", kind: "ground", x: 128, y: bottomY },
  { id: "5V", label: "5V", kind: "power", x: 142, y: bottomY },
  { id: "3V3", label: "3.3V", kind: "power", x: 156, y: bottomY },
  { id: "RESET", label: "RST", kind: "other", x: 170, y: bottomY },
  { id: "IOREF", label: "IOREF", kind: "other", x: 184, y: bottomY },
];

export const UNO_PINS: BoardPin[] = [...digitalPins, ...powerPins, ...analogPins];

export function findUnoPin(id: string) {
  return UNO_PINS.find((p) => p.id === id);
}
