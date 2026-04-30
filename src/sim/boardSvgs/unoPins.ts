// Realistic Arduino Uno pin layout, mapped to the UNO_SVG coordinate space
// (viewBox 360x240). Coordinates align exactly with the header sockets drawn
// in src/sim/boardSvgs/unoSvg.ts so wires snap to the right holes.
//
// Top header (y=18):
//   D0..D13 at x = 95 + i*14, then GND at i=14, AREF at i=15.
//
// Bottom power header (y=222, left block): IOREF, RESET, 3.3V, 5V, GND, GND, VIN
//   x positions: 100, 114, 128, 142, 156, 170, 184.
//
// Bottom analog header (y=222, right block): A0..A5 at x = 240 + i*14.

import type { VisualPin } from "@/sim/adminStore";

const TOP_Y = 18;
const BOTTOM_Y = 222;
const PITCH = 14;
const D_START_X = 95;
const A_START_X = 240;

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

function digital(num: number): VisualPin {
  const isPwm = PWM_PINS.has(num);
  const type: VisualPin["type"] = isPwm ? "pwm" : "digital";
  return {
    id: `D${num}`,
    label: isPwm ? `~${num}` : `${num}`,
    type,
    number: num,
    x: D_START_X + num * PITCH,
    y: TOP_Y,
    color: COLOR[type],
  };
}

function analog(idx: number): VisualPin {
  return {
    id: `A${idx}`,
    label: `A${idx}`,
    type: "analog",
    number: 14 + idx,
    x: A_START_X + idx * PITCH,
    y: BOTTOM_Y,
    color: COLOR.analog,
  };
}

export function defaultUnoPins(): VisualPin[] {
  const pins: VisualPin[] = [];

  // Top header — D0..D13
  for (let i = 0; i <= 13; i++) pins.push(digital(i));

  // GND + AREF after D13
  pins.push({
    id: "GND_TOP", label: "GND", type: "ground",
    x: D_START_X + 14 * PITCH, y: TOP_Y, color: COLOR.ground,
  });
  pins.push({
    id: "AREF", label: "AREF", type: "other",
    x: D_START_X + 15 * PITCH, y: TOP_Y, color: COLOR.other,
  });

  // Bottom power block
  const power: VisualPin[] = [
    { id: "IOREF", label: "IOREF", type: "other",  x: 100, y: BOTTOM_Y, color: COLOR.other },
    { id: "RESET", label: "RST",   type: "other",  x: 114, y: BOTTOM_Y, color: COLOR.other },
    { id: "3V3",   label: "3.3V",  type: "power",  x: 128, y: BOTTOM_Y, color: COLOR.power },
    { id: "5V",    label: "5V",    type: "power",  x: 142, y: BOTTOM_Y, color: COLOR.power },
    { id: "GND1",  label: "GND",   type: "ground", x: 156, y: BOTTOM_Y, color: COLOR.ground },
    { id: "GND2",  label: "GND",   type: "ground", x: 170, y: BOTTOM_Y, color: COLOR.ground },
    { id: "VIN",   label: "VIN",   type: "power",  x: 184, y: BOTTOM_Y, color: COLOR.power },
  ];
  pins.push(...power);

  // Bottom analog A0..A5
  for (let i = 0; i <= 5; i++) pins.push(analog(i));

  return pins;
}
