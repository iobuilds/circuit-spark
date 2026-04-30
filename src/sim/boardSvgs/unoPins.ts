// Default visual pins for the built-in Arduino Uno board, derived from the
// realistic SVG layout. Coordinates are in the Uno SVG user-space (360x240).
import type { VisualPin } from "@/sim/adminStore";
import { UNO_PINS } from "@/sim/uno-pins";

const KIND_TO_TYPE: Record<string, VisualPin["type"]> = {
  digital: "digital",
  analog: "analog",
  power: "power",
  ground: "ground",
  other: "other",
};

const COLORS: Record<VisualPin["type"], string> = {
  digital: "#22c55e",
  analog: "#3b82f6",
  pwm: "#a855f7",
  power: "#ef4444",
  ground: "#111827",
  "i2c-sda": "#f59e0b",
  "i2c-scl": "#f59e0b",
  spi: "#06b6d4",
  uart: "#ec4899",
  other: "#6b7280",
};

export function defaultUnoPins(): VisualPin[] {
  return UNO_PINS.map((p) => {
    const type = KIND_TO_TYPE[p.kind] ?? "other";
    return {
      id: p.id,
      label: p.label,
      type,
      number: p.number,
      x: p.x,
      y: p.y,
      color: COLORS[type],
    };
  });
}
