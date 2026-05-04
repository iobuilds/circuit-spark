import { useEffect, useMemo, useRef, useState } from "react";
import { X, GripVertical, Activity, Pause, Play, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Wire, CircuitComponent, PinState, PinEvent } from "@/sim/types";
import type { NetGraph } from "@/sim/netlist";
import { findUnoPin } from "@/sim/uno-pins";

interface Props {
  wire: Wire;
  components: CircuitComponent[];
  net: NetGraph;
  pinStatesByBoard: Record<string, Record<number, PinState>>;
  /** Per-board, per-pin rolling event log used to draw real waveforms. */
  pinEventsByBoard: Record<string, Record<number, PinEvent[]>>;
  initialX: number;
  initialY: number;
  onClose: () => void;
}

interface Resolved {
  label: string;
  netLabel: string | null;
  kind: "rail-high" | "rail-low" | "battery+" | "battery-" | "gpio" | "unknown";
  pinNum?: number;
  boardCompId?: string;
  voltsFixed?: number;
}

function resolveEndpoint(
  ep: { componentId: string; pinId: string },
  components: CircuitComponent[],
  net: NetGraph,
): Resolved {
  const k = `${ep.componentId}::${ep.pinId}`;
  const isBoard = components.find((c) => c.id === ep.componentId)?.kind === "board";
  const netLabel = net.netForCompPin.get(k) ?? null;

  if (isBoard) {
    const bp = findUnoPin(ep.pinId);
    if (bp?.number !== undefined) {
      return { label: `${ep.componentId}.${bp.id}`, netLabel, kind: "gpio", pinNum: bp.number, boardCompId: ep.componentId };
    }
    if (ep.pinId === "5V" || ep.pinId === "VIN") return { label: `${ep.componentId}.${ep.pinId}`, netLabel, kind: "rail-high", voltsFixed: 5 };
    if (ep.pinId === "3V3") return { label: `${ep.componentId}.3V3`, netLabel, kind: "rail-high", voltsFixed: 3.3 };
    if (ep.pinId.startsWith("GND")) return { label: `${ep.componentId}.GND`, netLabel, kind: "rail-low", voltsFixed: 0 };
  }

  if (netLabel) {
    if (netLabel === "5V" || netLabel === "VIN") return { label: `${ep.componentId}.${ep.pinId}`, netLabel, kind: "rail-high", voltsFixed: 5 };
    if (netLabel === "3V3") return { label: `${ep.componentId}.${ep.pinId}`, netLabel, kind: "rail-high", voltsFixed: 3.3 };
    if (netLabel === "GND" || netLabel === "GND1" || netLabel === "GND2" || netLabel === "GND_TOP") {
      return { label: `${ep.componentId}.${ep.pinId}`, netLabel, kind: "rail-low", voltsFixed: 0 };
    }
    if (netLabel.startsWith("BAT+:")) {
      const v = Number(netLabel.split(":")[2] ?? "3.7") || 3.7;
      return { label: `${ep.componentId}.${ep.pinId}`, netLabel, kind: "battery+", voltsFixed: v };
    }
    if (netLabel.startsWith("BAT-:")) {
      return { label: `${ep.componentId}.${ep.pinId}`, netLabel, kind: "battery-", voltsFixed: 0 };
    }
    if (netLabel.startsWith("D")) {
      const n = Number(netLabel.slice(1));
      if (Number.isFinite(n)) return { label: `${ep.componentId}.${ep.pinId} → ${netLabel}`, netLabel, kind: "gpio", pinNum: n };
    }
    if (netLabel.startsWith("A")) {
      const n = Number(netLabel.slice(1));
      if (Number.isFinite(n)) return { label: `${ep.componentId}.${ep.pinId} → ${netLabel}`, netLabel, kind: "gpio", pinNum: 14 + n };
    }
  }
  return { label: `${ep.componentId}.${ep.pinId}`, netLabel, kind: "unknown" };
}

