// Realistic Arduino Uno pin layout, mapped to the embedded PNG illustration
// (UNO_SVG, viewBox 960x704). X centers measured directly from the PNG socket
// positions so wires snap to the right holes.

import type { VisualPin } from "@/sim/adminStore";

const TOP_Y = 50;
const BOTTOM_Y = 685;

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

const TOP_X: Record<number, number> = {
  13: 422, 12: 453, 11: 483, 10: 513, 9: 544, 8: 574,
  7: 653, 6: 683, 5: 714, 4: 744, 3: 774, 2: 805, 1: 835, 0: 865,
};

function digital(num: number): VisualPin {
  const isPwm = PWM_PINS.has(num);
  const type: VisualPin["type"] = isPwm ? "pwm" : "digital";
  return {
    id: `D${num}`,
    label: isPwm ? `~${num}` : `${num}`,
    type,
    number: num,
    x: TOP_X[num],
    y: TOP_Y,
    color: COLOR[type],
  };
}

const ANALOG_X = [714, 744, 774, 805, 835, 865];

function analog(idx: number): VisualPin {
  return {
    id: `A${idx}`,
    label: `A${idx}`,
    type: "analog",
    number: 14 + idx,
    x: ANALOG_X[idx],
    y: BOTTOM_Y,
    color: COLOR.analog,
  };
}

export function defaultUnoPins(): VisualPin[] {
  const pins: VisualPin[] = [];

  for (let i = 0; i <= 13; i++) pins.push(digital(i));

  pins.push({
    id: "GND_TOP", label: "GND", type: "ground",
    x: 392, y: TOP_Y, color: COLOR.ground,
  });
  pins.push({
    id: "AREF", label: "AREF", type: "other",
    x: 362, y: TOP_Y, color: COLOR.other,
  });

  const power: VisualPin[] = [
    { id: "IOREF", label: "IOREF", type: "other",  x: 441, y: BOTTOM_Y, color: COLOR.other },
    { id: "RESET", label: "RST",   type: "other",  x: 471, y: BOTTOM_Y, color: COLOR.other },
    { id: "3V3",   label: "3.3V",  type: "power",  x: 502, y: BOTTOM_Y, color: COLOR.power },
    { id: "5V",    label: "5V",    type: "power",  x: 532, y: BOTTOM_Y, color: COLOR.power },
    { id: "GND1",  label: "GND",   type: "ground", x: 562, y: BOTTOM_Y, color: COLOR.ground },
    { id: "GND2",  label: "GND",   type: "ground", x: 592, y: BOTTOM_Y, color: COLOR.ground },
    { id: "VIN",   label: "VIN",   type: "power",  x: 623, y: BOTTOM_Y, color: COLOR.power },
  ];
  pins.push(...power);

  for (let i = 0; i <= 5; i++) pins.push(analog(i));

  return pins;
}
