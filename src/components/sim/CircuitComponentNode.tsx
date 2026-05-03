import { useSimStore } from "@/sim/store";
import { COMPONENT_DEFS } from "@/sim/components";
import type { CircuitComponent } from "@/sim/types";
import { useEffect, useMemo, useState } from "react";
import { useAdminStore } from "@/sim/adminStore";

interface Props {
  comp: CircuitComponent;
  isPowered: boolean;
  onPinClick: (pinId: string, e: React.MouseEvent) => void;
  onSelect: (e: React.MouseEvent) => void;
  onDragStart: (e: React.MouseEvent) => void;
  selected: boolean;
  /** When true, dragging a pin moves it (per-instance override) instead of starting a wire. */
  pinEditMode?: boolean;
  /** Convert a global mouse event to canvas SVG (user-space) coordinates. */
  toCanvasPoint?: (e: MouseEvent | React.MouseEvent) => { x: number; y: number };
}

/** Parse per-instance pin position overrides from comp.props. Shape: { [pinId]: {x,y} }. */
function readPinOverrides(comp: CircuitComponent): Record<string, { x: number; y: number }> {
  const raw = comp.props.pinOverrides;
  if (typeof raw !== "string" || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch { return {}; }
}

const LED_COLORS: Record<string, { off: string; on: string; glow: string }> = {
  red:    { off: "oklch(0.4 0.10 25)",  on: "oklch(0.7 0.25 25)",  glow: "led-glow-red" },
  green:  { off: "oklch(0.4 0.10 145)", on: "oklch(0.78 0.22 145)", glow: "led-glow-green" },
  blue:   { off: "oklch(0.4 0.10 245)", on: "oklch(0.7 0.22 245)", glow: "led-glow-blue" },
  yellow: { off: "oklch(0.5 0.10 90)",  on: "oklch(0.85 0.18 90)",  glow: "led-glow-yellow" },
  white:  { off: "oklch(0.55 0.01 0)",  on: "oklch(0.96 0.02 90)",  glow: "led-glow-yellow" },
  orange: { off: "oklch(0.5 0.10 55)",  on: "oklch(0.78 0.20 55)",  glow: "led-glow-yellow" },
  purple: { off: "oklch(0.4 0.10 305)", on: "oklch(0.7 0.22 305)",  glow: "led-glow-blue" },
};

export function CircuitComponentNode({ comp, isPowered, onPinClick, onSelect, onDragStart, selected, pinEditMode, toCanvasPoint }: Props) {
  const def = COMPONENT_DEFS[comp.kind];
  const setProp = useSimStore((s) => s.setComponentProp);
  const adminComps = useAdminStore((s) => s.components);

  // Resolve the admin entry for custom components so we can render their SVG/pins.
  const customEntry = useMemo(() => {
    if (comp.kind !== "custom") return null;
    const cid = String(comp.props.customId ?? "");
    return adminComps.find((c) => c.id === cid) ?? null;
  }, [adminComps, comp.kind, comp.props.customId]);

  // Inner SVG markup (strip outer <svg> wrapper) for inline embedding.
  const customInner = useMemo(() => {
    if (!customEntry?.svg) return null;
    const m = customEntry.svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
    return m ? m[1] : customEntry.svg;
  }, [customEntry?.svg]);

  const overrides = useMemo(() => readPinOverrides(comp), [comp.props.pinOverrides, comp]);

  // Pin list to render: built-ins use COMPONENT_DEFS.pins, customs use admin pins (with optional per-instance overrides).
  const pins = useMemo(() => {
    const base = comp.kind === "custom" && customEntry?.pins
      ? customEntry.pins.map((p) => ({ id: p.id, label: p.label, x: p.x, y: p.y }))
      : def.pins;
    if (comp.kind !== "custom") return base;
    return base.map((p) => {
      const o = overrides[p.id];
      return o ? { ...p, x: o.x, y: o.y } : p;
    });
  }, [comp.kind, customEntry?.pins, def.pins, overrides]);

  const width = comp.kind === "custom" ? (customEntry?.width ?? def.width) : def.width;
  const height = comp.kind === "custom" ? (customEntry?.height ?? def.height) : def.height;

  /** Pin-edit drag: start moving a pin. */
  const startPinDrag = (pinId: string, e: React.MouseEvent) => {
    if (!pinEditMode || comp.kind !== "custom" || !toCanvasPoint) return;
    e.stopPropagation();
    e.preventDefault();
    const onMove = (ev: MouseEvent) => {
      const pt = toCanvasPoint(ev);
      // Pin coords are relative to the component's top-left (comp.x, comp.y).
      const nx = Math.round(pt.x - comp.x);
      const ny = Math.round(pt.y - comp.y);
      const cur = readPinOverrides(comp);
      cur[pinId] = { x: nx, y: ny };
      setProp(comp.id, "pinOverrides", JSON.stringify(cur));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };


  return (
    <g
      transform={`translate(${comp.x} ${comp.y})`}
      onMouseDown={(e) => { onSelect(e); onDragStart(e); }}
      className="cursor-grab active:cursor-grabbing"
    >
      {/* Selection ring */}
      {selected && (
        <rect
          x={-4} y={-4} width={width + 8} height={height + 8}
          rx={6}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      )}

      {comp.kind === "led" && (
        <LedSvg
          color={String(comp.props.color || "red")}
          size={Number(comp.props.size ?? 1) || 1}
          on={isPowered}
          burned={Boolean(comp.props.burned)}
        />
      )}
      {comp.kind === "resistor" && <ResistorSvg ohms={Number(comp.props.ohms || 220)} />}
      {comp.kind === "button" && <ButtonSvg compId={comp.id} />}
      {comp.kind === "potentiometer" && (
        <PotentiometerSvg
          value={Number(comp.props.value ?? 512)}
          onChange={(v) => setProp(comp.id, "value", v)}
        />
      )}

      {/* Custom component visual: inline the admin SVG markup. */}
      {comp.kind === "custom" && (
        customInner ? (
          <g dangerouslySetInnerHTML={{ __html: customInner }} />
        ) : (
          <rect x={0} y={0} width={width} height={height} rx={6}
            fill={customEntry?.bodyColor ?? "oklch(0.32 0.02 250)"}
            stroke="oklch(0.18 0.01 250)" />
        )
      )}
      {comp.kind === "custom" && !customInner && customEntry && (
        <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="middle"
          fontSize={11} fontFamily="monospace" fill="var(--color-foreground)">
          {customEntry.label}
        </text>
      )}

      {/* Pins */}
      {pins.map((pin) => {
        const editable = Boolean(pinEditMode && comp.kind === "custom");
        return <PinNode key={pin.id} pin={pin} editable={editable} onPinClick={onPinClick} startPinDrag={startPinDrag} />;
      })}
    </g>
  );
}

function PinNode({
  pin, editable, onPinClick, startPinDrag,
}: {
  pin: { id: string; label: string; x: number; y: number };
  editable: boolean;
  onPinClick: (pinId: string, e: React.MouseEvent) => void;
  startPinDrag: (pinId: string, e: React.MouseEvent) => void;
}) {
  const [hover, setHover] = useState(false);
  const showLabel = editable || hover;
  return (
    <g transform={`translate(${pin.x} ${pin.y})`}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <circle
        r={editable || hover ? 6 : 4}
        fill={editable ? "var(--color-primary)" : hover ? "var(--color-pin-active)" : "var(--color-pin)"}
        stroke={editable ? "oklch(0.95 0 0)" : "oklch(0.15 0 0)"}
        strokeWidth={editable ? 2 : 1}
        className={editable ? "cursor-move" : "cursor-crosshair"}
        onMouseDown={(e) => {
          if (editable) { startPinDrag(pin.id, e); return; }
          e.stopPropagation();
          onPinClick(pin.id, e);
        }}
      />
      {showLabel && (
        <g pointerEvents="none">
          <rect
            x={-pin.label.length * 5 - 8} y={-36}
            width={pin.label.length * 10 + 16} height={22} rx={5}
            fill="var(--color-card)" stroke="var(--color-primary)" strokeWidth={1.2}
            opacity={0.98}
          />
          <text x={0} y={-21} textAnchor="middle" fontSize={14} fontWeight={600} fontFamily="monospace"
            fill={editable ? "var(--color-primary)" : "var(--color-foreground)"}>
            {pin.label}
          </text>
        </g>
      )}
      <title>{pin.label}{editable ? " (drag to reposition)" : ""}</title>
    </g>
  );
}

function LedSvg({ color, on, size = 1, burned = false }: { color: string; on: boolean; size?: number; burned?: boolean }) {
  const c = LED_COLORS[color] ?? LED_COLORS.red;
  const s = Math.max(0.5, Math.min(2.5, size));
  // Dome bulb sits between the two leads at x=20 / x=40 (pin positions, anchored by the parent).
  // Geometry mirrors the reference dome-LED icon: rounded top, flat collar, two stub leads.
  const bodyOff = "oklch(0.78 0.02 240)";   // light grey dome when off
  const bodyOn = c.on;
  const fill = burned ? "oklch(0.22 0.01 30)" : on ? bodyOn : bodyOff;
  const stroke = burned ? "oklch(0.12 0.01 30)" : "oklch(0.18 0.01 240)";
  const rays = on && !burned;

  return (
    <g>
      {/* leads anchored to pin positions */}
      <line x1={20} y1={62} x2={20} y2={78} stroke="oklch(0.78 0.02 240)" strokeWidth={1.5} />
      <line x1={40} y1={62} x2={40} y2={78} stroke="oklch(0.78 0.02 240)" strokeWidth={1.5} />
      {/* collar / base plate */}
      <rect x={12} y={50} width={36} height={6} rx={1.5}
        fill={burned ? "oklch(0.18 0.01 30)" : "oklch(0.45 0.02 240)"}
        stroke={stroke} strokeWidth={1} />
      <line x1={16} y1={56} x2={16} y2={62} stroke={stroke} strokeWidth={1} />
      <line x1={44} y1={56} x2={44} y2={62} stroke={stroke} strokeWidth={1} />
      <g transform={`translate(${30 * (1 - s)} ${28 * (1 - s)}) scale(${s})`}>
        {/* dome: rounded top + flat bottom — `path` produces the silhouette in the icon */}
        <path
          d="M10 50 V28 a20 20 0 0 1 40 0 V50 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
          className={rays ? c.glow : ""}
        />
        {/* highlight */}
        {!burned && (
          <ellipse cx={22} cy={22} rx={4} ry={9} fill="oklch(1 0 0 / 0.35)" />
        )}
        {/* tiny inner die (the square chip element visible in the reference) */}
        <rect x={26} y={42} width={8} height={5} rx={0.5}
          fill={burned ? "oklch(0.08 0.01 30)" : on ? "oklch(0.95 0.02 90)" : "oklch(0.55 0.02 240)"} />
      </g>
      {/* light rays — only when the LED is on and not burned */}
      {rays && (
        <g stroke={c.on} strokeWidth={1.6} strokeLinecap="round" opacity={0.9}>
          <line x1={30} y1={-2} x2={30} y2={4} />
          <line x1={6} y1={4} x2={11} y2={9} />
          <line x1={54} y1={4} x2={49} y2={9} />
          <line x1={-2} y1={26} x2={5} y2={26} />
          <line x1={55} y1={26} x2={62} y2={26} />
          <line x1={6} y1={48} x2={11} y2={43} />
          <line x1={54} y1={48} x2={49} y2={43} />
        </g>
      )}
      {/* burned: smoke wisps + 'X' */}
      {burned && (
        <g>
          <path d="M22 -2 q4 4 0 8 q-4 4 0 8" stroke="oklch(0.55 0.01 240 / 0.6)" strokeWidth={1.5} fill="none" strokeLinecap="round" />
          <path d="M34 -2 q4 4 0 8 q-4 4 0 8" stroke="oklch(0.45 0.01 240 / 0.5)" strokeWidth={1.5} fill="none" strokeLinecap="round" />
          <text x={30} y={32} textAnchor="middle" fontSize={14} fontWeight={700}
            fill="oklch(0.7 0.22 25)" fontFamily="monospace">✕</text>
        </g>
      )}
    </g>
  );
}

// Resistor color-band helpers (4-band E-series, ±5% gold tolerance).
const BAND_COLORS = [
  "oklch(0.15 0 0)",       // 0 black
  "oklch(0.35 0.12 50)",   // 1 brown
  "oklch(0.55 0.22 25)",   // 2 red
  "oklch(0.65 0.18 55)",   // 3 orange
  "oklch(0.85 0.18 90)",   // 4 yellow
  "oklch(0.65 0.20 145)",  // 5 green
  "oklch(0.55 0.22 245)",  // 6 blue
  "oklch(0.55 0.22 305)",  // 7 violet
  "oklch(0.55 0.01 0)",    // 8 grey
  "oklch(0.96 0.01 0)",    // 9 white
];
const GOLD = "oklch(0.78 0.15 85)";

function resistorBands(ohms: number): [string, string, string, string] {
  const v = Math.max(0, Math.round(ohms));
  if (v === 0) return [BAND_COLORS[0], BAND_COLORS[0], BAND_COLORS[0], GOLD];
  // Find first two significant digits + multiplier exponent.
  const s = String(v);
  const d1 = Number(s[0]);
  const d2 = Number(s[1] ?? "0");
  const exp = Math.max(0, s.length - 2);
  const mult = Math.min(9, exp);
  return [BAND_COLORS[d1] ?? BAND_COLORS[0], BAND_COLORS[d2] ?? BAND_COLORS[0], BAND_COLORS[mult] ?? BAND_COLORS[0], GOLD];
}

function formatOhms(ohms: number): string {
  if (ohms >= 1_000_000) return `${+(ohms / 1_000_000).toFixed(2)}MΩ`;
  if (ohms >= 1_000) return `${+(ohms / 1_000).toFixed(2)}kΩ`;
  return `${ohms}Ω`;
}

function ResistorSvg({ ohms }: { ohms: number }) {
  const [b1, b2, b3, b4] = resistorBands(ohms);
  // Cartoon-style body: beige bulged barrel with rounded bumpy ends. The
  // overall component is 100×30 with pins at (4,15) and (96,15).
  const body = "oklch(0.82 0.07 80)";   // light tan
  const bodyDark = "oklch(0.55 0.05 70)"; // outline / shadow
  // Bulge path: leads exit at the top of two end-caps; the body has a wide
  // central section with concave shoulders, mirroring the reference SVG.
  const bodyPath =
    "M 18 15 " +
    "C 18 8, 24 4, 32 4 " +     // top-left shoulder up
    "C 36 4, 40 6, 44 6 " +     // top-left bump
    "L 56 6 " +
    "C 60 6, 64 4, 68 4 " +     // top-right bump
    "C 76 4, 82 8, 82 15 " +    // top-right shoulder down
    "C 82 22, 76 26, 68 26 " +
    "C 64 26, 60 24, 56 24 " +
    "L 44 24 " +
    "C 40 24, 36 26, 32 26 " +
    "C 24 26, 18 22, 18 15 Z";

  return (
    <g>
      {/* leads */}
      <line x1={4} y1={15} x2={20} y2={15} stroke="oklch(0.78 0.02 240)" strokeWidth={2} />
      <line x1={80} y1={15} x2={96} y2={15} stroke="oklch(0.78 0.02 240)" strokeWidth={2} />
      {/* body */}
      <path d={bodyPath} fill={body} stroke={bodyDark} strokeWidth={1.2} strokeLinejoin="round" />
      {/* subtle highlight along the top */}
      <path
        d="M 26 9 C 32 7, 50 7, 70 9"
        stroke="oklch(0.95 0.04 80 / 0.6)"
        strokeWidth={1.2}
        fill="none"
        strokeLinecap="round"
      />
      {/* color bands (clipped to body silhouette via overlap) */}
      <g>
        <rect x={32} y={5} width={4} height={20} fill={b1} stroke={bodyDark} strokeWidth={0.4} />
        <rect x={42} y={5} width={4} height={20} fill={b2} stroke={bodyDark} strokeWidth={0.4} />
        <rect x={52} y={5} width={4} height={20} fill={b3} stroke={bodyDark} strokeWidth={0.4} />
        <rect x={66} y={5} width={4} height={20} fill={b4} stroke={bodyDark} strokeWidth={0.4} />
      </g>
      <text x={50} y={50} textAnchor="middle" fontSize={22} fontWeight={800} fontFamily="monospace"
        fill="var(--color-foreground)" stroke="var(--color-background)" strokeWidth={4}
        paintOrder="stroke" style={{ paintOrder: "stroke" }}>
        {formatOhms(ohms)}
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
