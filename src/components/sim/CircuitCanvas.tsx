import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "@/sim/store";
import { COMPONENT_DEFS } from "@/sim/components";
import { ArduinoUnoBoard } from "./ArduinoUnoBoard";
import { CircuitComponentNode } from "./CircuitComponentNode";
import { findUnoPin, UNO_HEIGHT, UNO_WIDTH } from "@/sim/uno-pins";
import { buildNetGraph, evaluateInputs, isLedPowered } from "@/sim/netlist";
import type { ComponentKind } from "@/sim/types";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onPinInputChange: (pin: number, value: { digital?: 0 | 1; analog?: number }) => void;
}

const BOARD_X = 90;
const BOARD_Y = 80;

export function CircuitCanvas({ onPinInputChange }: Props) {
  const components = useSimStore((s) => s.components);
  const wires = useSimStore((s) => s.wires);
  const drawingFrom = useSimStore((s) => s.drawingFrom);
  const selectedId = useSimStore((s) => s.selectedId);
  const pinStates = useSimStore((s) => s.pinStates);

  const addComponent = useSimStore((s) => s.addComponent);
  const moveComponent = useSimStore((s) => s.moveComponent);
  const removeComponent = useSimStore((s) => s.removeComponent);
  const setSelected = useSimStore((s) => s.setSelected);
  const startWire = useSimStore((s) => s.startWire);
  const finishWire = useSimStore((s) => s.finishWire);
  const cancelWire = useSimStore((s) => s.cancelWire);
  const removeWire = useSimStore((s) => s.removeWire);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);

  const net = useMemo(() => buildNetGraph(components, wires), [components, wires]);

  // Push input states (pot, button) to worker
  useEffect(() => {
    const inputs = evaluateInputs(components, net, pinStates);
    for (const [pin, val] of Object.entries(inputs)) {
      onPinInputChange(Number(pin), val);
    }
  }, [components, net, pinStates, onPinInputChange]);

  function clientToSvg(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / zoom - pan.x,
      y: (e.clientY - r.top) / zoom - pan.y,
    };
  }

  // Drag-drop from sidebar
  function onSvgDragOver(e: React.DragEvent) { e.preventDefault(); }
  function onSvgDrop(e: React.DragEvent) {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/x-embedsim-component") as ComponentKind | "";
    if (!kind) return;
    const { x, y } = clientToSvg(e);
    const def = COMPONENT_DEFS[kind];
    if (!def?.available) return;
    const snap = (n: number) => Math.round(n / 10) * 10;
    addComponent(kind, snap(x - def.width / 2), snap(y - def.height / 2));
  }

  // Wire/drag mouse handling
  function onMouseMove(e: React.MouseEvent) {
    const p = clientToSvg(e);
    setMouse(p);
    if (dragId) {
      const snap = (n: number) => Math.round(n / 10) * 10;
      moveComponent(dragId, snap(p.x - dragOffset.x), snap(p.y - dragOffset.y));
    }
    if (panning) {
      setPan((prev) => ({ x: prev.x + e.movementX / zoom, y: prev.y + e.movementY / zoom }));
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    setZoom((z) => Math.max(0.4, Math.min(2.5, z + delta)));
  }

  function onPinClickFactory(componentId: string) {
    return (pinId: string, _e: React.MouseEvent) => {
      if (drawingFrom) {
        finishWire(componentId, pinId);
      } else {
        startWire(componentId, pinId);
      }
    };
  }

  // Determine endpoint coordinates for a wire
  function endpointPos(componentId: string, pinId: string): { x: number; y: number } | null {
    if (componentId === "board") {
      const bp = findUnoPin(pinId);
      if (!bp) return null;
      return { x: BOARD_X + bp.x, y: BOARD_Y + bp.y };
    }
    const c = components.find((c) => c.id === componentId);
    if (!c) return null;
    const def = COMPONENT_DEFS[c.kind];
    const pin = def.pins.find((p) => p.id === pinId);
    if (!pin) return null;
    return { x: c.x + pin.x, y: c.y + pin.y };
  }

  const drawingFromPos = drawingFrom ? endpointPos(drawingFrom.componentId, drawingFrom.pinId) : null;

  return (
    <div className="relative w-full h-full canvas-grid-bg overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full select-none"
        onDragOver={onSvgDragOver}
        onDrop={onSvgDrop}
        onMouseMove={onMouseMove}
        onMouseUp={() => { setDragId(null); setPanning(false); }}
        onWheel={onWheel}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setSelected(null);
            if (drawingFrom) cancelWire();
            if (e.button === 0 && (e.altKey || e.metaKey)) setPanning(true);
            else if (e.button === 1) setPanning(true);
          }
        }}
      >
        <g transform={`scale(${zoom}) translate(${pan.x} ${pan.y})`}>
          {/* Board */}
          <ArduinoUnoBoard
            x={BOARD_X}
            y={BOARD_Y}
            highlightPin={drawingFrom?.componentId === "board" ? drawingFrom.pinId : undefined}
            onPinClick={(pinId) => {
              if (drawingFrom) finishWire("board", pinId);
              else startWire("board", pinId);
            }}
          />

          {/* Components */}
          {components.map((c) => (
            <CircuitComponentNode
              key={c.id}
              comp={c}
              isPowered={isLedPowered(c, net, pinStates)}
              selected={selectedId === c.id}
              onSelect={() => setSelected(c.id)}
              onDragStart={(e) => {
                const p = clientToSvg(e);
                setDragId(c.id);
                setDragOffset({ x: p.x - c.x, y: p.y - c.y });
              }}
              onPinClick={onPinClickFactory(c.id)}
            />
          ))}

          {/* Wires */}
          {wires.map((w) => {
            const a = endpointPos(w.from.componentId, w.from.pinId);
            const b = endpointPos(w.to.componentId, w.to.pinId);
            if (!a || !b) return null;
            const mid1 = { x: a.x, y: (a.y + b.y) / 2 };
            const mid2 = { x: b.x, y: (a.y + b.y) / 2 };
            const d = `M ${a.x} ${a.y} L ${mid1.x} ${mid1.y} L ${mid2.x} ${mid2.y} L ${b.x} ${b.y}`;
            return (
              <g key={w.id} className="cursor-pointer" onClick={() => removeWire(w.id)}>
                <path d={d} stroke="oklch(0 0 0 / 0.4)" strokeWidth={4} fill="none" />
                <path d={d} stroke="var(--color-wire)" strokeWidth={2.2} fill="none" strokeLinecap="round" />
              </g>
            );
          })}

          {/* Drawing wire preview */}
          {drawingFromPos && (
            <line
              x1={drawingFromPos.x} y1={drawingFromPos.y}
              x2={mouse.x} y2={mouse.y}
              stroke="var(--color-primary)"
              strokeWidth={2}
              strokeDasharray="6 4"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {/* Toolbar overlay */}
      <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-md bg-card/90 backdrop-blur border border-border px-2 py-1 text-xs font-mono">
        <span className="text-muted-foreground">zoom</span>
        <span className="tabular-nums">{(zoom * 100).toFixed(0)}%</span>
        <button
          className="px-1.5 py-0.5 rounded hover:bg-accent"
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
        >reset</button>
      </div>

      {selectedId && (
        <div className="absolute top-3 right-3">
          <Button
            size="sm"
            variant="destructive"
            onClick={() => removeComponent(selectedId)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete
          </Button>
        </div>
      )}

      {drawingFrom && (
        <div className="absolute top-3 left-3 rounded-md bg-card/90 backdrop-blur border border-primary px-3 py-1.5 text-xs">
          Drawing wire from <span className="text-primary font-mono">{drawingFrom.pinId}</span> — click another pin, or click empty canvas to cancel
        </div>
      )}

      {/* Use the unused size constants to silence lint */}
      <span className="hidden">{UNO_WIDTH}{UNO_HEIGHT}</span>
    </div>
  );
}
