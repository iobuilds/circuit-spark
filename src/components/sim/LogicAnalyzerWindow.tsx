// Full-window Logic Analyzer popup. Multi-channel real-time capture from
// `pinEventsByBoard`, mouse-wheel zoom + drag pan, per-channel protocol
// decoders (Binary / UART / I2C / SPI), and add/remove channels for any
// Arduino pin on the inspected board.

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { X, Plus, Trash2, Pause, Play, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PinEvent, PinState } from "@/sim/types";
import { useSimStore } from "@/sim/store";

type Decoder = "binary" | "uart" | "i2c" | "spi";
interface Channel {
  id: string;
  pin: number;
  label: string;
  /** For paired decoders (I2C/SPI), the secondary pin (e.g. SCL alongside SDA). */
  pin2?: number;
  decoder: Decoder;
  /** UART baud rate. */
  baud?: number;
}

interface Props {
  boardId: string;
  initialPin: number;
  initialLabel: string;
  pinStates: Record<number, PinState>;
  pinEvents: Record<number, PinEvent[]>;
  onClose: () => void;
}

const ARDUINO_PIN_LABELS: Record<number, string> = {
  0: "D0/RX", 1: "D1/TX", 2: "D2", 3: "D3~", 4: "D4", 5: "D5~", 6: "D6~",
  7: "D7", 8: "D8", 9: "D9~", 10: "D10~", 11: "D11~", 12: "D12", 13: "D13",
  14: "A0", 15: "A1", 16: "A2", 17: "A3", 18: "A4/SDA", 19: "A5/SCL",
};

const CH_COLORS = [
  "oklch(0.78 0.22 145)", // green
  "oklch(0.78 0.18 60)",  // amber
  "oklch(0.72 0.2 260)",  // blue
  "oklch(0.78 0.2 30)",   // orange
  "oklch(0.75 0.22 320)", // magenta
  "oklch(0.78 0.2 200)",  // cyan
];

const MIN_SPAN_MS = 0.05;
const MAX_SPAN_MS = 60_000;
const CHANNEL_LABEL_W = 130;
const CHANNEL_GAP_W = 8;
const PLOT_SIDE_PAD = 16;

function clonePinEvents(source: Record<number, PinEvent[]>): Record<number, PinEvent[]> {
  const snap: Record<number, PinEvent[]> = {};
  for (const [pin, events] of Object.entries(source ?? {})) {
    snap[Number(pin)] = events.slice();
  }
  return snap;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("button, select, input, textarea, a"));
}

function defaultDecoder(pin: number): { decoder: Decoder; pin2?: number; baud?: number } {
  if (pin === 18) return { decoder: "i2c", pin2: 19 }; // SDA → pair with SCL
  if (pin === 19) return { decoder: "i2c", pin2: 18 };
  if (pin === 0 || pin === 1) return { decoder: "uart", baud: 9600 };
  return { decoder: "binary" };
}

