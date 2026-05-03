// Arduino Uno pin layout calibrated to the embedded PNG (960x704 viewBox).
// Coordinates are pixel positions within that viewBox so wires snap to the
// actual header sockets in the illustration. Centers were measured directly
// from the source PNG by detecting the dark socket pixel runs.

export interface BoardPin {
  id: string;
  label: string;
  kind: "digital" | "analog" | "power" | "ground" | "other";
  x: number;
  y: number;
  /** the Arduino pin number for digital/analog (0..13 for D, 14..19 for A0..A5 mapped) */
  number?: number;
}

export const UNO_WIDTH = 960;
export const UNO_HEIGHT = 704;

const TOP_Y = 50;
const BOTTOM_Y = 685;

// Measured top-header socket X centers (left → right):
//   AREF, GND, D13, D12, D11, D10, D9, D8, [gap], D7, D6, D5, D4, D3, D2, D1, D0
const TOP_X: Record<string, number> = {
  AREF: 362, GND_TOP: 392,
  D13: 422, D12: 453, D11: 483, D10: 513, D9: 544, D8: 574,
  D7: 653, D6: 683, D5: 714, D4: 744, D3: 774, D2: 805, D1: 835, D0: 865,
};

const digitalPins: BoardPin[] = [];
for (let i = 0; i <= 13; i++) {
  digitalPins.push({
    id: `D${i}`,
    label: `D${i}`,
    kind: "digital",
    number: i,
    x: TOP_X[`D${i}`],
    y: TOP_Y,
  });
}
digitalPins.push({ id: "GND_TOP", label: "GND",  kind: "ground", x: TOP_X.GND_TOP, y: TOP_Y });
digitalPins.push({ id: "AREF",    label: "AREF", kind: "other",  x: TOP_X.AREF,    y: TOP_Y });

// Measured bottom-header socket X centers (POWER block then ANALOG IN block).
const powerPins: BoardPin[] = [
  { id: "IOREF", label: "IOREF", kind: "other",  x: 441, y: BOTTOM_Y },
  { id: "RESET", label: "RST",   kind: "other",  x: 471, y: BOTTOM_Y },
  { id: "3V3",   label: "3.3V",  kind: "power",  x: 502, y: BOTTOM_Y },
  { id: "5V",    label: "5V",    kind: "power",  x: 532, y: BOTTOM_Y },
  { id: "GND1",  label: "GND",   kind: "ground", x: 562, y: BOTTOM_Y },
  { id: "GND2",  label: "GND",   kind: "ground", x: 592, y: BOTTOM_Y },
  { id: "VIN",   label: "VIN",   kind: "power",  x: 623, y: BOTTOM_Y },
];

const ANALOG_X = [714, 744, 774, 805, 835, 865];
const analogPins: BoardPin[] = ANALOG_X.map((x, i) => ({
  id: `A${i}`,
  label: `A${i}`,
  kind: "analog",
  number: 14 + i,
  x,
  y: BOTTOM_Y,
}));

export const UNO_PINS: BoardPin[] = [...digitalPins, ...powerPins, ...analogPins];

export function findUnoPin(id: string) {
  return UNO_PINS.find((p) => p.id === id);
}