type TriggerEdge = "rising" | "falling" | "either" | "off";

export function SignalInspector({
  wire,
  components,
  net,
  pinStatesByBoard,
  pinEventsByBoard,
  initialX,
  initialY,
  onClose,
}: Props) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

  // ── Logic-analyser controls ─────────────────────────────────────────
  const [edge, setEdge] = useState<TriggerEdge>("either");
  /** Analog level threshold (0..1023). When the analog trace crosses this in
   *  the chosen edge direction the scope holds the trigger position. */
  const [level, setLevel] = useState(512);
  /** Span of the displayed window in virtual milliseconds. User-zoomable. */
  const [spanMs, setSpanMs] = useState(50);
  /** When true, freeze the display at the most recent triggered window. */
  const [hold, setHold] = useState(false);
  const heldWindowRef = useRef<{ start: number; end: number } | null>(null);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      setPos({ x: e.clientX - dragRef.current.ox, y: e.clientY - dragRef.current.oy });
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  const fromR = resolveEndpoint(wire.from, components, net);
  const toR = resolveEndpoint(wire.to, components, net);

  const findBoardSignal = (r: Resolved): { ps?: PinState; pinNum?: number; boardCompId?: string } => {
    if (r.kind !== "gpio" || r.pinNum === undefined) return {};
    if (r.boardCompId) {
      return { ps: pinStatesByBoard[r.boardCompId]?.[r.pinNum], pinNum: r.pinNum, boardCompId: r.boardCompId };
    }
    for (const [bid, states] of Object.entries(pinStatesByBoard)) {
      if (states[r.pinNum]) return { ps: states[r.pinNum], pinNum: r.pinNum, boardCompId: bid };
    }
    return { pinNum: r.pinNum };
  };

  const sigA = findBoardSignal(fromR);
  const sigB = findBoardSignal(toR);
  const sig = sigA.ps ? sigA : sigB;

  // Voltage display
  let voltage: string = "—";
  let levelText = "—";
  let levelClass = "text-muted-foreground";
  if (sig.ps) {
    const isHigh = sig.ps.digital === 1;
    voltage = isHigh ? "~5.0 V" : "~0.0 V";
    levelText = isHigh ? "HIGH" : "LOW";
    levelClass = isHigh ? "text-success" : "text-muted-foreground";
  } else if (fromR.voltsFixed !== undefined || toR.voltsFixed !== undefined) {
    const v = fromR.voltsFixed ?? toR.voltsFixed!;
    voltage = `${v.toFixed(2)} V`;
    levelText = v >= 2.5 ? "HIGH" : "LOW";
    levelClass = v >= 2.5 ? "text-success" : "text-muted-foreground";
  }

  const netLabel = fromR.netLabel ?? toR.netLabel ?? "—";

  // ── Real waveform from pinEventsByBoard ─────────────────────────────
  // Resubscribe on a fast interval so the SVG repaints even when no new
  // events have arrived (so the "now" cursor keeps moving on idle lines).
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => (n + 1) & 0xffff), 33);
    return () => window.clearInterval(id);
  }, []);

  // Reset hold window when the inspected wire or trigger config changes.
  useEffect(() => { heldWindowRef.current = null; }, [wire.id, edge, level, spanMs, hold]);

  /** All events for the resolved board+pin, oldest→newest. */
  const allEvents: PinEvent[] = useMemo(() => {
    if (!sig.boardCompId || sig.pinNum === undefined) return [];
    return pinEventsByBoard[sig.boardCompId]?.[sig.pinNum] ?? [];
  }, [pinEventsByBoard, sig.boardCompId, sig.pinNum]);

  /** Most recent event timestamp seen so far (in virtual ms). Falls back to
   *  the last event in the buffer to act as our "now" cursor. */
  const tNow = allEvents.length ? allEvents[allEvents.length - 1].t : 0;

  /** Find the most-recent edge that satisfies the trigger config. */
  const triggerT: number | null = useMemo(() => {
    if (edge === "off" || allEvents.length < 2) return null;
    for (let i = allEvents.length - 1; i >= 1; i--) {
      const cur = allEvents[i];
      const prev = allEvents[i - 1];
      const isRise = prev.d === 0 && cur.d === 1;
      const isFall = prev.d === 1 && cur.d === 0;
      if (edge === "rising" && isRise) return cur.t;
      if (edge === "falling" && isFall) return cur.t;
      if (edge === "either" && (isRise || isFall)) return cur.t;
    }
    return null;
  }, [allEvents, edge]);

  /** Visible time window. With hold, freeze on the last triggered window;
   *  otherwise track "now". When a trigger is present, center it 25% from
   *  the left edge so the user sees pre/post context. */
  const win = useMemo(() => {
    if (hold && heldWindowRef.current) return heldWindowRef.current;
    let end: number;
    let start: number;
    if (edge !== "off" && triggerT !== null) {
      const pre = spanMs * 0.25;
      const post = spanMs * 0.75;
      start = triggerT - pre;
      end = triggerT + post;
    } else {
      end = tNow;
      start = end - spanMs;
    }
    const w = { start, end };
    if (hold) heldWindowRef.current = w;
    return w;
  }, [hold, triggerT, tNow, spanMs, edge]);

  /** Slice events into the window plus one boundary sample on each side so
   *  step paths render correctly across the edges. */
  const visible = useMemo(() => {
    const out: PinEvent[] = [];
    let firstBefore: PinEvent | null = null;
    for (const ev of allEvents) {
      if (ev.t < win.start) { firstBefore = ev; continue; }
      if (ev.t > win.end) { out.push(ev); break; }
      out.push(ev);
    }
    if (firstBefore) return [firstBefore, ...out];
    return out;
  }, [allEvents, win]);

  // Frequency / duty over the visible window.
  const stats = useMemo(() => {
    if (visible.length < 2) {
      const d = sig.ps?.digital ?? 0;
      return { freq: 0, duty: d ? 100 : 0, edges: 0 };
    }
    let edges = 0;
    let highMs = 0;
    let totalMs = 0;
    for (let i = 1; i < visible.length; i++) {
      const a = Math.max(win.start, visible[i - 1].t);
      const b = Math.min(win.end, visible[i].t);
      const dt = Math.max(0, b - a);
      totalMs += dt;
      if (visible[i - 1].d) highMs += dt;
      if (visible[i].d !== visible[i - 1].d) edges++;
    }
    const seconds = (win.end - win.start) / 1000;
    const freq = seconds > 0 ? edges / 2 / seconds : 0;
    const duty = totalMs > 0 ? (highMs / totalMs) * 100 : 0;
    return { freq, duty, edges };
  }, [visible, win, sig.ps]);

  // SVG dimensions.
  const plotW = 248;
  const plotH = 36;
  const xOf = (t: number) => {
    const w = win.end - win.start;
    if (w <= 0) return 0;
    return ((t - win.start) / w) * plotW;
  };

  // Build digital step path from real events.
  const digitalPath = (() => {
    if (visible.length === 0) {
      const d = sig.ps?.digital ?? 0;
      const y = d ? 4 : plotH - 4;
      return `M 0 ${y} L ${plotW} ${y}`;
    }
    let path = "";
    // Prefix: hold the first sample's level from x=0 up to its event time.
    const first = visible[0];
    const yFirst = first.d ? 4 : plotH - 4;
    path += `M 0 ${yFirst}`;
    for (const ev of visible) {
      const x = Math.max(0, Math.min(plotW, xOf(ev.t)));
      const y = ev.d ? 4 : plotH - 4;
      path += ` H ${x} V ${y}`;
    }
    // Extend final level to the right edge.
    path += ` H ${plotW}`;
    return path;
  })();

  // Trigger marker x position within the plot.
  const trigX = triggerT !== null && triggerT >= win.start && triggerT <= win.end
    ? xOf(triggerT) : null;

  // Analog plot: we don't get analog events from the worker, so draw a line
  // at the current analog value across the window with the trigger level
  // overlaid as a dashed reference.
  const currentAnalog = sig.ps?.analog ?? ((fromR.voltsFixed ?? toR.voltsFixed ?? 0) >= 2.5 ? 1023 : 0);
  const analogY = (v: number) => plotH - 2 - (Math.max(0, Math.min(1023, v)) / 1023) * (plotH - 4);
  const levelY = analogY(level);

  return (
    <div
      className="fixed z-50 w-[280px] rounded-lg border border-border bg-card/95 backdrop-blur shadow-2xl text-xs select-none"
      style={{ left: pos.x, top: pos.y }}
    >
      <div
        className="flex items-center gap-2 px-2 py-1.5 border-b border-border cursor-grab active:cursor-grabbing"
        onMouseDown={(e) => {
          dragRef.current = { ox: e.clientX - pos.x, oy: e.clientY - pos.y, px: pos.x, py: pos.y };
        }}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <Activity className="h-3.5 w-3.5 text-primary" />
        <span className="font-semibold flex-1">Signal Inspector</span>
        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={onClose}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Net</span>
          <span className="font-mono text-primary">{netLabel}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Level</span>
          <span className={`font-mono font-semibold ${levelClass}`}>{levelText}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Voltage</span>
          <span className="font-mono">{voltage}</span>
        </div>

        {sig.ps && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Mode</span>
              <span className="font-mono">{sig.ps.mode}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Digital</span>
              <span className="font-mono">{sig.ps.digital}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Analog</span>
              <span className="font-mono">{sig.ps.analog}</span>
            </div>
            {sig.ps.mode === "OUTPUT" && sig.ps.analog > 0 && sig.ps.analog < 255 && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">PWM duty</span>
                <span className="font-mono">{Math.round((sig.ps.analog / 255) * 100)}%</span>
              </div>
            )}
            {sig.boardCompId && sig.pinNum !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Pin</span>
                <span className="font-mono">{sig.boardCompId} · #{sig.pinNum}</span>
              </div>
            )}
          </>
        )}

        {/* ── Trigger controls ── */}
        <div className="border-t border-border pt-2 mt-1.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Trigger</span>
            <div className="flex items-center gap-1">
              <Button
                size="sm" variant="ghost" className="h-5 w-5 p-0"
                title={hold ? "Resume" : "Hold"}
                onClick={() => setHold((h) => !h)}
              >
                {hold ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
              </Button>
              <Button
                size="sm" variant="ghost" className="h-5 w-5 p-0"
                title="Zoom in (shorter window)"
                onClick={() => setSpanMs((s) => Math.max(1, s / 2))}
              >
                <ZoomIn className="h-3 w-3" />
              </Button>
              <Button
                size="sm" variant="ghost" className="h-5 w-5 p-0"
                title="Zoom out (longer window)"
                onClick={() => setSpanMs((s) => Math.min(10_000, s * 2))}
              >
                <ZoomOut className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1">
            {(["rising", "falling", "either", "off"] as TriggerEdge[]).map((e) => (
              <button
                key={e}
                onClick={() => setEdge(e)}
                className={`h-6 rounded border text-[10px] font-mono uppercase tracking-wide transition-colors
                  ${edge === e
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border bg-background/40 text-muted-foreground hover:bg-background/80"}`}
                title={`Trigger on ${e} edge`}
              >
                {e === "rising" ? "↑" : e === "falling" ? "↓" : e === "either" ? "↕" : "—"}
                <span className="ml-1">{e}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted-foreground w-10">Level</span>
            <input
              type="range" min={0} max={1023} step={1}
              value={level}
              onChange={(e) => setLevel(Number(e.target.value))}
              className="flex-1 accent-primary"
            />
            <span className="font-mono text-[10px] tabular-nums w-10 text-right">{level}</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[9px] text-muted-foreground">
            <span>Span: {spanMs >= 1000 ? `${(spanMs / 1000).toFixed(1)}s` : `${spanMs.toFixed(spanMs < 10 ? 1 : 0)}ms`}</span>
            <span>{hold ? "HOLD" : edge !== "off" && triggerT !== null ? "TRIG'D" : "RUN"}</span>
          </div>
        </div>

        {/* ── Real waveform ── */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Waveform</span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {stats.freq > 0
                ? `${stats.freq >= 1000 ? (stats.freq / 1000).toFixed(2) + " kHz" : stats.freq.toFixed(1) + " Hz"} · ${stats.duty.toFixed(0)}% duty`
                : `${stats.duty.toFixed(0)}% duty · ${stats.edges} edges`}
            </span>
          </div>
          {/* Digital trace */}
          <div className="rounded border border-border/60 bg-background/60 px-1 py-0.5">
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] w-6 text-success">D</span>
              <svg width={plotW} height={plotH} className="overflow-visible">
                <line x1={0} y1={plotH - 4} x2={plotW} y2={plotH - 4} stroke="var(--color-border)" strokeWidth={0.5} strokeDasharray="2 3" />
                <line x1={0} y1={4} x2={plotW} y2={4} stroke="var(--color-border)" strokeWidth={0.5} strokeDasharray="2 3" />
                <path d={digitalPath} fill="none" stroke="oklch(0.78 0.22 145)" strokeWidth={1.4} strokeLinejoin="miter" />
                {trigX !== null && (
                  <line x1={trigX} y1={0} x2={trigX} y2={plotH} stroke="oklch(0.75 0.2 30)" strokeWidth={0.8} strokeDasharray="2 2" />
                )}
                {/* live "now" cursor */}
                <line x1={plotW - 0.5} y1={0} x2={plotW - 0.5} y2={plotH} stroke="var(--color-primary)" strokeWidth={0.6} opacity={0.5} />
              </svg>
            </div>
          </div>
          {/* Analog trace */}
          <div className="rounded border border-border/60 bg-background/60 px-1 py-0.5">
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] w-6 text-warning">A</span>
              <svg width={plotW} height={plotH} className="overflow-visible">
                <line x1={0} y1={plotH / 2} x2={plotW} y2={plotH / 2} stroke="var(--color-border)" strokeWidth={0.5} strokeDasharray="2 3" />
                {/* trigger level reference */}
                <line x1={0} y1={levelY} x2={plotW} y2={levelY} stroke="oklch(0.75 0.2 30)" strokeWidth={0.6} strokeDasharray="3 2" />
                {/* current analog as a flat line (no per-event analog samples yet) */}
                <line x1={0} y1={analogY(currentAnalog)} x2={plotW} y2={analogY(currentAnalog)} stroke="oklch(0.78 0.18 60)" strokeWidth={1.2} />
                <line x1={plotW - 0.5} y1={0} x2={plotW - 0.5} y2={plotH} stroke="var(--color-primary)" strokeWidth={0.6} opacity={0.5} />
              </svg>
            </div>
            <div className="flex items-center justify-between font-mono text-[9px] text-muted-foreground pl-7 pr-1">
              <span>0</span>
              <span className="tabular-nums">{currentAnalog}</span>
              <span>1023</span>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-1.5 mt-1.5 space-y-0.5">
          <div className="text-muted-foreground">Endpoints</div>
          <div className="font-mono text-[11px] truncate" title={fromR.label}>↗ {fromR.label}</div>
          <div className="font-mono text-[11px] truncate" title={toR.label}>↘ {toR.label}</div>
        </div>
      </div>
    </div>
  );
}
