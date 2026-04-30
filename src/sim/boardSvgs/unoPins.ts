// Realistic Arduino Uno pin layout, mapped to the GLB top-view coordinate space
// used by the 3D pin editor (TOP_W=1000, TOP_H=700). Origin is top-left of the
// board's bounding box in the orthographic top view.
//
// Layout (USB on the LEFT, power jack on the LEFT-bottom):
//   - Top header (Y ~= 95):   D8..D13 + GND + AREF + SDA + SCL  (right block)
//                             D0..D7                              (left block)
//   - Bottom header (Y ~= 605):
//       Power block (left): IOREF, RESET, 3.3V, 5V, GND, GND, VIN
//       Analog block (right): A0..A5
//
// Coordinates were chosen to align visually with the imported uno.glb top view.
import type { VisualPin } from "@/sim/adminStore";

const TOP_Y = 95;
const BOTTOM_Y = 605;

// Header pin pitch in top-view units (~36 units per 0.1" pin pitch on this board).
const PITCH = 36;

const COLOR: Record<VisualPin["type"], string> = {
  digital: "#22c55e",
  analog:  "#3b82f6",
  pwm:     "#a855f7",
  power:   "#ef4444",
  ground:  "#111827",
  "i2c-sda": "#f59e0b",
  "i2c-scl": "#f59e0b",
  spi:     "#06b6d4",
  uart:    "#ec4899",
  other:   "#6b7280",
};

const PWM_PINS = new Set([3, 5, 6, 9, 10, 11]);

function digital(num: number, x: number): VisualPin {
  const isPwm = PWM_PINS.has(num);
  const type: VisualPin["type"] = isPwm ? "pwm" : "digital";
  return {
    id: `D${num}`,
    label: isPwm ? `~${num}` : `${num}`,
    type,
    number: num,
    x,
    y: TOP_Y,
    color: COLOR[type],
  };
}

function analog(idx: number, x: number): VisualPin {
  return {
    id: `A${idx}`,
    label: `A${idx}`,
    type: "analog",
    number: 14 + idx,
    x,
    y: BOTTOM_Y,
    color: COLOR.analog,
  };
}

export function defaultUnoPins(): VisualPin[] {
  const pins: VisualPin[] = [];

  // Top header — left block: D0(RX), D1(TX), D2..D7
  // Right block: D8..D13, GND, AREF, SDA, SCL
  // The two blocks have a small gap in the middle (around the strain-relief notch).
  const leftStart = 360;   // x of D0
  const rightStart = 660;  // x of D8 (after the gap)

  // Left block D0..D7 (right-to-left on real board, but in top-view we lay
  // increasing pin number from LEFT to RIGHT to match the GLB orientation).
  for (let i = 0; i <= 7; i++) {
    pins.push(digital(i, leftStart + i * PITCH));
  }
  // Right block D8..D13
  for (let i = 8; i <= 13; i++) {
    pins.push(digital(i, rightStart + (i - 8) * PITCH));
  }
  // GND, AREF, SDA, SCL after D13
  const afterD13 = rightStart + 6 * PITCH;
  pins.push({
    id: "GND_TOP", label: "GND", type: "ground",
    x: afterD13, y: TOP_Y, color: COLOR.ground,
  });
  pins.push({
    id: "AREF", label: "AREF", type: "other",
    x: afterD13 + PITCH, y: TOP_Y, color: COLOR.other,
  });
  pins.push({
    id: "SDA", label: "SDA", type: "i2c-sda",
    x: afterD13 + 2 * PITCH, y: TOP_Y, color: COLOR["i2c-sda"],
  });
  pins.push({
    id: "SCL", label: "SCL", type: "i2c-scl",
    x: afterD13 + 3 * PITCH, y: TOP_Y, color: COLOR["i2c-scl"],
  });

  // Bottom header — power block (left): IOREF, RESET, 3.3V, 5V, GND, GND, VIN
  const powerStart = 200;
  const power: VisualPin[] = [
    { id: "IOREF", label: "IOREF", type: "other",  x: powerStart + 0 * PITCH, y: BOTTOM_Y, color: COLOR.other },
    { id: "RESET", label: "RST",   type: "other",  x: powerStart + 1 * PITCH, y: BOTTOM_Y, color: COLOR.other },
    { id: "3V3",   label: "3.3V",  type: "power",  x: powerStart + 2 * PITCH, y: BOTTOM_Y, color: COLOR.power },
    { id: "5V",    label: "5V",    type: "power",  x: powerStart + 3 * PITCH, y: BOTTOM_Y, color: COLOR.power },
    { id: "GND1",  label: "GND",   type: "ground", x: powerStart + 4 * PITCH, y: BOTTOM_Y, color: COLOR.ground },
    { id: "GND2",  label: "GND",   type: "ground", x: powerStart + 5 * PITCH, y: BOTTOM_Y, color: COLOR.ground },
    { id: "VIN",   label: "VIN",   type: "power",  x: powerStart + 6 * PITCH, y: BOTTOM_Y, color: COLOR.power },
  ];
  pins.push(...power);

  // Bottom header — analog block (right): A0..A5
  const analogStart = 660;
  for (let i = 0; i <= 5; i++) {
    pins.push(analog(i, analogStart + i * PITCH));
  }

  return pins;
}
