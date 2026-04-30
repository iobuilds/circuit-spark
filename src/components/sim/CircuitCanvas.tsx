import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "@/sim/store";
import { COMPONENT_DEFS } from "@/sim/components";
import { ArduinoUnoBoard } from "./ArduinoUnoBoard";
import { GenericBoard } from "./GenericBoard";
import { CircuitComponentNode } from "./CircuitComponentNode";
import { findUnoPin, UNO_HEIGHT, UNO_WIDTH } from "@/sim/uno-pins";
import { buildNetGraph, evaluateInputs, isLedPowered } from "@/sim/netlist";
import type { BoardId, ComponentKind } from "@/sim/types";
import { useAdminStore } from "@/sim/adminStore";
import { CornerDownLeft, Lock, Plus, Trash2, X, Undo2, Redo2, Wand2, Share2, Move, RotateCcw, Box } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddItemDialog } from "./AddItemDialog";
import { SensorControlsPanel } from "./SensorControlsPanel";
import { Uno3DViewer, type TablePiece3D } from "./Uno3DViewer";

interface Props {
  onPinInputChange: (pin: number, value: { digital?: 0 | 1; analog?: number }) => void;
}

/** Pin metadata surfaced by hover, used to render the floating pin-info tooltip. */
interface HoveredPin {
  id: string;
  label: string;
  kind: "digital" | "analog" | "power" | "ground" | "other";
  number?: number;
  /** Board component id this pin belongs to (used to look up connected net). */
  boardCompId: string;
  /** Screen-space position (canvas-local pixels) for tooltip placement. */
  sx: number;
  sy: number;
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
  
  const status = useSimStore((s) => s.status);
  const setBoard = useSimStore((s) => s.setBoard);

  /** Workspace is read-only while the simulator is running or paused. */
  const locked = status === "running" || status === "paused";

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
  const setWireStyle = useSimStore((s) => s.setWireStyle);
  const setWires = useSimStore((s) => s.setWires);
  const pushWireHistory = useSimStore((s) => s.pushWireHistory);
  const undoWires = useSimStore((s) => s.undoWires);
  const redoWires = useSimStore((s) => s.redoWires);
  const wireHistoryLen = useSimStore((s) => s.wireHistory.length);
  const wireFutureLen = useSimStore((s) => s.wireFuture.length);