export function LogicAnalyzerWindow({
  boardId,
  initialPin,
  initialLabel,
  pinStates,
  pinEvents,
  onClose,
}: Props) {
  // Repaint on tick.
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => (n + 1) & 0xffff), 33);
    return () => window.clearInterval(id);
  }, []);

  const simTimeMs = useSimStore((s) => s.simTimeMs);

  // Channels — start with the inspected pin, plus its paired pin for I2C.
  const [channels, setChannels] = useState<Channel[]>(() => {
    const def = defaultDecoder(initialPin);
    const list: Channel[] = [
      { id: `ch-${initialPin}`, pin: initialPin, label: initialLabel || ARDUINO_PIN_LABELS[initialPin] || `Pin ${initialPin}`, ...def },
    ];
    // Auto-add the paired line for I2C so users see SDA+SCL together.
    if (def.decoder === "i2c" && def.pin2 !== undefined && def.pin2 !== initialPin) {
      list.push({
        id: `ch-${def.pin2}`,
        pin: def.pin2,
        label: ARDUINO_PIN_LABELS[def.pin2] ?? `Pin ${def.pin2}`,
        decoder: "binary", // the partner shows raw waveform
      });
    }
    return list;
  });

  // Time-base (window span in ms) and view offset (end time = simTimeMs - offsetMs).
  const [spanMs, setSpanMs] = useState(50);
  const [paused, setPaused] = useState(false);
  /** When paused, this is the frozen window end. When live, it's tNow. */
  const [frozenEnd, setFrozenEnd] = useState<number | null>(null);
  /** Captured event snapshot used while paused/inspecting so live edges do not move under the cursor. */
  const [frozenEvents, setFrozenEvents] = useState<Record<number, PinEvent[]> | null>(null);
  /** Pan offset (ms) — positive moves view to the past. */
  const [panMs, setPanMs] = useState(0);

  const allEvents = useCallback(
    (pin: number): PinEvent[] => (paused && frozenEvents ? frozenEvents : pinEvents)?.[pin] ?? [],
    [paused, frozenEvents, pinEvents],
  );

  const liveEnd = useMemo(() => {
    let t = simTimeMs;
    for (const ch of channels) {
      const evs = pinEvents?.[ch.pin] ?? [];
      if (evs.length) t = Math.max(t, evs[evs.length - 1].t);
    }
    return t;
  }, [simTimeMs, channels, pinEvents]);

  const ensurePausedCapture = useCallback(() => {
    const baseEnd = paused && frozenEnd !== null ? frozenEnd : liveEnd;
    if (!paused || !frozenEvents) {
      setFrozenEvents(clonePinEvents(pinEvents));
      setFrozenEnd(baseEnd);
      setPaused(true);
    }
    return baseEnd;
  }, [paused, frozenEnd, liveEnd, frozenEvents, pinEvents]);

  const resumeLive = useCallback(() => {
    setPaused(false);
    setFrozenEnd(null);
    setFrozenEvents(null);
    setPanMs(0);
  }, []);

  const togglePause = useCallback(() => {
    if (paused) {
      resumeLive();
      return;
    }
    setFrozenEvents(clonePinEvents(pinEvents));
    setFrozenEnd(liveEnd);
    setPaused(true);
    setPanMs(0);
  }, [paused, resumeLive, pinEvents, liveEnd]);

  const winEnd = paused && frozenEnd !== null ? frozenEnd - panMs : liveEnd - panMs;
  const winStart = winEnd - spanMs;

  // Plot dimensions — track container width.
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotW, setPlotW] = useState(900);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setPlotW(Math.max(300, el.clientWidth - 140));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const xOf = (t: number) => {
    const w = winEnd - winStart;
    if (w <= 0) return 0;
    return ((t - winStart) / w) * plotW;
  };

  // Wheel: zoom around cursor; Shift+wheel pan.
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.shiftKey) {
      setPanMs((p) => Math.max(0, p + (e.deltaY > 0 ? spanMs * 0.1 : -spanMs * 0.1)));
      return;
    }
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    const px = e.clientX - rect.left - 60;
    const frac = Math.max(0, Math.min(1, px / plotW));
    const tCursor = winStart + frac * spanMs;
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    const nextSpan = Math.max(0.05, Math.min(60_000, spanMs * factor));
    // Keep tCursor under the cursor: adjust panMs so winEnd stays sensible.
    const nextWinStart = tCursor - frac * nextSpan;
    const nextWinEnd = nextWinStart + nextSpan;
    const baseEnd = paused && frozenEnd !== null ? frozenEnd : liveEnd;
    setSpanMs(nextSpan);
    setPanMs(Math.max(0, baseEnd - nextWinEnd));
  };

  // Drag pan.
  const dragRef = useRef<{ startX: number; startPan: number } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startPan: panMs };
  };
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dt = (dx / plotW) * spanMs;
      setPanMs(Math.max(0, dragRef.current.startPan + dt));
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [plotW, spanMs]);

  // ── Decoders ────────────────────────────────────────────────────────
  /** Build the digital step path. */
  function buildDigitalPath(events: PinEvent[], h: number, padTop = 6, padBot = 6): string {
    const visible: PinEvent[] = [];
    let firstBefore: PinEvent | null = null;
    for (const ev of events) {
      if (ev.t < winStart) { firstBefore = ev; continue; }
      if (ev.t > winEnd) { visible.push(ev); break; }
      visible.push(ev);
    }
    const seq = firstBefore ? [firstBefore, ...visible] : visible;
    if (seq.length === 0) {
      const last = events.length ? events[events.length - 1].d : 1;
      const y = last ? padTop : h - padBot;
      return `M 0 ${y} L ${plotW} ${y}`;
    }
    const yOf = (d: 0 | 1) => (d ? padTop : h - padBot);
    let p = `M 0 ${yOf(seq[0].d)}`;
    for (const ev of seq) {
      const x = Math.max(0, Math.min(plotW, xOf(ev.t)));
      p += ` H ${x} V ${yOf(ev.d)}`;
    }
    p += ` H ${plotW}`;
    return p;
  }

  /** UART decoder: reconstruct bytes from start/data/stop bits at the given baud. */
  function decodeUart(events: PinEvent[], baud: number): { t: number; byte: number; ok: boolean }[] {
    const bitMs = 1000 / baud;
    const out: { t: number; byte: number; ok: boolean }[] = [];
    if (events.length < 2) return out;
    // Build a level lookup: for any t in window return d.
    let i = 0;
    while (i < events.length && events[i].t < winStart - 100) i++;
    // Find every falling edge as a candidate start bit.
    for (let k = Math.max(1, i); k < events.length; k++) {
      const prev = events[k - 1];
      const cur = events[k];
      if (!(prev.d === 1 && cur.d === 0)) continue;
      if (cur.t > winEnd) break;
      const startT = cur.t;
      // Sample 8 data bits at startT + 1.5*bitMs, +2.5*bitMs, ...
      let byte = 0;
      const sampleAt = (t: number): 0 | 1 => {
        // Find last event <= t
        let lo = 0, hi = events.length - 1, ans = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (events[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return ans >= 0 ? events[ans].d : 1;
      };
      for (let b = 0; b < 8; b++) {
        const s = sampleAt(startT + (1.5 + b) * bitMs);
        if (s) byte |= 1 << b; // LSB first
      }
      const stop = sampleAt(startT + 9.5 * bitMs);
      out.push({ t: startT, byte: byte & 0xff, ok: stop === 1 });
    }
    return out;
  }

  /** I2C decoder: requires SDA + SCL events. Detects START/STOP and decodes bytes. */
  function decodeI2c(sda: PinEvent[], scl: PinEvent[]): { t: number; text: string; kind: "start" | "stop" | "byte" }[] {
    const out: { t: number; text: string; kind: "start" | "stop" | "byte" }[] = [];
    if (!sda.length || !scl.length) return out;
    // Merge edges in time order.
    type Ev = { t: number; line: "sda" | "scl"; d: 0 | 1 };
    const merged: Ev[] = [];
    for (const e of sda) merged.push({ t: e.t, line: "sda", d: e.d });
    for (const e of scl) merged.push({ t: e.t, line: "scl", d: e.d });
    merged.sort((a, b) => a.t - b.t);
    let sdaL: 0 | 1 = 1, sclL: 0 | 1 = 1;
    let inTxn = false;
    let bits: number[] = [];
    let byteStartT = 0;
    for (const e of merged) {
      if (e.t > winEnd + 50) break;
      const prevSda = sdaL, prevScl = sclL;
      if (e.line === "sda") sdaL = e.d; else sclL = e.d;
      // START: SCL high, SDA falls
      if (e.line === "sda" && prevSda === 1 && sdaL === 0 && sclL === 1) {
        if (e.t >= winStart - 5 && e.t <= winEnd + 5) out.push({ t: e.t, text: "S", kind: "start" });
        inTxn = true; bits = []; byteStartT = e.t;
        continue;
      }
      // STOP: SCL high, SDA rises
      if (e.line === "sda" && prevSda === 0 && sdaL === 1 && sclL === 1) {
        if (e.t >= winStart - 5 && e.t <= winEnd + 5) out.push({ t: e.t, text: "P", kind: "stop" });
        inTxn = false; bits = [];
        continue;
      }
      // Sample SDA on SCL rising edge
      if (e.line === "scl" && prevScl === 0 && sclL === 1 && inTxn) {
        if (bits.length === 0) byteStartT = e.t;
        bits.push(sdaL);
        if (bits.length === 9) {
          let byte = 0;
          for (let i = 0; i < 8; i++) byte = (byte << 1) | bits[i];
          const ack = bits[8] === 0 ? "A" : "N";
          if (byteStartT >= winStart - 5 && byteStartT <= winEnd + 5) {
            out.push({ t: byteStartT, text: `0x${byte.toString(16).padStart(2, "0")}${ack}`, kind: "byte" });
          }
          bits = [];
        }
      }
    }
    return out;
  }

  // Channel row height
  const ROW_H = 56;

  // Available pins to add (pins seen in pinStates, plus standard set)
  const availablePins = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i <= 19; i++) set.add(i);
    for (const k of Object.keys(pinStates)) set.add(Number(k));
    return Array.from(set).sort((a, b) => a - b);
  }, [pinStates]);

  // Time grid: 10 vertical divisions
  const gridLines = Array.from({ length: 11 }, (_, i) => i / 10);

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Title bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <Maximize2 className="h-4 w-4 text-primary" />
        <h2 className="font-semibold">Logic Analyzer</h2>
        <span className="text-xs text-muted-foreground">{boardId}</span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">Span</span>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSpanMs((s) => Math.max(0.05, s / 2))}><ZoomIn className="h-3.5 w-3.5" /></Button>
          <span className="font-mono w-16 text-center tabular-nums">
            {spanMs >= 1000 ? `${(spanMs / 1000).toFixed(2)}s` : spanMs >= 1 ? `${spanMs.toFixed(1)}ms` : `${(spanMs * 1000).toFixed(0)}µs`}
          </span>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSpanMs((s) => Math.min(60_000, s * 2))}><ZoomOut className="h-3.5 w-3.5" /></Button>
        </div>
        <Button
          size="sm"
          variant={paused ? "default" : "outline"}
          className="h-7"
          onClick={() => {
            if (paused) { setPaused(false); setFrozenEnd(null); setPanMs(0); }
            else { setPaused(true); setFrozenEnd(liveEnd); }
          }}
        >
          {paused ? <><Play className="h-3 w-3 mr-1" />Run</> : <><Pause className="h-3 w-3 mr-1" />Pause</>}
        </Button>
        <Button size="sm" variant="outline" className="h-7" onClick={() => { setPanMs(0); setFrozenEnd(null); }}>
          Live
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose} title="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Toolbar: add channel */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50 text-xs">
        <span className="text-muted-foreground">Channels</span>
        <select
          className="h-7 rounded border border-border bg-background px-2 text-xs"
          value=""
          onChange={(e) => {
            const pin = Number(e.target.value);
            if (Number.isNaN(pin)) return;
            if (channels.find((c) => c.pin === pin)) return;
            const def = defaultDecoder(pin);
            setChannels((cs) => [...cs, {
              id: `ch-${pin}-${Date.now()}`, pin,
              label: ARDUINO_PIN_LABELS[pin] ?? `Pin ${pin}`,
              ...def,
            }]);
            e.currentTarget.value = "";
          }}
        >
          <option value="">+ Add channel…</option>
          {availablePins
            .filter((p) => !channels.find((c) => c.pin === p))
            .map((p) => (
              <option key={p} value={p}>{ARDUINO_PIN_LABELS[p] ?? `Pin ${p}`}</option>
            ))}
        </select>
        <span className="text-muted-foreground ml-4">Tip: scroll to zoom · drag to pan · Shift+scroll to pan</span>
      </div>

      {/* Plot area */}
      <div
        ref={plotRef}
        className="flex-1 overflow-auto bg-background"
        onWheel={onWheel}
      >
        <div className="px-4 py-3 space-y-1">
          {channels.map((ch, idx) => {
            const events = allEvents(ch.pin);
            const color = CH_COLORS[idx % CH_COLORS.length];
            const path = buildDigitalPath(events, ROW_H);
            // Decoded annotations
            let annotations: { t: number; text: string; kind?: string }[] = [];
            if (ch.decoder === "uart") {
              annotations = decodeUart(events, ch.baud ?? 9600).map((b) => ({
                t: b.t, text: `0x${b.byte.toString(16).padStart(2, "0")}${b.byte >= 32 && b.byte < 127 ? " '" + String.fromCharCode(b.byte) + "'" : ""}${b.ok ? "" : "!"}`,
              }));
            } else if (ch.decoder === "i2c" && ch.pin2 !== undefined) {
              const sda = events;
              const scl = allEvents(ch.pin2);
              annotations = decodeI2c(sda, scl);
            }
            return (
              <div key={ch.id} className="flex items-stretch gap-2 group">
                {/* Channel header */}
                <div className="w-[130px] shrink-0 flex flex-col justify-center px-2 py-1 rounded border border-border bg-card">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-xs font-semibold" style={{ color }}>
                      {ch.label}
                    </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      onClick={() => setChannels((cs) => cs.filter((c) => c.id !== ch.id))}
                      title="Remove channel"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <select
                    className="mt-1 h-5 rounded bg-background border border-border text-[10px] px-1"
                    value={ch.decoder}
                    onChange={(e) => {
                      const dec = e.target.value as Decoder;
                      setChannels((cs) => cs.map((c) => c.id === ch.id ? {
                        ...c, decoder: dec,
                        baud: dec === "uart" ? (c.baud ?? 9600) : c.baud,
                        pin2: dec === "i2c" ? (c.pin2 ?? (ch.pin === 18 ? 19 : ch.pin === 19 ? 18 : undefined)) : c.pin2,
                      } : c));
                    }}
                  >
                    <option value="binary">Binary</option>
                    <option value="uart">UART</option>
                    <option value="i2c">I²C</option>
                    <option value="spi">SPI</option>
                  </select>
                  {ch.decoder === "uart" && (
                    <select
                      className="mt-1 h-5 rounded bg-background border border-border text-[10px] px-1"
                      value={ch.baud ?? 9600}
                      onChange={(e) => {
                        const baud = Number(e.target.value);
                        setChannels((cs) => cs.map((c) => c.id === ch.id ? { ...c, baud } : c));
                      }}
                    >
                      {[300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400].map((b) => (
                        <option key={b} value={b}>{b} bd</option>
                      ))}
                    </select>
                  )}
                  {ch.decoder === "i2c" && (
                    <select
                      className="mt-1 h-5 rounded bg-background border border-border text-[10px] px-1"
                      value={ch.pin2 ?? 19}
                      onChange={(e) => {
                        const pin2 = Number(e.target.value);
                        setChannels((cs) => cs.map((c) => c.id === ch.id ? { ...c, pin2 } : c));
                      }}
                    >
                      {availablePins.filter((p) => p !== ch.pin).map((p) => (
                        <option key={p} value={p}>SCL: {ARDUINO_PIN_LABELS[p] ?? p}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Channel waveform */}
                <div
                  className="flex-1 relative rounded border border-border/60 bg-card/40 cursor-grab active:cursor-grabbing"
                  onMouseDown={onMouseDown}
                >
                  <svg width={plotW} height={ROW_H} className="block">
                    {/* grid */}
                    {gridLines.map((f, i) => (
                      <line key={i} x1={f * plotW} y1={0} x2={f * plotW} y2={ROW_H}
                        stroke="hsl(var(--border))" strokeOpacity={i === 0 || i === 10 ? 0.6 : 0.2} strokeWidth={0.5} />
                    ))}
                    {/* mid line */}
                    <line x1={0} y1={ROW_H / 2} x2={plotW} y2={ROW_H / 2} stroke="hsl(var(--border))" strokeOpacity={0.25} strokeWidth={0.5} strokeDasharray="2 3" />
                    {/* trace */}
                    <path d={path} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="miter" />
                    {/* decoded annotations */}
                    {annotations.map((a, i) => {
                      const x = xOf(a.t);
                      if (x < -5 || x > plotW + 5) return null;
                      return (
                        <g key={i}>
                          <line x1={x} y1={2} x2={x} y2={ROW_H - 2} stroke={color} strokeOpacity={0.35} strokeWidth={0.6} strokeDasharray="2 2" />
                          <rect x={x + 2} y={ROW_H - 18} width={a.text.length * 6 + 6} height={14} rx={2}
                            fill="hsl(var(--card))" stroke={color} strokeOpacity={0.6} strokeWidth={0.6} />
                          <text x={x + 5} y={ROW_H - 7} fontFamily="ui-monospace, monospace" fontSize={9} fill={color}>{a.text}</text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              </div>
            );
          })}
          {channels.length === 0 && (
            <div className="text-center text-muted-foreground py-12 text-sm">
              No channels. Use “+ Add channel…” above to begin capturing.
            </div>
          )}
        </div>

        {/* Time axis */}
        <div className="px-4 pb-3">
          <div className="flex items-stretch gap-2">
            <div className="w-[130px] shrink-0" />
            <div className="flex-1 flex justify-between font-mono text-[10px] text-muted-foreground tabular-nums">
              {gridLines.map((f, i) => {
                const t = winStart + f * spanMs;
                const ms = t;
                const lbl = ms >= 1000
                  ? `${(ms / 1000).toFixed(2)}s`
                  : ms >= 1
                  ? `${ms.toFixed(1)}ms`
                  : `${(ms * 1000).toFixed(0)}µs`;
                return <span key={i} style={{ flex: i === 0 || i === 10 ? "0 0 auto" : 1, textAlign: i === 10 ? "right" : "left" }}>{lbl}</span>;
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1.5 border-t border-border bg-card text-[11px] font-mono text-muted-foreground">
        <span>{paused ? "⏸ PAUSED" : "● LIVE"}</span>
        <span>t = {(winEnd).toFixed(2)} ms</span>
        <span>Δ = {spanMs >= 1 ? `${spanMs.toFixed(2)} ms` : `${(spanMs * 1000).toFixed(1)} µs`}</span>
        <span>Pan = {panMs.toFixed(1)} ms</span>
        <span>Channels: {channels.length}</span>
      </div>
    </div>
  );
}
