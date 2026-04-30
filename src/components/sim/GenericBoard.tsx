// Generic dev-board renderer used for non-Uno selections. Draws a simple PCB
// rectangle with header strips derived from the board's digital/analog pin
// counts. Pins are clickable so users can wire them.
//
// Pin numbering convention matches the simulator: digital pins start at 0,
// analog pins use indices 14..(14+analogPins-1) for `pinStates` lookup.

import { useSimStore } from "@/sim/store";
import { useAdminStore } from "@/sim/adminStore";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  boardId: string;
  x: number;
  y: number;
  highlightPin?: string;
  onPinClick?: (pinId: string, e: React.MouseEvent) => void;
  onPinHover?: (pin: BoardPinLite | null, e?: React.MouseEvent) => void;
}

export interface BoardPinLite {
  id: string;
  label: string;
  number?: number;
  kind: "digital" | "analog" | "power" | "ground" | "other";
  x: number;
  y: number;
}

const PITCH = 12;
const TOP_Y = 14;
const BOTTOM_Y = 196;

function deriveLayout(digital: number, analog: number) {
  // Cap visual pin count so very large boards (Mega 54) still fit.
  const dShown = Math.min(digital, 24);
  const width = Math.max(220, 60 + dShown * PITCH + 40);
  const height = 210;

  const pins: BoardPinLite[] = [];
  // Top header: digital pins 0..dShown-1
  for (let i = 0; i < dShown; i++) {
    pins.push({
      id: `D${i}`,
      label: `D${i}`,
      number: i,
      kind: "digital",
      x: 30 + i * PITCH,
      y: TOP_Y,
    });
  }
  pins.push({ id: "GND_TOP", label: "GND", kind: "ground", x: 30 + dShown * PITCH + 4, y: TOP_Y });

  // Bottom-left: power pins
  const powerLabels: Array<[string, BoardPinLite["kind"], string]> = [
    ["IOREF", "other", "IOR"],
    ["RESET", "other", "RST"],
    ["3V3", "power", "3V3"],
    ["5V", "power", "5V"],
    ["GND1", "ground", "GND"],
    ["GND2", "ground", "GND"],
    ["VIN", "power", "VIN"],
  ];
  powerLabels.forEach(([id, kind, label], i) => {
    pins.push({ id, label, kind, x: 30 + i * PITCH, y: BOTTOM_Y });
  });

  // Bottom-right: analog pins A0..A(analog-1)
  const aShown = Math.min(analog, 16);
  const aStart = 30 + powerLabels.length * PITCH + 16;
  for (let i = 0; i < aShown; i++) {
    pins.push({
      id: `A${i}`,
      label: `A${i}`,
      number: 14 + i,
      kind: "analog",
      x: aStart + i * PITCH,
      y: BOTTOM_Y,
    });
  }

  return { width, height, pins };
}

export function GenericBoard({ boardId, x, y, highlightPin, onPinClick, onPinHover }: Props) {
  const pinStates = useSimStore((s) => s.pinStates);
  const boards = useAdminStore((s) => s.boards);
  const loaded = useAdminStore((s) => s.loaded);
  const hydrate = useAdminStore((s) => s.hydrate);
  useEffect(() => { if (!loaded) hydrate(); }, [loaded, hydrate]);

  const board = useMemo(() => boards.find((b) => b.id === boardId), [boards, boardId]);

  const layout = useMemo(() => {
    return deriveLayout(board?.digitalPins ?? 14, board?.analogPins ?? 6);
  }, [board?.digitalPins, board?.analogPins]);

  const pcbColor =
    boardId === "esp32" || boardId === "esp8266"
      ? "oklch(0.42 0.15 25)"   // red-ish
      : boardId === "stm32"
      ? "oklch(0.4 0.10 250)"   // blue
      : boardId === "pico"
      ? "oklch(0.92 0.02 250)"  // white
      : "oklch(0.42 0.10 165)"; // teal default

  return (
    <g transform={`translate(${x} ${y})`}>
      {/* PCB body */}
      <rect
        x={0}
        y={0}
        width={layout.width}
        height={layout.height}
        rx={10}
        fill={pcbColor}
        stroke="oklch(0.18 0.02 250)"
        strokeWidth={1.5}
      />
      {/* Header strips */}
      <rect x={20} y={TOP_Y - 8} width={layout.width - 40} height={14} rx={2}
        fill="oklch(0.10 0.01 250)" />
      <rect x={20} y={BOTTOM_Y - 6} width={layout.width - 40} height={14} rx={2}
        fill="oklch(0.10 0.01 250)" />

      {/* Board name */}
      <text
        x={layout.width / 2}
        y={layout.height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={14}
        fontWeight={800}
        fontFamily="'Helvetica Neue', Arial, sans-serif"
        fill="oklch(1 0 0 / 0.85)"
        letterSpacing="2"
      >
        {board?.name ?? boardId.toUpperCase()}
      </text>
      <text
        x={layout.width / 2}
        y={layout.height / 2 + 16}
        textAnchor="middle"
        fontSize={7}
        fontFamily="monospace"
        fill="oklch(1 0 0 / 0.7)"
      >
        {board?.mcu ?? ""}
      </text>

      {/* Silkscreen labels */}
      <g
        fontFamily="monospace"
        fontSize={4}
        fill="oklch(1 0 0 / 0.85)"
        textAnchor="middle"
      >
        {layout.pins.map((p) => (
          <text key={`lbl-${p.id}`} x={p.x} y={p.y === TOP_Y ? p.y - 9 : p.y + 12}>
            {p.label}
          </text>
        ))}
      </g>

      {/* Interactive pin hit-targets */}
      {layout.pins.map((pin) => {
        const isOutput = pin.number !== undefined && pinStates[pin.number]?.digital === 1;
        const isHi = highlightPin === pin.id;
        return (
          <g key={pin.id} transform={`translate(${pin.x} ${pin.y})`}>
            <circle
              r={4}
              fill={isOutput ? "var(--color-pin-active)" : "var(--color-pin)"}
              fillOpacity={0.9}
              stroke={isHi ? "var(--color-primary)" : "oklch(0.15 0 0)"}
              strokeWidth={isHi ? 2 : 0.8}
              className={cn("cursor-crosshair transition-all", isOutput && "led-glow-yellow")}
              onMouseDown={(e) => { e.stopPropagation(); onPinClick?.(pin.id, e); }}
              onMouseEnter={(e) => onPinHover?.(pin, e)}
              onMouseLeave={(e) => onPinHover?.(null, e)}
            />
          </g>
        );
      })}
    </g>
  );
}
