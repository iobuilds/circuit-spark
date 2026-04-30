import { UNO_PINS, UNO_WIDTH, UNO_HEIGHT, type BoardPin } from "@/sim/uno-pins";
import { useSimStore } from "@/sim/store";
import { useAdminStore } from "@/sim/adminStore";
import { useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  x: number;
  y: number;
  highlightPin?: string;
  onPinClick?: (pinId: string, e: React.MouseEvent) => void;
  onPinHover?: (pin: BoardPin | null, e?: React.MouseEvent) => void;
}

export function ArduinoUnoBoard({ x, y, highlightPin, onPinClick, onPinHover }: Props) {
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

      {/* Interactive pin hit-targets (kept on top so wiring still works) */}
      {UNO_PINS.map((pin) => {
        const isOutput = pin.number !== undefined && pinStates[pin.number]?.digital === 1;
        const isHi = highlightPin === pin.id;
        return (
          <g key={pin.id} transform={`translate(${pin.x} ${pin.y})`}>
            <circle
              r={11}
              fill={isOutput ? "var(--color-pin-active)" : "var(--color-pin)"}
              fillOpacity={0.9}
              stroke={isHi ? "var(--color-primary)" : "oklch(0.15 0 0)"}
              strokeWidth={isHi ? 4 : 1.5}
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