  const adminComps = useAdminStore((s) => s.components);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [wpDrag, setWpDrag] = useState<{ wireId: string; idx: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [hovered, setHovered] = useState<HoveredPin | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [pinEditMode, setPinEditMode] = useState(false);
  const setComponentProp = useSimStore((s) => s.setComponentProp);
  const [show3D, setShow3D] = useState(false);

  const placedBoards = useMemo(() => components.filter((c) => c.kind === "board"), [components]);

  /**
   * Seed a default Uno board on first load so users see something to wire,
   * but make it a regular placed board (deletable like any other).
   */
  useEffect(() => {
    if (components.length === 0 && wires.length === 0) {
      addComponent("board", BOARD_X, BOARD_Y, "uno");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const net = useMemo(() => buildNetGraph(components, wires), [components, wires]);

  // Cancel any in-progress wire when the workspace becomes locked.
  useEffect(() => { if (locked && drawingFrom) cancelWire(); }, [locked, drawingFrom, cancelWire]);

  // Push input states (pot, button) to worker
  useEffect(() => {
    const inputs = evaluateInputs(components, net, pinStates);
    for (const [pin, val] of Object.entries(inputs)) {
      onPinInputChange(Number(pin), val);
    }
  }, [components, net, pinStates, onPinInputChange]);

  // Esc / Backspace shortcuts while drawing a wire.
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

  // Global Ctrl/Cmd+Z / Ctrl+Shift+Z (or Ctrl+Y) — wire-edit undo / redo.
  // Skipped while typing in inputs/textareas/contentEditable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undoWires();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redoWires();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoWires, redoWires]);

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
  function onSvgDragOver(e: React.DragEvent) { if (!locked) e.preventDefault(); }
  function onSvgDrop(e: React.DragEvent) {
    e.preventDefault();
    if (locked) return;
    // Board drop: place a board instance on the canvas at the drop point.
    const boardPayload = e.dataTransfer.getData("application/x-embedsim-board");
    if (boardPayload) {
      const { x, y } = clientToSvg(e);
      const snap = (n: number) => Math.round(n / 10) * 10;
      addComponent("board", snap(x - 180), snap(y - 120), boardPayload);
      // Make the dropped board the active simulation target.
      setBoard(boardPayload as BoardId);
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

  /** Add an item at the canvas center (used by the "+" popup). */
  function addAtCenter(payload: { kind: "component"; value: ComponentKind }
    | { kind: "custom"; customId: string; w: number; h: number }
    | { kind: "board"; boardId: BoardId }) {
    if (locked) return;
    const svg = svgRef.current;
    const r = svg?.getBoundingClientRect();
    const cx = r ? (r.width / 2) / zoom - pan.x : 400;
    const cy = r ? (r.height / 2) / zoom - pan.y : 250;
    const snap = (n: number) => Math.round(n / 10) * 10;
    if (payload.kind === "board") {
      addComponent("board", snap(cx - 180), snap(cy - 120), payload.boardId);
      setBoard(payload.boardId);
    } else if (payload.kind === "custom") {
      addComponent("custom", snap(cx - payload.w / 2), snap(cy - payload.h / 2), payload.customId);
    } else {
      const def = COMPONENT_DEFS[payload.value];
      addComponent(payload.value, snap(cx - def.width / 2), snap(cy - def.height / 2));
    }
  }

  // Wire/drag mouse handling
  function onMouseMove(e: React.MouseEvent) {
    const p = clientToSvg(e);
    setMouse(p);
    if (dragId && !locked) {
      const snap = (n: number) => Math.round(n / 10) * 10;
      moveComponent(dragId, snap(p.x - dragOffset.x), snap(p.y - dragOffset.y));
    }
    if (wpDrag && !locked) {
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
      if (locked) return;
      if (drawingFrom) finishWire(componentId, pinId);
      else startWire(componentId, pinId);
    };
  }

  function handleBoardPinClick(boardComponentId: string, pinId: string) {
    if (locked) return;
    if (drawingFrom) finishWire(boardComponentId, pinId);
    else startWire(boardComponentId, pinId);
  }

  // Endpoint coordinates for a wire endpoint reference.
  function endpointPos(componentId: string, pinId: string): { x: number; y: number } | null {
    // Legacy primary board (rendered at fixed BOARD_X/Y).
    if (componentId === "board") {
      const bp = findUnoPin(pinId);
      if (!bp) return null;
      return { x: BOARD_X + bp.x, y: BOARD_Y + bp.y };
    }
    const c = components.find((cc) => cc.id === componentId);
    if (!c) return null;
    if (c.kind === "board") {
      const bp = findUnoPin(pinId);
      if (!bp) return null;
      return { x: c.x + bp.x, y: c.y + bp.y };
    }
    if (c.kind === "custom") {
      const cid = String(c.props.customId ?? "");
      const entry = adminComps.find((a) => a.id === cid);
      const pin = entry?.pins?.find((p) => p.id === pinId);
      if (!pin) return null;
      // Honor per-instance pin overrides set via the "Move pins" tool.
      let px = pin.x, py = pin.y;
      const rawOv = c.props.pinOverrides;
      if (typeof rawOv === "string" && rawOv) {
        try {
          const ov = JSON.parse(rawOv);
          if (ov && typeof ov === "object" && ov[pinId]) {
            px = Number(ov[pinId].x ?? pin.x);
            py = Number(ov[pinId].y ?? pin.y);
          }
        } catch { /* ignore malformed overrides */ }
      }
      return { x: c.x + px, y: c.y + py };
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

  /**
   * Auto-route a manhattan (orthogonal) path between two pins. Pins on top/bottom
   * board headers leave vertically first; side pins leave horizontally. A small
   * per-wire offset (derived from a hash of the wire id) prevents parallel wires
   * from overlapping perfectly — each wire gets its own "lane".
   */
  function autoRoute(
    a: { x: number; y: number },
    b: { x: number; y: number },
    seed: string,
  ): { x: number; y: number }[] {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
    const lane = ((Math.abs(h) % 7) - 3) * 8; // -24..24 in 8px steps
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    // Leave the pin a short stub so we don't overlap the pad.
    const stub = 18;
    const ax = a.x;
    const ay = a.y + (a.y < b.y ? stub : -stub);
    const bx = b.x;
    const by = b.y + (b.y < a.y ? stub : -stub);
    // Mid Y between the two stubs, offset by lane.
    const midY = (ay + by) / 2 + lane;
    // If they're nearly horizontal, route as a single jog via midX instead.
    if (Math.abs(dy) < 24 && Math.abs(dx) > 40) {
      const midX = (ax + bx) / 2 + lane;
      return [
        { x: ax, y: ay },
        { x: midX, y: ay },
        { x: midX, y: by },
        { x: bx, y: by },
      ];
    }
    return [
      { x: ax, y: ay },
      { x: ax, y: midY },
      { x: bx, y: midY },
      { x: bx, y: by },
    ];
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
          setSelectedWireId(null);
          if (e.button === 0 && (e.altKey || e.metaKey)) setPanning(true);
          else if (e.button === 1) setPanning(true);
        }}
        onContextMenu={(e) => {
          // Disable context menu so right-click can finish/cancel wires.
          if (drawingFrom) e.preventDefault();
        }}
      >
        <g transform={`scale(${zoom}) translate(${pan.x} ${pan.y})`}>
          {/* Placed boards (multi-board). The default Uno is auto-seeded on first load. */}
          {placedBoards.map((b) => {
            const bid = (b.props.boardId as BoardId) ?? "uno";
            const isSel = selectedId === b.id;
            const hoverHandler = (pin: { id: string; label: string; kind: HoveredPin["kind"]; number?: number; x: number; y: number } | null) => {
              if (!pin) { setHovered(null); return; }
              // Convert pin board-local coords to canvas-local pixels.
              const sx = (b.x + pin.x + pan.x) * zoom;
              const sy = (b.y + pin.y + pan.y) * zoom;
              setHovered({ id: pin.id, label: pin.label, kind: pin.kind, number: pin.number, sx, sy, boardCompId: b.id });
            };
            return (
              <g
                key={b.id}
                onMouseDown={(e) => {
                  if (locked) return;
                  if (e.button !== 0) return;
                  e.stopPropagation();
                  setSelected(b.id);
                  const p = clientToSvg(e);
                  setDragId(b.id);
                  setDragOffset({ x: p.x - b.x, y: p.y - b.y });
                  // Make this board the active simulation target.
                  setBoard(bid);
                }}
                style={{ cursor: locked ? "default" : "grab" }}
              >
                {bid === "uno" ? (
                  <ArduinoUnoBoard
                    x={b.x}
                    y={b.y}
                    highlightPin={drawingFrom?.componentId === b.id ? drawingFrom.pinId : undefined}
                    onPinClick={(pinId) => handleBoardPinClick(b.id, pinId)}
                    onPinHover={hoverHandler}
                  />
                ) : (
                  <GenericBoard
                    boardId={bid}
                    x={b.x}
                    y={b.y}
                    highlightPin={drawingFrom?.componentId === b.id ? drawingFrom.pinId : undefined}
                    onPinClick={(pinId) => handleBoardPinClick(b.id, pinId)}
                    onPinHover={hoverHandler}
                  />
                )}
                {isSel && (
                  <rect
                    x={b.x - 2} y={b.y - 2} width={364} height={244}
                    fill="none" stroke="var(--color-primary)" strokeWidth={2}
                    strokeDasharray="6 4" pointerEvents="none"
                  />
                )}
              </g>
            );
          })}

          {/* Components (skip placed boards — rendered above) */}
          {components.filter((c) => c.kind !== "board").map((c) => (
            <CircuitComponentNode
              key={c.id}
              comp={c}
              isPowered={isLedPowered(c, net, pinStates)}
              selected={selectedId === c.id}
              onSelect={() => setSelected(c.id)}
              onDragStart={(e) => {
                if (locked) return;
                const p = clientToSvg(e);
                setDragId(c.id);
                setDragOffset({ x: p.x - c.x, y: p.y - c.y });
              }}
              onPinClick={onPinClickFactory(c.id)}
              pinEditMode={pinEditMode && !locked && selectedId === c.id && c.kind === "custom"}
              toCanvasPoint={clientToSvg}
            />
          ))}

          {/* Wires: draggable waypoints, click segment to add a bend, right-click to delete. */}
          {wires.map((w) => {
            const a = endpointPos(w.from.componentId, w.from.pinId);
            const b = endpointPos(w.to.componentId, w.to.pinId);
            if (!a || !b) return null;
            const userMids = w.waypoints && w.waypoints.length ? w.waypoints : [];
            // Auto-route when the user hasn't customised the path.
            const mids = userMids.length ? userMids : autoRoute(a, b, w.id);
            const d = wirePath(a, b, mids);
            const segPts = [a, ...userMids, b];
            const isWireSel = selectedWireId === w.id;
            const stroke = w.color || "var(--color-wire)";
            const sw = w.thickness ?? 2.2;
            return (
              <g key={w.id}>
                {/* Shadow */}
                <path d={d} stroke="oklch(0 0 0 / 0.4)" strokeWidth={sw + 1.8} fill="none" pointerEvents="none" />
                {/* Visible wire */}
                <path
                  d={d}
                  stroke={stroke}
                  strokeWidth={sw}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
                {/* Selection halo */}
                {isWireSel && (
                  <path
                    d={d}
                    stroke="var(--color-primary)"
                    strokeWidth={sw + 4}
                    strokeOpacity={0.25}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    pointerEvents="none"
                  />
                )}
                {/* Per-segment hit zones: left-click selects the wire; shift-click inserts waypoint; right-click deletes. */}
                {segPts.slice(0, -1).map((pt, i) => {
                  const next = segPts[i + 1];
                  const sd = `M ${pt.x} ${pt.y} L ${next.x} ${next.y}`;
                  return (
                    <path
                      key={`seg-${i}`}
                      d={sd}
                      stroke="transparent"
                      strokeWidth={12}
                      fill="none"
                      className="cursor-pointer"
                      onMouseDown={(e) => {
                        if (e.button === 2) { e.preventDefault(); removeWire(w.id); return; }
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        // Shift/Alt-click on a segment inserts a waypoint and starts dragging it.
                        if (e.shiftKey || e.altKey) {
                          const p = clientToSvg(e);
                          const snap = (n: number) => Math.round(n / 5) * 5;
                          const newPoint = { x: snap(p.x), y: snap(p.y) };
                          insertWireWaypoint(w.id, i, newPoint);
                          setWpDrag({ wireId: w.id, idx: i });
                          return;
                        }
                        // Plain click selects the wire (so the style toolbar shows up).
                        setSelectedWireId(w.id);
                        setSelected(null);
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
                    fill={stroke}
                    stroke="var(--color-background)"
                    strokeWidth={1}
                    className="cursor-move hover:fill-[var(--color-primary)]"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      setSelectedWireId(w.id);
                      // Snapshot once before a drag — the whole drag becomes one undo step.
                      pushWireHistory();
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

      {selectedId && !locked && (() => {
        const sel = components.find((c) => c.id === selectedId);
        const isCustom = sel?.kind === "custom";
        const isLed = sel?.kind === "led";
        const ledColors = ["red", "green", "blue", "yellow", "white", "orange", "purple"] as const;
        const ledColorSwatch: Record<string, string> = {
          red: "oklch(0.7 0.25 25)", green: "oklch(0.78 0.22 145)", blue: "oklch(0.7 0.22 245)",
          yellow: "oklch(0.85 0.18 90)", white: "oklch(0.96 0.02 90)",
          orange: "oklch(0.78 0.20 55)", purple: "oklch(0.7 0.22 305)",
        };
        return (
          <div className="absolute top-3 right-3 flex items-center gap-2 flex-wrap justify-end max-w-[calc(100%-1.5rem)]">
            {isLed && sel && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card/95 backdrop-blur px-2 py-1 text-xs shadow">
                <span className="text-muted-foreground">Color</span>
                <div className="flex items-center gap-1">
                  {ledColors.map((col) => (
                    <button
                      key={col}
                      onClick={() => setComponentProp(selectedId, "color", col)}
                      className={[
                        "w-5 h-5 rounded-full border transition",
                        String(sel.props.color || "red") === col ? "ring-2 ring-primary border-primary" : "border-border",
                      ].join(" ")}
                      style={{ background: ledColorSwatch[col] }}
                      title={col}
                    />
                  ))}
                </div>
                <span className="text-muted-foreground ml-2">Size</span>
                <input
                  type="range"
                  min={0.6}
                  max={2}
                  step={0.1}
                  value={Number(sel.props.size ?? 1)}
                  onChange={(e) => setComponentProp(selectedId, "size", Number(e.target.value))}
                  className="w-20 accent-primary"
                  title="LED size"
                />
                <span className="text-muted-foreground ml-2">Mode</span>
                <select
                  value={String(sel.props.mode ?? "auto")}
                  onChange={(e) => setComponentProp(selectedId, "mode", e.target.value)}
                  className="bg-input border border-border rounded px-1.5 py-0.5 text-xs"
                  title="auto = power or GPIO; power = only rails (3V3/5V/VIN); gpio = only GPIO HIGH"
                >
                  <option value="auto">Auto</option>
                  <option value="power">Power indicator</option>
                  <option value="gpio">GPIO-driven</option>
                </select>
              </div>
            )}
            {isCustom && (
              <>
                <Button
                  size="sm"
                  variant={pinEditMode ? "default" : "secondary"}
                  onClick={() => setPinEditMode((v) => !v)}
                  title="Drag pins to reposition them on this component"
                >
                  <Move className="h-3.5 w-3.5 mr-1" />
                  {pinEditMode ? "Done" : "Move pins"}
                </Button>
                {pinEditMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setComponentProp(selectedId, "pinOverrides", "")}
                    title="Reset pin positions to library defaults"
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reset
                  </Button>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="destructive"
              onClick={() => removeComponent(selectedId)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Delete
            </Button>
          </div>
        );
      })()}

      {/* Floating "+" Add button — opens the search popup. */}
      {!locked && (
        <div className="absolute bottom-3 left-3">
          <Button
            size="lg"
            onClick={() => setAddOpen(true)}
            className="h-12 w-12 rounded-full p-0 shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
            title="Add component or board"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </div>
      )}

      {/* Locked banner during simulation. */}
      {locked && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-md bg-warning/15 border border-warning/40 backdrop-blur px-3 py-1.5 text-xs">
          <Lock className="h-3.5 w-3.5 text-warning" />
          <span>Workspace locked while simulation is {status}. Stop the sim to edit.</span>
        </div>
      )}

      {/* Sliders/toggles for AI-generated sensor inputs (axes, light, distance…). */}
      <SensorControlsPanel />

      {/* Floating pin info popup on hover (id, kind/role, connected net, live value if simulating). */}
      {hovered && (() => {
        const pinNum = hovered.number;
        const live = pinNum !== undefined ? pinStates[pinNum] : undefined;
        const kindLabel =
          hovered.kind === "power" ? `Power (${hovered.label})`
          : hovered.kind === "ground" ? "Ground (GND)"
          : hovered.kind === "digital" ? `Digital D${pinNum ?? ""}`
          : hovered.kind === "analog" ? `Analog A${pinNum !== undefined ? pinNum - 14 : ""}`
          : "Pin";
        // Resolve the connected net label (which board pin / rail this pin shares a net with),
        // and find any non-board components attached to that same net.
        const netLabel = net.netForCompPin.get(`${hovered.boardCompId}::${hovered.id}`) ?? null;
        const connectedComps: string[] = [];
        if (netLabel) {
          for (const c of components) {
            if (c.kind === "board") continue;
            const def = COMPONENT_DEFS[c.kind];
            if (!def) continue;
            for (const p of def.pins) {
              if (net.netForCompPin.get(`${c.id}::${p.id}`) === netLabel) {
                connectedComps.push(`${def.label} ${p.label}`);
                break;
              }
            }
          }
        }
        return (
          <div
            className="pointer-events-none absolute z-20 rounded-md border border-border bg-card/95 backdrop-blur px-2.5 py-1.5 text-[11px] shadow-lg font-mono min-w-[140px]"
            style={{
              left: Math.max(8, hovered.sx + 14),
              top: Math.max(8, hovered.sy - 50),
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-primary font-bold">{hovered.label}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">{kindLabel}</span>
            </div>
            {netLabel && (
              <div className="text-muted-foreground mt-0.5">
                net: <span className="text-foreground">{netLabel}</span>
              </div>
            )}
            {connectedComps.length > 0 && (
              <div className="text-muted-foreground mt-0.5 truncate max-w-[220px]">
                → {connectedComps.slice(0, 3).join(", ")}{connectedComps.length > 3 ? "…" : ""}
              </div>
            )}
            {live && (
              <div className="text-muted-foreground mt-0.5">
                {live.mode && <>mode: <span className="text-foreground">{live.mode}</span> · </>}
                <span className={live.digital ? "text-success" : "text-foreground"}>
                  {live.digital ? "HIGH" : "LOW"}
                </span>
                {live.analog > 0 && live.analog !== 1 && <span className="text-warning ml-1">· {live.analog}</span>}
              </div>
            )}
          </div>
        );
      })()}

      {/* Wire style toolbar — appears when a wire is selected. */}
      {selectedWireId && !locked && (() => {
        const w = wires.find((ww) => ww.id === selectedWireId);
        if (!w) return null;
        const swatches = [
          { name: "red",    val: "oklch(0.65 0.22 25)" },
          { name: "green",  val: "oklch(0.72 0.18 145)" },
          { name: "blue",   val: "oklch(0.65 0.18 250)" },
          { name: "yellow", val: "oklch(0.85 0.18 90)" },
          { name: "black",  val: "oklch(0.18 0 0)" },
          { name: "white",  val: "oklch(0.95 0 0)" },
          { name: "default",val: "" },
        ];
        const cur = w.color || "";
        const thick = w.thickness ?? 2.2;

        // All wire ids that belong to the same electrical net as the selected wire.
        const wiresOnSameNet = (): string[] => {
          const sel = net.netForCompPin.get(`${w.from.componentId}::${w.from.pinId}`)
                   ?? net.netForCompPin.get(`${w.to.componentId}::${w.to.pinId}`)
                   ?? null;
          if (!sel) return [w.id];
          return wires
            .filter((ww) => {
              const a = net.netForCompPin.get(`${ww.from.componentId}::${ww.from.pinId}`);
              const b = net.netForCompPin.get(`${ww.to.componentId}::${ww.to.pinId}`);
              return a === sel || b === sel;
            })
            .map((ww) => ww.id);
        };

        const applyToNet = () => {
          const ids = new Set(wiresOnSameNet());
          setWires(wires.map((ww) =>
            ids.has(ww.id) ? { ...ww, color: w.color, thickness: w.thickness } : ww
          ));
        };

        const autoArrangeSelected = () => {
          // Clear waypoints so the renderer's autoRoute() takes over with a clean Manhattan path.
          setWires(wires.map((ww) =>
            ww.id === w.id ? { ...ww, waypoints: undefined } : ww
          ));
        };

        return (
          <div className="absolute top-3 right-3 flex items-center gap-2 rounded-md bg-card/95 backdrop-blur border border-border px-3 py-1.5 text-xs shadow-lg max-w-[calc(100vw-1.5rem)] flex-wrap">
            <span className="text-muted-foreground">Wire</span>
            <div className="flex items-center gap-1">
              {swatches.map((s) => (
                <button
                  key={s.name}
                  title={s.name}
                  onClick={() => setWireStyle(w.id, { color: s.val || undefined })}
                  className={`h-5 w-5 rounded-full border ${cur === s.val ? "ring-2 ring-primary" : "border-border"}`}
                  style={{
                    background: s.val || "var(--color-wire)",
                    backgroundImage: !s.val
                      ? "repeating-linear-gradient(45deg, transparent 0 3px, rgba(255,255,255,.15) 3px 6px)"
                      : undefined,
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">thickness</span>
              <input
                type="range"
                min={1}
                max={6}
                step={0.5}
                value={thick}
                onMouseDown={() => pushWireHistory()}
                onChange={(e) => setWireStyle(w.id, { thickness: Number(e.target.value) })}
                className="w-20"
              />
              <span className="tabular-nums w-7 text-right">{thick.toFixed(1)}</span>
            </div>

            <div className="h-5 w-px bg-border mx-0.5" />

            <Button size="sm" variant="ghost" className="h-6 px-2 gap-1"
              onClick={applyToNet}
              title="Apply this color & thickness to every wire on the same electrical net">
              <Share2 className="h-3 w-3" /> Apply to net
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 gap-1"
              onClick={autoArrangeSelected}
              title="Clear custom bends and auto-arrange the wire">
              <Wand2 className="h-3 w-3" /> Auto-arrange
            </Button>

            <div className="h-5 w-px bg-border mx-0.5" />

            <Button size="sm" variant="ghost" className="h-6 px-2"
              onClick={undoWires} disabled={wireHistoryLen === 0}
              title="Undo wire edit (Ctrl+Z)">
              <Undo2 className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2"
              onClick={redoWires} disabled={wireFutureLen === 0}
              title="Redo wire edit (Ctrl+Shift+Z)">
              <Redo2 className="h-3 w-3" />
            </Button>

            <Button size="sm" variant="ghost" className="h-6 px-2"
              onClick={() => { removeWire(w.id); setSelectedWireId(null); }}
              title="Delete wire">
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 px-2"
              onClick={() => setSelectedWireId(null)} title="Close">
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      })()}

      {/* Floating undo/redo when no wire is selected (still useful after a delete). */}
      {!selectedWireId && !locked && (wireHistoryLen > 0 || wireFutureLen > 0) && (
        <div className="absolute top-3 right-32 flex items-center gap-1 rounded-md bg-card/90 backdrop-blur border border-border px-1.5 py-1 text-xs shadow">
          <Button size="sm" variant="ghost" className="h-6 px-2"
            onClick={undoWires} disabled={wireHistoryLen === 0}
            title="Undo wire edit (Ctrl+Z)">
            <Undo2 className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2"
            onClick={redoWires} disabled={wireFutureLen === 0}
            title="Redo wire edit (Ctrl+Shift+Z)">
            <Redo2 className="h-3 w-3" />
          </Button>
        </div>
      )}

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onPickComponent={(kind) => addAtCenter({ kind: "component", value: kind })}
        onPickCustom={(entry) => addAtCenter({
          kind: "custom",
          customId: entry.id,
          w: entry.width ?? 80,
          h: entry.height ?? 60,
        })}
        onPickBoard={(bid) => addAtCenter({ kind: "board", boardId: bid })}
      />

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

      {/* 3D-table toggle button */}
      <div className="absolute top-3 right-3 z-10">
        <Button
          size="sm"
          variant={show3D ? "default" : "outline"}
          onClick={() => setShow3D((v) => !v)}
          className="h-8 text-xs gap-1.5 shadow-sm"
          title="Toggle 3D table view"
        >
          <Box className="h-3.5 w-3.5" />
          {show3D ? "Hide 3D" : "3D table"}
        </Button>
      </div>

      {/* 3D table preview panel — shows the real Uno model + components as
          blocks at their 2D positions. View-only for now. */}
      {show3D && (
        <div className="absolute bottom-3 right-3 w-[460px] h-[320px] rounded-md border border-border bg-card shadow-2xl overflow-hidden z-10">
          <div className="px-2 py-1 border-b border-border flex items-center text-xs">
            <span className="font-medium">3D table</span>
            <span className="ml-2 text-muted-foreground text-[10px]">drag to orbit · scroll to zoom</span>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setShow3D(false)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="w-full" style={{ height: "calc(100% - 28px)" }}>
            <Uno3DViewer
              topViewWidth={UNO_WIDTH}
              topViewHeight={UNO_HEIGHT}
              tablePieces={components
                .filter((c) => c.kind !== "board")
                .map<TablePiece3D>((c) => {
                  // Component canvas position is absolute; translate to be
                  // relative to the primary board (first placed Uno).
                  const board = placedBoards[0];
                  const bx = board?.x ?? BOARD_X;
                  const by = board?.y ?? BOARD_Y;
                  const def = c.kind === "custom"
                    ? null
                    : COMPONENT_DEFS[c.kind as ComponentKind];
                  const w = def?.width ?? 30;
                  const h = def?.height ?? 20;
                  return {
                    id: c.id,
                    x: c.x - bx + w / 2,
                    y: c.y - by + h / 2,
                    w,
                    h,
                    color: c.kind === "led" ? "#ef4444"
                      : c.kind === "button" ? "#94a3b8"
                      : c.kind === "potentiometer" ? "#06b6d4"
                      : "#3b82f6",
                    height: 5,
                  };
                })}
            />
          </div>
        </div>
      )}

      {/* Use the unused size constants to silence lint */}
      <span className="hidden">{UNO_WIDTH}{UNO_HEIGHT}</span>
    </div>
  );
}
