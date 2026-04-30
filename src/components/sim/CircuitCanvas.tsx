import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "@/sim/store";
import { COMPONENT_DEFS } from "@/sim/components";
import { ArduinoUnoBoard } from "./ArduinoUnoBoard";
import { GenericBoard } from "./GenericBoard";
import { CircuitComponentNode } from "./CircuitComponentNode";
import { findUnoPin, UNO_HEIGHT, UNO_WIDTH } from "@/sim/uno-pins";
import { buildNetGraph, evaluateInputs, isLedPowered } from "@/sim/netlist";
import type { ComponentKind } from "@/sim/types";
import { useAdminStore } from "@/sim/adminStore";
import { CornerDownLeft, Trash2, X } from "lucide-react";
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
  const drawingWaypoints = useSimStore((s) => s.drawingWaypoints);
  const selectedId = useSimStore((s) => s.selectedId);
  const pinStates = useSimStore((s) => s.pinStates);
  const boardId = useSimStore((s) => s.boardId);

  const addComponent = useSimStore((s) => s.addComponent);
  const moveComponent = useSimStore((s) => s.moveComponent);
  const removeComponent = useSimStore((s) => s.removeComponent);
  const setSelected = useSimStore((s) => s.setSelected);
  const startWire = useSimStore((s) => s.startWire);
  const finishWire = useSimStore((s) => s.finishWire);
  const addWireWaypoint = useSimStore((s) => s.addWireWaypoint);
  const undoWireWaypoint = useSimStore((s) => s.undoWireWaypoint);
  const cancelWire = useSimStore((s) => s.cancelWire);
  const removeWire = useSimStore((s) => s.removeWire);
  const updateWireWaypoint = useSimStore((s) => s.updateWireWaypoint);
  const insertWireWaypoint = useSimStore((s) => s.insertWireWaypoint);

  const adminComps = useAdminStore((s) => s.components);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  /** Active wire-waypoint drag: which wire and which waypoint index. */
  const [wpDrag, setWpDrag] = useState<{ wireId: string; idx: number } | null>(null);
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

  // Esc / Backspace / Enter shortcuts while drawing a wire.
  useEffect(() => {
    if (!drawingFrom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelWire();
      } else if (e.key === "Backspace" && drawingWaypoints.length > 0) {
        e.preventDefault();
        undoWireWaypoint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawingFrom, drawingWaypoints.length, cancelWire, undoWireWaypoint]);

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
    // Board drop: switch active board on the canvas.
    const boardPayload = e.dataTransfer.getData("application/x-embedsim-board");
    if (boardPayload) {
      useSimStore.getState().setBoard(boardPayload as never);
      return;
    }
    const payload = e.dataTransfer.getData("application/x-embedsim-component");
    if (!payload) return;
    const { x, y } = clientToSvg(e);
    const snap = (n: number) => Math.round(n / 10) * 10;

    if (payload.startsWith("custom:")) {
      const customId = payload.slice("custom:".length);
      const entry = adminComps.find((c) => c.id === customId);
      if (!entry) return;
      const w = entry.width ?? 80;
      const h = entry.height ?? 60;
      addComponent("custom", snap(x - w / 2), snap(y - h / 2), customId);
      return;
    }

    const kind = payload as ComponentKind;
    const def = COMPONENT_DEFS[kind];
    if (!def?.available) return;
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
    if (wpDrag) {
      const snap = (n: number) => Math.round(n / 5) * 5;
      updateWireWaypoint(wpDrag.wireId, wpDrag.idx, { x: snap(p.x), y: snap(p.y) });
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

  // Endpoint coordinates for a wire endpoint reference.
  function endpointPos(componentId: string, pinId: string): { x: number; y: number } | null {
    if (componentId === "board") {
      const bp = findUnoPin(pinId);
      if (!bp) return null;
      return { x: BOARD_X + bp.x, y: BOARD_Y + bp.y };
    }
    const c = components.find((cc) => cc.id === componentId);
    if (!c) return null;
    if (c.kind === "custom") {
      const cid = String(c.props.customId ?? "");
      const entry = adminComps.find((a) => a.id === cid);
      const pin = entry?.pins?.find((p) => p.id === pinId);
      if (!pin) return null;
      return { x: c.x + pin.x, y: c.y + pin.y };
    }
    const def = COMPONENT_DEFS[c.kind];
    const pin = def.pins.find((p) => p.id === pinId);
    if (!pin) return null;
    return { x: c.x + pin.x, y: c.y + pin.y };
  }

  const drawingFromPos = drawingFrom ? endpointPos(drawingFrom.componentId, drawingFrom.pinId) : null;

  // Build a poly-line path for an existing wire, including its waypoints.
  function wirePath(a: { x: number; y: number }, b: { x: number; y: number }, mids: { x: number; y: number }[]) {
    const pts = [a, ...mids, b];
    return pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  }

  return (
    <div className="relative w-full h-full canvas-grid-bg overflow-hidden">
      <svg
        ref={svgRef}
        className="w-full h-full select-none"
        onDragOver={onSvgDragOver}
        onDrop={onSvgDrop}
        onMouseMove={onMouseMove}
        onMouseUp={() => { setDragId(null); setPanning(false); setWpDrag(null); }}
        onWheel={onWheel}
        onMouseDown={(e) => {
          // Only react to clicks on the empty SVG background.
          if (e.target !== e.currentTarget) return;

          // While drawing a wire: empty-canvas click drops a waypoint (multi-point routing).
          // Right-click finishes/cancels via cancelWire.
          if (drawingFrom) {
            if (e.button === 2) {
              cancelWire();
            } else if (e.button === 0 && !(e.altKey || e.metaKey)) {
              const p = clientToSvg(e);
              const snap = (n: number) => Math.round(n / 5) * 5;
              addWireWaypoint({ x: snap(p.x), y: snap(p.y) });
            } else if (e.button === 0 && (e.altKey || e.metaKey)) {
              setPanning(true);
            } else if (e.button === 1) {
              setPanning(true);
            }
            return;
          }

          // Not drawing: clear selection / start panning.
          setSelected(null);
          if (e.button === 0 && (e.altKey || e.metaKey)) setPanning(true);
          else if (e.button === 1) setPanning(true);
        }}
        onContextMenu={(e) => {
          // Disable context menu so right-click can finish/cancel wires.
          if (drawingFrom) e.preventDefault();
        }}
      >
        <g transform={`scale(${zoom}) translate(${pan.x} ${pan.y})`}>
          {/* Board — Uno gets the realistic art, other boards use a generic
              renderer driven by their pin counts. */}
          {boardId === "uno" ? (
            <ArduinoUnoBoard
              x={BOARD_X}
              y={BOARD_Y}
              highlightPin={drawingFrom?.componentId === "board" ? drawingFrom.pinId : undefined}
              onPinClick={(pinId) => {
                if (drawingFrom) finishWire("board", pinId);
                else startWire("board", pinId);
              }}
            />
          ) : (
            <GenericBoard
              boardId={boardId}
              x={BOARD_X}
              y={BOARD_Y}
              highlightPin={drawingFrom?.componentId === "board" ? drawingFrom.pinId : undefined}
              onPinClick={(pinId) => {
                if (drawingFrom) finishWire("board", pinId);
                else startWire("board", pinId);
              }}
            />
          )}

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

          {/* Wires: draggable waypoints, click segment to add a bend, right-click to delete. */}
          {wires.map((w) => {
            const a = endpointPos(w.from.componentId, w.from.pinId);
            const b = endpointPos(w.to.componentId, w.to.pinId);
            if (!a || !b) return null;
            const userMids = w.waypoints && w.waypoints.length ? w.waypoints : [];
            const mids = userMids.length
              ? userMids
              : [{ x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }];
            const d = wirePath(a, b, mids);
            const segPts = [a, ...userMids, b];
            return (
              <g key={w.id}>
                {/* Visible wire — right-click deletes. */}
                <path d={d} stroke="oklch(0 0 0 / 0.4)" strokeWidth={4} fill="none" pointerEvents="none" />
                <path
                  d={d}
                  stroke="var(--color-wire)"
                  strokeWidth={2.2}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
                {/* Per-segment hit zones: click inserts a new waypoint at that index. */}
                {segPts.slice(0, -1).map((pt, i) => {
                  const next = segPts[i + 1];
                  const sd = `M ${pt.x} ${pt.y} L ${next.x} ${next.y}`;
                  return (
                    <path
                      key={`seg-${i}`}
                      d={sd}
                      stroke="transparent"
                      strokeWidth={10}
                      fill="none"
                      className="cursor-copy"
                      onMouseDown={(e) => {
                        if (e.button === 2) { e.preventDefault(); removeWire(w.id); return; }
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        const p = clientToSvg(e);
                        const snap = (n: number) => Math.round(n / 5) * 5;
                        const newPoint = { x: snap(p.x), y: snap(p.y) };
                        insertWireWaypoint(w.id, i, newPoint);
                        setWpDrag({ wireId: w.id, idx: i });
                      }}
                      onContextMenu={(e) => { e.preventDefault(); removeWire(w.id); }}
                    />
                  );
                })}
                {/* Draggable waypoint handles. */}
                {userMids.map((pt, i) => (
                  <circle
                    key={`wp-${i}`}
                    cx={pt.x}
                    cy={pt.y}
                    r={4}
                    fill="var(--color-wire)"
                    stroke="var(--color-background)"
                    strokeWidth={1}
                    className="cursor-move hover:fill-[var(--color-primary)]"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      setWpDrag({ wireId: w.id, idx: i });
                    }}
                    onContextMenu={(e) => { e.preventDefault(); removeWire(w.id); }}
                  />
                ))}
              </g>
            );
          })}

          {/* In-progress wire preview: from start through committed waypoints to mouse. */}
          {drawingFromPos && (
            <g pointerEvents="none">
              <path
                d={wirePath(drawingFromPos, mouse, drawingWaypoints)}
                stroke="var(--color-primary)"
                strokeWidth={2}
                strokeDasharray="6 4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {drawingWaypoints.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={3.5}
                  fill="var(--color-primary)" stroke="var(--color-background)" strokeWidth={1} />
              ))}
            </g>
          )}
        </g>
      </svg>

      {/* Zoom toolbar overlay */}
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

      {/* Wire-drawing toolbar: shows source pin, point count, and shortcut buttons. */}
      {drawingFrom && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-md bg-card/95 backdrop-blur border border-primary px-3 py-1.5 text-xs shadow-lg">
          <span className="text-muted-foreground">Wiring from</span>
          <span className="text-primary font-mono">{drawingFrom.pinId}</span>
          <span className="text-muted-foreground">·</span>
          <span className="tabular-nums">
            {drawingWaypoints.length} {drawingWaypoints.length === 1 ? "point" : "points"}
          </span>
          <span className="text-muted-foreground hidden md:inline">— click pins to connect, click canvas to add a bend</span>
          <Button
            size="sm" variant="ghost"
            className="h-6 px-2"
            disabled={drawingWaypoints.length === 0}
            onClick={undoWireWaypoint}
            title="Undo last point (Backspace)"
          >
            <CornerDownLeft className="h-3 w-3 mr-1" /> Undo
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-6 px-2"
            onClick={cancelWire}
            title="Cancel (Esc)"
          >
            <X className="h-3 w-3 mr-1" /> Cancel
          </Button>
          <kbd className="hidden md:inline-flex text-[10px] px-1 py-0.5 rounded border border-border text-muted-foreground">Esc</kbd>
        </div>
      )}

      {/* Use the unused size constants to silence lint */}
      <span className="hidden">{UNO_WIDTH}{UNO_HEIGHT}</span>
    </div>
  );
}
