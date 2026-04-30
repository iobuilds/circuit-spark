import { UNO_PINS, UNO_WIDTH, UNO_HEIGHT } from "@/sim/uno-pins";
import { useSimStore } from "@/sim/store";
import { cn } from "@/lib/utils";

interface Props {
  x: number;
  y: number;
  highlightPin?: string;
  onPinClick?: (pinId: string, e: React.MouseEvent) => void;
}

export function ArduinoUnoBoard({ x, y, highlightPin, onPinClick }: Props) {
  const pinStates = useSimStore((s) => s.pinStates);

  return (
    <g transform={`translate(${x} ${y})`}>
      {/* PCB body */}
      <rect
        x={0} y={0} width={UNO_WIDTH} height={UNO_HEIGHT}
        rx={10}
        fill="oklch(0.42 0.10 165)"
        stroke="oklch(0.30 0.08 165)"
        strokeWidth={1.5}
      />
      {/* Silkscreen border */}
      <rect x={6} y={6} width={UNO_WIDTH - 12} height={UNO_HEIGHT - 12} rx={6}
        fill="none" stroke="oklch(0.55 0.05 165 / 0.5)" strokeWidth={0.6} strokeDasharray="3 2" />

      {/* USB connector (left) */}
      <rect x={-14} y={32} width={36} height={50} rx={2}
        fill="oklch(0.7 0.005 240)" stroke="oklch(0.4 0.005 240)" />
      <rect x={-10} y={38} width={28} height={38} fill="oklch(0.3 0.005 240)" />

      {/* Power jack */}
      <rect x={-4} y={120} width={36} height={38} rx={3}
        fill="oklch(0.18 0.01 250)" stroke="oklch(0.05 0 0)" />
      <circle cx={14} cy={139} r={8} fill="oklch(0.32 0.01 250)" />

      {/* MCU chip */}
      <rect x={150} y={110} width={70} height={70} rx={2}
        fill="oklch(0.16 0.01 250)" stroke="oklch(0.08 0 0)" />
      <text x={185} y={140} textAnchor="middle" fill="oklch(0.85 0.02 240)" fontSize={9} fontFamily="monospace">
        ATmega
      </text>
      <text x={185} y={155} textAnchor="middle" fill="oklch(0.85 0.02 240)" fontSize={9} fontFamily="monospace">
        328P
      </text>
      <circle cx={158} cy={118} r={1.5} fill="oklch(0.85 0.02 240)" />

      {/* Crystal */}
      <rect x={232} y={135} width={26} height={14} rx={2} fill="oklch(0.7 0.01 240)" stroke="oklch(0.3 0 0)" />

      {/* Power LED + L LED labels */}
      <circle cx={70} cy={80} r={3} fill="oklch(0.78 0.22 145)" className="led-glow-green" />
      <text x={78} y={84} fill="oklch(0.85 0.02 240)" fontSize={7} fontFamily="monospace">ON</text>

      {/* On-board L LED on D13 */}
      <circle
        cx={120} cy={80} r={3}
        fill={pinStates[13]?.digital ? "oklch(0.85 0.22 75)" : "oklch(0.4 0.04 75)"}
        className={pinStates[13]?.digital ? "led-glow-yellow" : ""}
      />
      <text x={128} y={84} fill="oklch(0.85 0.02 240)" fontSize={7} fontFamily="monospace">L</text>

      {/* Title */}
      <text x={UNO_WIDTH / 2} y={108} textAnchor="middle"
        fill="oklch(0.92 0.02 240)" fontSize={11} fontFamily="monospace" fontWeight={600}>
        ARDUINO UNO
      </text>

      {/* Pin headers (background bars) */}
      <rect x={dStartXBg} y={6} width={250} height={20} fill="oklch(0.16 0.01 250)" rx={2} />
      <rect x={90} y={UNO_HEIGHT - 26} width={UNO_WIDTH - 180} height={20} fill="oklch(0.16 0.01 250)" rx={2} />

      {/* Pins */}
      {UNO_PINS.map((pin) => {
        const isOutput = pin.number !== undefined && pinStates[pin.number]?.digital === 1;
        const isHi = highlightPin === pin.id;
        return (
          <g key={pin.id} transform={`translate(${pin.x} ${pin.y})`}>
            <circle
              r={5}
              fill={isOutput ? "var(--color-pin-active)" : "var(--color-pin)"}
              stroke={isHi ? "var(--color-primary)" : "oklch(0.15 0 0)"}
              strokeWidth={isHi ? 2 : 1}
              className={cn("cursor-crosshair transition-all hover:r-6", isOutput && "led-glow-yellow")}
              onMouseDown={(e) => { e.stopPropagation(); onPinClick?.(pin.id, e); }}
            />
            <title>{pin.label}</title>
            <text
              y={pin.y === 18 ? 18 : -10}
              textAnchor="middle"
              fontSize={6}
              fontFamily="monospace"
              fill="oklch(0.92 0.02 240)"
              pointerEvents="none"
            >
              {pin.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const dStartXBg = 90;
