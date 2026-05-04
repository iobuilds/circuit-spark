import { UNO_PINS, UNO_WIDTH, UNO_HEIGHT, type BoardPin } from "@/sim/uno-pins";
import { useSimStore } from "@/sim/store";
import { useAdminStore, type VisualPin } from "@/sim/adminStore";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  x: number;
  y: number;
  highlightPin?: string;
  onPinClick?: (pinId: string, e: React.MouseEvent) => void;
  onPinHover?: (pin: BoardPin | null, e?: React.MouseEvent) => void;
  /** Click handler for the ATmega328P IC — opens the chip inspector. */
  onChipClick?: (e: React.MouseEvent) => void;
}

/** Map a VisualPin (admin schema) to the coarse BoardPin kind expected by the
 *  rest of the simulator UI (hover popup, etc.). */
function visualKind(type: VisualPin["type"]): BoardPin["kind"] {
  switch (type) {
    case "digital":
    case "pwm":
      return "digital";
    case "analog":
      return "analog";
    case "power":
      return "power";
    case "ground":
      return "ground";
    default:
      return "other";
  }
}

/** Default fill color when a VisualPin has no explicit color. Mirrors the
 *  palette used by the admin SvgPinEditor so the user view stays in sync. */
const TYPE_COLOR: Record<VisualPin["type"], string> = {
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

interface RenderPin {
  id: string;
  label: string;
  kind: BoardPin["kind"];
  x: number;
  y: number;
  number?: number;
  color: string;
}

function fromVisual(p: VisualPin): RenderPin {
  return {
    id: p.id,
    label: p.label,
    kind: visualKind(p.type),
    x: p.x,
    y: p.y,
    number: p.number,
    color: p.color || TYPE_COLOR[p.type] || TYPE_COLOR.other,
  };
}

function fromBoardPin(p: BoardPin): RenderPin {
  // Static fallback — colour by kind for parity with the admin editor.
  const colorMap: Record<BoardPin["kind"], string> = {
    digital: TYPE_COLOR.digital,
    analog:  TYPE_COLOR.analog,
    power:   TYPE_COLOR.power,
    ground:  TYPE_COLOR.ground,
    other:   TYPE_COLOR.other,
  };
  return { ...p, color: colorMap[p.kind] };
}

export function ArduinoUnoBoard({ x, y, highlightPin, onPinClick, onPinHover, onChipClick }: Props) {
  const pinStates = useSimStore((s) => s.pinStates);
  const boards = useAdminStore((s) => s.boards);
  const loaded = useAdminStore((s) => s.loaded);
  const hydrate = useAdminStore((s) => s.hydrate);

  useEffect(() => { if (!loaded) hydrate(); }, [loaded, hydrate]);

  const uno = useMemo(() => boards.find((b) => b.id === "uno"), [boards]);

  // Strip outer <svg> wrapper so we can embed the inner content into the parent canvas SVG.
  const innerSvg = useMemo(() => {
    if (!uno?.svg) return null;
    const m = uno.svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    return m ? m[1] : null;
  }, [uno?.svg]);

  // Pins: live from the admin store (so admin edits are reflected immediately),
  // falling back to the static layout if the entry hasn't hydrated yet.
  const pins: RenderPin[] = useMemo(() => {
    if (uno?.pins && uno.pins.length > 0) return uno.pins.map(fromVisual);
    return UNO_PINS.map(fromBoardPin);
  }, [uno?.pins]);

  // Light up the on-board "L" LED (D13) by overlaying a glowing circle when output is HIGH.
  const ledOn = pinStates[13]?.digital === 1;

  return (
    <g transform={`translate(${x} ${y})`}>
      {innerSvg ? (
        // Realistic SVG board art. Embedded inline so it inherits the parent SVG transform.
        <g dangerouslySetInnerHTML={{ __html: innerSvg }} />
      ) : (
        // Fallback: simple PCB rectangle if no SVG is configured.
        <rect x={0} y={0} width={UNO_WIDTH} height={UNO_HEIGHT} rx={10}
          fill="oklch(0.42 0.10 165)" stroke="oklch(0.30 0.08 165)" strokeWidth={1.5} />
      )}

      {/* On-board "L" LED glow overlay (D13). Position matches the yellow
          "L" LED in the embedded illustration (≈435,178 in 960x704 space). */}
      {ledOn && (
        <g pointerEvents="none">
          <circle cx={435} cy={178} r={16} fill="oklch(0.85 0.22 75 / 0.35)" />
          <circle cx={435} cy={178} r={8}  fill="oklch(0.92 0.22 80)" />
        </g>
      )}

      {/* ATmega328P IC click target. Opens the live register / memory inspector. */}
      {onChipClick && (
        <g
          className="cursor-pointer group"
          onMouseDown={(e) => { e.stopPropagation(); onChipClick(e); }}
        >
          <title>Inspect ATmega328P (registers, SRAM, flash, EEPROM)</title>
          <rect
            x={360} y={300}
            width={240} height={120}
            rx={8}
            fill="transparent"
            stroke="oklch(0.7 0.18 245 / 0)"
            strokeWidth={2}
            className="group-hover:stroke-[oklch(0.7_0.18_245_/_0.9)] transition-all"
          />
          <text
            x={480} y={295}
            textAnchor="middle"
            fontSize={14}
            fontWeight={700}
            fill="oklch(0.7 0.18 245)"
            className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
          >
            🔍 Inspect MCU
          </text>
        </g>
      )}


      {pins.map((pin) => {
        const isOutput = pin.number !== undefined && pinStates[pin.number]?.digital === 1;
        const isHi = highlightPin === pin.id;
        const onPin = isOutput;
        const dotFill = onPin ? "var(--color-pin-active)" : pin.color;
        return (
          <g key={pin.id} transform={`translate(${pin.x} ${pin.y})`}>
            {/* Visible marker (matches editor styling) */}
            <circle
              r={6}
              fill={dotFill}
              stroke={isHi ? "var(--color-primary)" : "oklch(0.98 0 0 / 0.95)"}
              strokeWidth={isHi ? 3 : 1.25}
              className={cn("transition-all pointer-events-none", onPin && "led-glow-yellow")}
            />
            {/* Larger transparent hit target for easier wiring */}
            <circle
              r={11}
              fill="transparent"
              className="cursor-crosshair"
              onMouseDown={(e) => { e.stopPropagation(); onPinClick?.(pin.id, e); }}
              onMouseEnter={(e) => onPinHover?.({
                id: pin.id, label: pin.label, kind: pin.kind, x: pin.x, y: pin.y, number: pin.number,
              }, e)}
              onMouseLeave={(e) => onPinHover?.(null, e)}
            />
          </g>
        );
      })}
    </g>
  );
}
