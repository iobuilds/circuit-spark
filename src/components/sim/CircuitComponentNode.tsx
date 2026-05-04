import { useSimStore } from "@/sim/store";
import { COMPONENT_DEFS } from "@/sim/components";
import type { CircuitComponent } from "@/sim/types";
import { useEffect, useMemo, useState } from "react";
import { useAdminStore } from "@/sim/adminStore";
import { Ds3231Svg } from "./Ds3231Svg";

interface Props {
  comp: CircuitComponent;
  isPowered: boolean;
  /** Voltage applied across +/- pins (for motor / battery loads). */
  voltage?: number;
  /** Reversed polarity (for motor direction). */
  reversed?: boolean;
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

export function CircuitComponentNode({ comp, isPowered, voltage = 0, reversed = false, onPinClick, onSelect, onDragStart, selected, pinEditMode, toCanvasPoint }: Props) {
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


  const angle = ((comp.rotation ?? 0) % 360 + 360) % 360;
  const cx = width / 2;
  const cy = height / 2;

  const isLocked = Boolean(comp.props.locked);
  const [hover, setHover] = useState(false);

  return (
    <g
      transform={`translate(${comp.x} ${comp.y})`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={(e) => { onSelect(e); if (!isLocked) onDragStart(e); }}
      className={isLocked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"}
    >
      {/* Selection ring (axis-aligned around the unrotated bounding box) */}
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

      {/* Hover/locked lock toggle — top-right of bounding box. Click to toggle. */}
      {(hover || isLocked) && (
        <g
          transform={`translate(${width - 4} ${-12})`}
          className="cursor-pointer"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setProp(comp.id, "locked", !isLocked);
          }}
        >
          <title>{isLocked ? "Unlock component (allow dragging)" : "Lock component in place"}</title>
          <circle r={10}
            fill={isLocked ? "var(--color-primary)" : "var(--color-card)"}
            stroke={isLocked ? "var(--color-primary)" : "var(--color-border)"}
            strokeWidth={1.5} />
          {/* Lock icon (closed when locked, open when unlocked) */}
          {isLocked ? (
            <g stroke="var(--color-primary-foreground)" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x={-4} y={-1} width={8} height={6} rx={1} fill="var(--color-primary-foreground)" stroke="none" />
              <path d="M -2.5 -1 V -3 a 2.5 2.5 0 0 1 5 0 V -1" />
            </g>
          ) : (
            <g stroke="var(--color-foreground)" strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x={-4} y={-1} width={8} height={6} rx={1} fill="var(--color-foreground)" stroke="none" />
              <path d="M -2.5 -1 V -3 a 2.5 2.5 0 0 1 5 0" />
            </g>
          )}
        </g>
      )}

      <g transform={angle ? `rotate(${angle} ${cx} ${cy})` : undefined}>

      {comp.kind === "led" && (
        <LedSvg
          color={String(comp.props.color || "red")}
          size={Number(comp.props.size ?? 1) || 1}
          on={isPowered}
          burned={Boolean(comp.props.burned)}
        />
      )}
      {comp.kind === "resistor" && <ResistorSvg ohms={Number(comp.props.ohms || 220)} />}
      {comp.kind === "button" && (
        <ButtonSvg
          compId={comp.id}
          color={String(comp.props.color ?? "red")}
          size={Number(comp.props.size ?? 1) || 1}
        />
      )}
      {comp.kind === "potentiometer" && (
        <PotentiometerSvg
          value={Number(comp.props.value ?? 512)}
          onChange={(v) => setProp(comp.id, "value", v)}
        />
      )}
      {comp.kind === "motor" && (
        <MotorSvg
          voltage={voltage}
          reversed={reversed}
          burned={Boolean(comp.props.burned)}
          color={String(comp.props.propColor ?? "blue")}
        />
      )}
      {comp.kind === "battery" && (
        <BatterySvg
          cells={Math.max(1, Math.min(8, Number(comp.props.cells ?? 1) || 1))}
          voltage={(() => {
            const cells = Math.max(1, Math.min(8, Number(comp.props.cells ?? 1) || 1));
            const raw = comp.props.voltage;
            const v = raw === undefined || raw === "" ? cells * 3.7 : Number(raw);
            return Number.isFinite(v) ? v : cells * 3.7;
          })()}
          onVoltageChange={(v) => setProp(comp.id, "voltage", v)}
        />
      )}

      {comp.kind === "ds3231" && <Ds3231Svg />}

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

function ButtonSvg({ compId, color = "red", size = 1 }: { compId: string; color?: string; size?: number }) {
  // 2-pin push button. Pressed = pins A and B shorted.
  const pressed = useSimStore((s) => Boolean(s.components.find((c) => c.id === compId)?.props.pressed));
  const setProp = useSimStore((s) => s.setComponentProp);
  const colorMap: Record<string, { cap: string; capDark: string; ring: string }> = {
    red:    { cap: "oklch(0.7 0.20 25)",  capDark: "oklch(0.55 0.18 25)",  ring: "oklch(0.3 0.10 25)" },
    green:  { cap: "oklch(0.72 0.20 145)", capDark: "oklch(0.55 0.18 145)", ring: "oklch(0.3 0.10 145)" },
    blue:   { cap: "oklch(0.7 0.20 245)",  capDark: "oklch(0.55 0.18 245)", ring: "oklch(0.3 0.10 245)" },
    yellow: { cap: "oklch(0.85 0.18 90)",  capDark: "oklch(0.7 0.16 90)",   ring: "oklch(0.4 0.10 90)" },
    white:  { cap: "oklch(0.95 0.01 0)",   capDark: "oklch(0.8 0.01 0)",    ring: "oklch(0.4 0 0)" },
    black:  { cap: "oklch(0.25 0.01 0)",   capDark: "oklch(0.15 0.01 0)",   ring: "oklch(0.05 0 0)" },
    orange: { cap: "oklch(0.78 0.20 55)",  capDark: "oklch(0.6 0.18 55)",   ring: "oklch(0.3 0.10 55)" },
  };
  const c = colorMap[color] ?? colorMap.red;
  const s = Math.max(0.5, Math.min(2, size));
  const cx = 35;
  const cy = 35;
  const baseR = 18 * s;
  const capR = (pressed ? 12 : 14) * s;
  return (
    <g
      onMouseDown={(e) => { e.stopPropagation(); setProp(compId, "pressed", true); }}
      onMouseUp={() => setProp(compId, "pressed", false)}
      onMouseLeave={() => setProp(compId, "pressed", false)}
    >
      {/* Pin leads */}
      <line x1={4} y1={35} x2={cx - baseR + 2} y2={35} stroke="oklch(0.7 0.02 250)" strokeWidth={2} />
      <line x1={66} y1={35} x2={cx + baseR - 2} y2={35} stroke="oklch(0.7 0.02 250)" strokeWidth={2} />
      {/* Body */}
      <circle cx={cx} cy={cy} r={baseR} fill="oklch(0.32 0.02 250)" stroke="oklch(0.18 0.01 250)" />
      <circle cx={cx} cy={cy} r={baseR - 3} fill="oklch(0.26 0.02 250)" />
      {/* Cap */}
      <circle cx={cx} cy={cy} r={capR} fill={pressed ? c.capDark : c.cap} stroke={c.ring} strokeWidth={1.2} />
      <circle cx={cx - 3} cy={cy - 3} r={capR * 0.28} fill="oklch(1 0 0 / 0.35)" />
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

const PROP_COLORS: Record<string, string> = {
  blue: "oklch(0.7 0.20 240)",
  red: "oklch(0.65 0.22 25)",
  pink: "oklch(0.72 0.22 0)",
  yellow: "oklch(0.88 0.18 95)",
  green: "oklch(0.65 0.20 145)",
};

function MotorSvg({ voltage, reversed, burned, color }: { voltage: number; reversed: boolean; burned: boolean; color: string }) {
  // Speed: 0 below ~0.5V, full at 5V. Above 12V → burned (handled by canvas).
  const v = Math.max(0, voltage);
  const speed = Math.min(1, Math.max(0, (v - 0.4) / (5 - 0.4)));
  const rps = (reversed ? -1 : 1) * speed * 8; // up to 8 revs/sec at 5V
  const dur = rps !== 0 ? Math.abs(1 / rps) : 0;
  const propFill = burned ? "oklch(0.35 0.02 30)" : (PROP_COLORS[color] ?? PROP_COLORS.blue);
  const propStroke = "oklch(0.18 0.01 240)";
  // Geometry centred around x=55. Pins exit at (38,148) and (72,148).
  return (
    <g>
      {/* leads */}
      <line x1={38} y1={120} x2={38} y2={148} stroke="oklch(0.78 0.02 240)" strokeWidth={2} />
      <line x1={72} y1={120} x2={72} y2={148} stroke="oklch(0.78 0.02 240)" strokeWidth={2} />
      {/* red end-cap with pins */}
      <rect x={28} y={108} width={54} height={16} rx={3}
        fill={burned ? "oklch(0.30 0.05 25)" : "oklch(0.55 0.20 25)"} stroke={propStroke} strokeWidth={1.2} />
      {/* main grey can */}
      <rect x={22} y={50} width={66} height={60} rx={4}
        fill={burned ? "oklch(0.25 0.005 250)" : "oklch(0.55 0.005 250)"} stroke={propStroke} strokeWidth={1.4} />
      {/* highlight strip */}
      <rect x={30} y={56} width={6} height={48} rx={2} fill="oklch(0.78 0.005 250 / 0.5)" />
      {/* shaft cap */}
      <rect x={45} y={42} width={20} height={10} rx={2} fill="oklch(0.42 0.005 250)" stroke={propStroke} strokeWidth={1} />
      {/* shaft */}
      <line x1={55} y1={42} x2={55} y2={28} stroke="oklch(0.7 0.005 250)" strokeWidth={3} strokeLinecap="round" />
      {/* propeller — animated rotation */}
      <g transform="translate(55 24)">
        {dur > 0 && !burned && (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={reversed ? "360 0 0" : "0 0 0"}
            to={reversed ? "0 0 0" : "360 0 0"}
            dur={`${dur}s`}
            repeatCount="indefinite"
          />
        )}
        {/* hub */}
        <circle r={5} fill={propFill} stroke={propStroke} strokeWidth={1} />
        {/* two blades */}
        <ellipse cx={-22} cy={0} rx={22} ry={5} fill={propFill} stroke={propStroke} strokeWidth={1} />
        <ellipse cx={22} cy={0} rx={22} ry={5} fill={propFill} stroke={propStroke} strokeWidth={1} />
      </g>
      {/* burned overlay */}
      {burned && (
        <g>
          <path d="M40 36 q4 -6 0 -14" stroke="oklch(0.55 0.01 240 / 0.7)" strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d="M55 28 q5 -8 0 -18" stroke="oklch(0.45 0.01 240 / 0.6)" strokeWidth={2} fill="none" strokeLinecap="round" />
          <path d="M70 36 q4 -6 0 -14" stroke="oklch(0.55 0.01 240 / 0.7)" strokeWidth={2} fill="none" strokeLinecap="round" />
          <text x={55} y={88} textAnchor="middle" fontSize={20} fontWeight={800}
            fill="oklch(0.7 0.22 25)" fontFamily="monospace">✕</text>
        </g>
      )}
      {/* status label */}
      <text x={55} y={138} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="monospace"
        fill="var(--color-foreground)" stroke="var(--color-background)" strokeWidth={3}
        paintOrder="stroke" style={{ paintOrder: "stroke" }}>
        {burned ? "BURNED" : v < 0.4 ? "0V" : `${v.toFixed(1)}V ${reversed ? "◀" : "▶"}`}
      </text>
    </g>
  );
}

function BatterySvg({ cells, voltage, onVoltageChange }: {
  cells: number;
  voltage: number;
  onVoltageChange: (v: number) => void;
}) {
  const max = +(cells * 4.2).toFixed(1);
  const min = +(cells * 0.8).toFixed(1);
  const v = +Math.max(min, Math.min(max, voltage)).toFixed(2);
  // 160×210, pins at + (44,208) and - (116,208)
  return (
    <g>
      {/* leads */}
      <line x1={44} y1={180} x2={44} y2={208} stroke="oklch(0.78 0.02 240)" strokeWidth={3} />
      <line x1={116} y1={180} x2={116} y2={208} stroke="oklch(0.78 0.02 240)" strokeWidth={3} />
      {/* body */}
      <rect x={14} y={28} width={132} height={150} rx={10}
        fill="oklch(0.55 0.18 25)" stroke="oklch(0.30 0.10 25)" strokeWidth={2} />
      {/* cell separators */}
      {Array.from({ length: cells - 1 }).map((_, i) => {
        const yy = 28 + ((i + 1) * 150) / cells;
        return <line key={i} x1={14} y1={yy} x2={146} y2={yy} stroke="oklch(0.30 0.10 25)" strokeWidth={1.5} />;
      })}
      {/* terminals */}
      <rect x={34} y={20} width={20} height={10} rx={2} fill="oklch(0.30 0.10 25)" />
      <rect x={106} y={20} width={20} height={10} rx={2} fill="oklch(0.30 0.10 25)" />
      <text x={44} y={16} textAnchor="middle" fontSize={14} fontWeight={800}
        fill="oklch(0.7 0.22 145)" fontFamily="monospace">+</text>
      <text x={116} y={16} textAnchor="middle" fontSize={16} fontWeight={800}
        fill="var(--color-foreground)" fontFamily="monospace">−</text>
      {/* big voltage label */}
      <text x={80} y={88} textAnchor="middle" fontSize={32} fontWeight={800}
        fill="oklch(0.98 0 0)" fontFamily="monospace">{v}V</text>
      <text x={80} y={108} textAnchor="middle" fontSize={12} fontWeight={600}
        fill="oklch(0.98 0 0 / 0.85)" fontFamily="monospace">{cells}× cell · {min}–{max}V</text>
      {/* slider (foreignObject so it works in SVG) */}
      <foreignObject x={20} y={128} width={120} height={42}
        onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ width: "100%", padding: "4px 0" }}>
          <input
            type="range"
            min={min}
            max={max}
            step={0.1}
            value={v}
            onChange={(e) => onVoltageChange(Number(e.target.value))}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ width: "100%", accentColor: "oklch(0.78 0.22 145)" }}
          />
          <div style={{
            fontFamily: "monospace", fontSize: 10, color: "oklch(0.98 0 0 / 0.85)",
            textAlign: "center", marginTop: 2,
          }}>
            adjust voltage
          </div>
        </div>
      </foreignObject>
    </g>
  );
}

