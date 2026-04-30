import { useSimStore } from "@/sim/store";
import { COMPONENT_DEFS } from "@/sim/components";
import type { CircuitComponent } from "@/sim/types";
import { useEffect, useState } from "react";

interface Props {
  comp: CircuitComponent;
  isPowered: boolean;
  onPinClick: (pinId: string, e: React.MouseEvent) => void;
  onSelect: (e: React.MouseEvent) => void;
  onDragStart: (e: React.MouseEvent) => void;
  selected: boolean;
}

const LED_COLORS: Record<string, { off: string; on: string; glow: string }> = {
  red:    { off: "oklch(0.4 0.10 25)",  on: "oklch(0.7 0.25 25)",  glow: "led-glow-red" },
  green:  { off: "oklch(0.4 0.10 145)", on: "oklch(0.78 0.22 145)", glow: "led-glow-green" },
  blue:   { off: "oklch(0.4 0.10 245)", on: "oklch(0.7 0.22 245)", glow: "led-glow-blue" },
  yellow: { off: "oklch(0.5 0.10 90)",  on: "oklch(0.85 0.18 90)",  glow: "led-glow-yellow" },
};

export function CircuitComponentNode({ comp, isPowered, onPinClick, onSelect, onDragStart, selected }: Props) {
  const def = COMPONENT_DEFS[comp.kind];
  const setProp = useSimStore((s) => s.setComponentProp);

  return (
    <g
      transform={`translate(${comp.x} ${comp.y})`}
      onMouseDown={(e) => { onSelect(e); onDragStart(e); }}
      className="cursor-grab active:cursor-grabbing"
    >
      {/* Selection ring */}
      {selected && (
        <rect
          x={-4} y={-4} width={def.width + 8} height={def.height + 8}
          rx={6}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      {comp.kind === "led" && <LedSvg color={String(comp.props.color || "red")} on={isPowered} />}
      {comp.kind === "resistor" && <ResistorSvg ohms={Number(comp.props.ohms || 220)} />}
      {comp.kind === "button" && <ButtonSvg compId={comp.id} />}
      {comp.kind === "potentiometer" && (
        <PotentiometerSvg
          value={Number(comp.props.value ?? 512)}
          onChange={(v) => setProp(comp.id, "value", v)}
        />
      )}

      {/* Pins */}
      {def.pins.map((pin) => (
        <g key={pin.id} transform={`translate(${pin.x} ${pin.y})`}>
          <circle
            r={4}
            fill="var(--color-pin)"
            stroke="oklch(0.15 0 0)"
            className="cursor-crosshair hover:fill-[var(--color-pin-active)]"
            onMouseDown={(e) => { e.stopPropagation(); onPinClick(pin.id, e); }}
          />
          <title>{pin.label}</title>
        </g>
      ))}
    </g>
  );
}

function LedSvg({ color, on }: { color: string; on: boolean }) {
  const c = LED_COLORS[color] ?? LED_COLORS.red;
  return (
    <g>
      {/* leads */}
      <line x1={20} y1={50} x2={20} y2={78} stroke="oklch(0.78 0.02 240)" strokeWidth={1.5} />
      <line x1={40} y1={50} x2={40} y2={78} stroke="oklch(0.78 0.02 240)" strokeWidth={1.5} />
      {/* bulb */}
      <ellipse
        cx={30} cy={28} rx={20} ry={26}
        fill={on ? c.on : c.off}
        stroke="oklch(0.2 0.01 240)"
        strokeWidth={1}
        className={on ? c.glow : ""}
      />
      <ellipse cx={24} cy={20} rx={5} ry={8} fill="oklch(1 0 0 / 0.35)" />
    </g>
  );
}

function ResistorSvg({ ohms }: { ohms: number }) {
  return (
    <g>
      <line x1={4} y1={15} x2={20} y2={15} stroke="oklch(0.78 0.02 240)" strokeWidth={2} />
      <line x1={80} y1={15} x2={96} y2={15} stroke="oklch(0.78 0.02 240)" strokeWidth={2} />
      <rect x={20} y={6} width={60} height={18} rx={4}
        fill="oklch(0.65 0.10 60)" stroke="oklch(0.3 0.04 60)" />
      <rect x={28} y={6} width={4} height={18} fill="oklch(0.3 0 0)" />
      <rect x={36} y={6} width={4} height={18} fill="oklch(0.4 0.15 25)" />
      <rect x={44} y={6} width={4} height={18} fill="oklch(0.5 0.15 60)" />
      <rect x={68} y={6} width={4} height={18} fill="oklch(0.6 0.18 100)" />
      <text x={50} y={36} textAnchor="middle" fontSize={8} fontFamily="monospace" fill="var(--color-foreground)">
        {ohms}Ω
      </text>
    </g>
  );
}

function ButtonSvg({ compId }: { compId: string }) {
  // The button is interactive: while pressed it pulls its B pin to whatever its A pin is.
  // Implementation detail: we mark "pressed" state on the component props.
  const pressed = useSimStore((s) => Boolean(s.components.find((c) => c.id === compId)?.props.pressed));
  const setProp = useSimStore((s) => s.setComponentProp);
  return (
    <g
      onMouseDown={(e) => { e.stopPropagation(); setProp(compId, "pressed", true); }}
      onMouseUp={() => setProp(compId, "pressed", false)}
      onMouseLeave={() => setProp(compId, "pressed", false)}
    >
      <rect x={4} y={10} width={62} height={50} rx={6}
        fill="oklch(0.32 0.02 250)" stroke="oklch(0.18 0.01 250)" />
      <circle cx={35} cy={35} r={pressed ? 14 : 16}
        fill={pressed ? "oklch(0.55 0.18 25)" : "oklch(0.7 0.20 25)"}
        stroke="oklch(0.3 0.10 25)" />
      <circle cx={31} cy={31} r={4} fill="oklch(1 0 0 / 0.3)" />
    </g>
  );
}

function PotentiometerSvg({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Knob: angle 0..270deg mapped to value 0..1023
  const angle = (value / 1023) * 270 - 135;
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      // For simplicity, change with vertical mouse motion
      const dy = e.movementY;
      const newVal = Math.max(0, Math.min(1023, value - dy * 8));
      onChange(Math.round(newVal));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, value, onChange]);

  return (
    <g>
      <rect x={5} y={20} width={80} height={60} rx={6}
        fill="oklch(0.30 0.02 250)" stroke="oklch(0.16 0.01 250)" />
      <circle cx={45} cy={45} r={28}
        fill="oklch(0.18 0.01 250)" stroke="oklch(0.42 0.05 195)" strokeWidth={1.5} />
      <g
        transform={`rotate(${angle} 45 45)`}
        onMouseDown={(e) => { e.stopPropagation(); setDragging(true); }}
        className="cursor-ns-resize"
      >
        <circle cx={45} cy={45} r={22} fill="oklch(0.32 0.04 195)" stroke="oklch(0.6 0.10 195)" />
        <line x1={45} y1={45} x2={45} y2={26} stroke="var(--color-primary)" strokeWidth={3} strokeLinecap="round" />
      </g>
      <text x={45} y={14} textAnchor="middle" fontSize={9} fontFamily="monospace" fill="var(--color-foreground)">
        {value}
      </text>
    </g>
  );
}
