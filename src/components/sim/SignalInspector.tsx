import { useEffect, useRef, useState } from "react";
import { X, GripVertical, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Wire, CircuitComponent, PinState } from "@/sim/types";
import type { NetGraph } from "@/sim/netlist";
import { findUnoPin } from "@/sim/uno-pins";

interface Props {
  wire: Wire;
  components: CircuitComponent[];
  net: NetGraph;
  pinStatesByBoard: Record<string, Record<number, PinState>>;
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

  // For non-board endpoints, infer from netLabel.
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

export function SignalInspector({
  wire,
  components,
  net,
  pinStatesByBoard,
  initialX,
  initialY,
  onClose,
}: Props) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null);

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

  // Find the most informative side (a GPIO endpoint with a board) to show signal details.
  // If both sides resolve to the same net (they must, because the wire is in that net),
  // pick whichever has board pinState.
  const findBoardSignal = (r: Resolved): { ps?: PinState; pinNum?: number; boardCompId?: string } => {
    if (r.kind !== "gpio" || r.pinNum === undefined) return {};
    // Prefer explicit boardCompId; otherwise scan all boards to find any with this pin.
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
    if (sig.ps.mode === "OUTPUT") {
      voltage = isHigh ? "~5.0 V" : "~0.0 V";
    } else {
      voltage = isHigh ? "~5.0 V" : "~0.0 V";
    }
    levelText = isHigh ? "HIGH" : "LOW";
    levelClass = isHigh ? "text-success" : "text-muted-foreground";
  } else if (fromR.voltsFixed !== undefined || toR.voltsFixed !== undefined) {
    const v = fromR.voltsFixed ?? toR.voltsFixed!;
    voltage = `${v.toFixed(2)} V`;
    levelText = v >= 2.5 ? "HIGH" : "LOW";
    levelClass = v >= 2.5 ? "text-success" : "text-muted-foreground";
  }

  const netLabel = fromR.netLabel ?? toR.netLabel ?? "—";

  return (
    <div
      className="fixed z-50 w-72 rounded-lg border border-border bg-card/95 backdrop-blur shadow-2xl text-xs select-none"
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

        <div className="border-t border-border pt-1.5 mt-1.5 space-y-0.5">
          <div className="text-muted-foreground">Endpoints</div>
          <div className="font-mono text-[11px] truncate" title={fromR.label}>↗ {fromR.label}</div>
          <div className="font-mono text-[11px] truncate" title={toR.label}>↘ {toR.label}</div>
        </div>
      </div>
    </div>
  );
}
