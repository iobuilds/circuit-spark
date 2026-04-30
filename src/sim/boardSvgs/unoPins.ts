// Realistic Arduino Uno pin layout, mapped to the embedded PNG illustration
// (UNO_SVG, viewBox 960x704). Coordinates align with the header sockets in
// the image so wires snap to the right holes.

import type { VisualPin } from "@/sim/adminStore";

const TOP_Y = 92;
const BOTTOM_Y = 648;
const PITCH = 35;
const LEFT_BLOCK_X = 287;   // D13
const RIGHT_BLOCK_X = 542;  // D7
const A0_X = 645;

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

function topDigitalX(num: number): number {
  if (num <= 7) return RIGHT_BLOCK_X + (7 - num) * PITCH;
  return LEFT_BLOCK_X + (13 - num) * PITCH;
}

function digital(num: number): VisualPin {
  const isPwm = PWM_PINS.has(num);
  const type: VisualPin["type"] = isPwm ? "pwm" : "digital";
  return {
    id: `D${num}`,
    label: isPwm ? `~${num}` : `${num}`,
    type,
    number: num,
    x: topDigitalX(num),
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
    x: A0_X + idx * PITCH,
    y: BOTTOM_Y,
    color: COLOR.analog,
  };
}

export function defaultUnoPins(): VisualPin[] {
  const pins: VisualPin[] = [];

  // Top header — D0..D13
  for (let i = 0; i <= 13; i++) pins.push(digital(i));

  // GND + AREF (to the left of D13)
  pins.push({
    id: "GND_TOP", label: "GND", type: "ground",
    x: 253, y: TOP_Y, color: COLOR.ground,
  });
  pins.push({
    id: "AREF", label: "AREF", type: "other",
    x: 218, y: TOP_Y, color: COLOR.other,
  });

  // Bottom power block
  const power: VisualPin[] = [
    { id: "IOREF", label: "IOREF", type: "other",  x: 360, y: BOTTOM_Y, color: COLOR.other },
    { id: "RESET", label: "RST",   type: "other",  x: 395, y: BOTTOM_Y, color: COLOR.other },
    { id: "3V3",   label: "3.3V",  type: "power",  x: 430, y: BOTTOM_Y, color: COLOR.power },
    { id: "5V",    label: "5V",    type: "power",  x: 465, y: BOTTOM_Y, color: COLOR.power },
    { id: "GND1",  label: "GND",   type: "ground", x: 500, y: BOTTOM_Y, color: COLOR.ground },
    { id: "GND2",  label: "GND",   type: "ground", x: 535, y: BOTTOM_Y, color: COLOR.ground },
    { id: "VIN",   label: "VIN",   type: "power",  x: 570, y: BOTTOM_Y, color: COLOR.power },
  ];
  pins.push(...power);

  // Bottom analog A0..A5
  for (let i = 0; i <= 5; i++) pins.push(analog(i));

  return pins;
}
