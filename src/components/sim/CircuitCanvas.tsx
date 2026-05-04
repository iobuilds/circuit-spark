import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "@/sim/store";
import { COMPONENT_DEFS } from "@/sim/components";
import { ArduinoUnoBoard } from "./ArduinoUnoBoard";
import { GenericBoard } from "./GenericBoard";
import { CircuitComponentNode } from "./CircuitComponentNode";
import { findUnoPin, UNO_HEIGHT, UNO_WIDTH } from "@/sim/uno-pins";
import { buildNetGraph, evaluateInputs, isLedPowered, isLedBurning, computeLoadVoltage } from "@/sim/netlist";
import { toast } from "sonner";
import type { BoardId, ComponentKind } from "@/sim/types";
import { useAdminStore } from "@/sim/adminStore";
import { useIdeStore } from "@/sim/ideStore";
import { CornerDownLeft, Lock, Plus, Trash2, X, Undo2, Redo2, Wand2, Share2, Move, RotateCcw, Hand, MousePointer2, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddItemDialog } from "./AddItemDialog";
import { SensorControlsPanel } from "./SensorControlsPanel";
import { ChipInspectorDialog } from "./ChipInspectorDialog";


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
  const adminBoards = useAdminStore((s) => s.boards);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [dragId, setDragId] = useState<string | null>(null);
  const [wpDrag, setWpDrag] = useState<{ wireId: string; idx: number } | null>(null);
  /** Pending wire-segment drag: on plain click+drag the first move inserts a waypoint
   *  and starts dragging it. On a click without movement, the wire is just selected. */
  const [segPending, setSegPending] = useState<{ wireId: string; idx: number; sx: number; sy: number } | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panning, setPanning] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [chipInspectorBoardId, setChipInspectorBoardId] = useState<string | null>(null);
  const [hovered, setHovered] = useState<HoveredPin | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [pinEditMode, setPinEditMode] = useState(false);
  const setComponentProp = useSimStore((s) => s.setComponentProp);
  
  /** Active workspace tool. "select" = default; "pan" = drag-to-pan; "wire" = click pins to wire. */
  const [tool, setTool] = useState<"select" | "pan" | "wire">("select");
  const [pending, setPending] = useState<
    | { kind: "component"; value: ComponentKind; w: number; h: number }
    | { kind: "custom"; customId: string; w: number; h: number }
    | { kind: "board"; boardId: BoardId; w: number; h: number }
    | null
  >(null);

  const placedBoards = useMemo(() => components.filter((c) => c.kind === "board"), [components]);

  /** Wires reference component IDs that don't exist on the workspace —
   *  usually a "board" id from a legacy template loaded without a board.
   *  Surface as a banner with a one-click fix. */
  const missingBoardIds = useMemo(() => {
    const ids = new Set(components.map((c) => c.id));
    const missing = new Set<string>();
    for (const w of wires) {
      if (!ids.has(w.from.componentId)) missing.add(w.from.componentId);
      if (!ids.has(w.to.componentId)) missing.add(w.to.componentId);
    }
    return Array.from(missing);
  }, [components, wires]);

  const fallbackBoardId = useSimStore((s) => s.boardId);
  function autoInsertMissingBoards() {
    if (missingBoardIds.length === 0) return;
    useSimStore.setState((st) => {
      const next = [...st.components];
      missingBoardIds.forEach((mid, i) => {
        next.push({
          id: mid,
          kind: "board" as const,
          x: BOARD_X + i * 60,
          y: BOARD_Y + i * 60,
          rotation: 0 as const,
          props: { boardId: fallbackBoardId },
        });
      });
      return { components: next };
    });
    toast.success(
      `Inserted ${missingBoardIds.length} board${missingBoardIds.length === 1 ? "" : "s"}.`,
    );
  }

  /** Per-board sketch tabs: each board owns a .ino file in the IDE. Adding a
   *  board creates the file, removing the board deletes it. */
  const ideFiles = useIdeStore((s) => s.files);
  const ideAddFile = useIdeStore((s) => s.addFile);
  const ideSetActive = useIdeStore((s) => s.setActiveFile);
  const ideDeleteFile = useIdeStore((s) => s.deleteFile);
  const ideHydrate = useIdeStore((s) => s.hydrate);
  const ideLoaded = useIdeStore((s) => s.loaded);
  useEffect(() => { if (!ideLoaded) ideHydrate(); }, [ideLoaded, ideHydrate]);

  useEffect(() => {
    if (!ideLoaded) return;
    // Create a sketch file for any board that doesn't have one yet.
    placedBoards.forEach((b, idx) => {
      const existing = String(b.props.sketchFileId ?? "");
      const hasFile = existing && ideFiles.some((f) => f.id === existing);
      if (!hasFile) {
        const boardId = String(b.props.boardId ?? "uno");
        const name = `sketch_${boardId}_${idx + 1}.ino`;
        const seed = `// ${name} — sketch for ${boardId} board\nvoid setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}\n`;
        const fid = ideAddFile(name, "ino", seed);
        useSimStore.getState().setComponentProp(b.id, "sketchFileId", fid);
      }
    });
    // Remove orphan sketch files (file's owning board no longer exists).
    const ownedIds = new Set(
      placedBoards.map((b) => String(b.props.sketchFileId ?? "")).filter(Boolean),
    );
    const orphanInoFiles = ideFiles.filter((f) =>
      f.kind === "ino" && (placedBoards.length === 0 || f.name.startsWith("sketch_")) && !ownedIds.has(f.id),
    );
    if (orphanInoFiles.length > 0) {
      orphanInoFiles.forEach((f) => ideDeleteFile(f.id));
    }
  }, [placedBoards, ideLoaded, ideFiles, ideAddFile, ideDeleteFile]);

  useEffect(() => {
    if (!selectedId || locked) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (!components.some((c) => c.id === selectedId)) return;
      e.preventDefault();
      removeWorkspaceComponent(selectedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, locked, components]);

  // When user selects a board, switch the IDE to that board's sketch.
  useEffect(() => {
    if (!selectedId) return;
    const b = placedBoards.find((bb) => bb.id === selectedId);
    if (!b) return;
    const fid = String(b.props.sketchFileId ?? "");
    if (fid && ideFiles.some((f) => f.id === fid)) ideSetActive(fid);
  }, [selectedId, placedBoards, ideFiles, ideSetActive]);


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

  // ESC cancels any pending placement.
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPending(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending]);

  // Get all per-board pin states for cross-board propagation. We subscribe via
  // a selector so the effect re-runs when any board's pins change.
  const pinStatesByBoard = useSimStore((s) => s.pinStatesByBoard);

  // Push input states (pot/button/sensors + cross-board GPIO) to each board's worker.
  useEffect(() => {
    // Sensor / passive inputs (uses focused-board pinStates as a fallback view).
    const inputs = evaluateInputs(components, net, pinStates);
    for (const [pin, val] of Object.entries(inputs)) {
      onPinInputChange(Number(pin), val);
    }

    // Cross-board GPIO: if board A drives an OUTPUT pin and that wire reaches
    // board B, mirror the digital/analog value onto board B's pin so its
    // digitalRead/analogRead reflect the master's drive level.
    if (!net.netToBoardPins) return;
    const propagate = (window as unknown as {
      __embedsimPropagateBoardGPIO?: (target: { boardCompId: string; pin: number; digital?: 0 | 1; analog?: number }) => void;
    }).__embedsimPropagateBoardGPIO;
    if (!propagate) return;
    for (const endpoints of net.netToBoardPins.values()) {
      if (endpoints.length < 2) continue;
      // Find any driver: a board whose pinStatesByBoard has this pin in OUTPUT mode.
      let driver: { digital: 0 | 1; analog: number } | null = null;
      for (const ep of endpoints) {
        const ps = pinStatesByBoard[ep.boardCompId]?.[ep.pin];
        if (ps && ps.mode === "OUTPUT") { driver = { digital: ps.digital, analog: ps.analog }; break; }
      }
      if (!driver) continue;
      // Mirror onto every other endpoint that is NOT the driver.
      for (const ep of endpoints) {
        const ps = pinStatesByBoard[ep.boardCompId]?.[ep.pin];
        if (ps?.mode === "OUTPUT") continue; // skip the driver itself
        propagate({ boardCompId: ep.boardCompId, pin: ep.pin, digital: driver.digital, analog: driver.analog });
      }
    }
  }, [components, net, pinStates, pinStatesByBoard, onPinInputChange]);

  // LED burn detection: only while sim is running. If an LED is wired straight
  // from 5V/VIN to GND with no series resistor, mark it burned (sticky — has to
  // be replaced or rewired + un-burned manually).
  useEffect(() => {
    if (status !== "running") return;
    for (const c of components) {
      if (c.kind === "led" && !c.props?.burned) {
        if (isLedBurning(c, components, net)) {
          setComponentProp(c.id, "burned", true);
          toast.error(`💥 ${String(c.props.color || "red").toUpperCase()} LED burned out — no current-limiting resistor between 5V and GND.`);
        }
      }
      if (c.kind === "motor" && !c.props?.burned) {
        const { volts } = computeLoadVoltage(c, net, "+", "-");
        if (volts > 12) {
          setComponentProp(c.id, "burned", true);
          toast.error(`🔥 DC motor burned out — ${volts.toFixed(1)}V exceeds the 12V limit.`);
        }
      }
    }
  }, [status, components, net, setComponentProp]);

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

  /** Pending placement: after picking from the "+" dialog, the item follows
   * the cursor as a ghost until the user clicks an empty spot to place. */
  type Pending =
    | { kind: "component"; value: ComponentKind; w: number; h: number }
    | { kind: "custom"; customId: string; w: number; h: number }
    | { kind: "board"; boardId: BoardId; w: number; h: number };

  function startPlacement(payload: { kind: "component"; value: ComponentKind }
    | { kind: "custom"; customId: string; w: number; h: number }
    | { kind: "board"; boardId: BoardId }) {
    if (locked) return;
    if (payload.kind === "board") {
      setPending({ kind: "board", boardId: payload.boardId, w: 360, h: 240 });
    } else if (payload.kind === "custom") {
      setPending({ kind: "custom", customId: payload.customId, w: payload.w, h: payload.h });
    } else {
      const def = COMPONENT_DEFS[payload.value];
      setPending({ kind: "component", value: payload.value, w: def.width, h: def.height });
    }
  }

  function commitPlacement(p: { x: number; y: number }) {
    if (!pending) return;
    const snap = (n: number) => Math.round(n / 10) * 10;
    if (pending.kind === "board") {
      addComponent("board", snap(p.x - pending.w / 2), snap(p.y - pending.h / 2), pending.boardId);
      setBoard(pending.boardId);
    } else if (pending.kind === "custom") {
      addComponent("custom", snap(p.x - pending.w / 2), snap(p.y - pending.h / 2), pending.customId);
    } else {
      addComponent(pending.value, snap(p.x - pending.w / 2), snap(p.y - pending.h / 2));
    }
    setPending(null);
  }

  // Wire/drag mouse handling
  function onMouseMove(e: React.MouseEvent) {
    const p = clientToSvg(e);
    setMouse(p);
    if (dragId && !locked) {
      const snap = (n: number) => Math.round(n / 10) * 10;
      moveComponent(dragId, snap(p.x - dragOffset.x), snap(p.y - dragOffset.y));
    }
    if (segPending && !locked && !wpDrag) {
      const dx = p.x - segPending.sx;
      const dy = p.y - segPending.sy;
      if (dx * dx + dy * dy > 9) {
        const snap = (n: number) => Math.round(n / 5) * 5;
        const newPoint = { x: snap(p.x), y: snap(p.y) };
        insertWireWaypoint(segPending.wireId, segPending.idx, newPoint);
        setWpDrag({ wireId: segPending.wireId, idx: segPending.idx });
        setSegPending(null);
      }
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
    const delta = -e.deltaY * 0.0015;
    // Lower bound effectively unlimited (0.05 = 5%). Upper bound stays at 4×.
    setZoom((z) => Math.max(0.05, Math.min(4, z * (1 + delta))));
  }

  /** Zoom-to-fit: center & scale all placed components into the viewport. */
  function fitToScreen() {
    if (!svgRef.current || components.length === 0) {
      setZoom(1); setPan({ x: 0, y: 0 }); return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of components) {
      // Use the real Uno board dimensions (matches the embedded illustration
      // and the calibrated pin coordinates in unoPins.ts) so fit-to-screen
      // doesn't crop pins or shift them outside the viewport.
      const w = c.kind === "board" ? UNO_WIDTH : 100;
      const h = c.kind === "board" ? UNO_HEIGHT : 90;
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x + w);
      maxY = Math.max(maxY, c.y + h);
    }
    const pad = 60;
    const bw = Math.max(1, maxX - minX) + pad * 2;
    const bh = Math.max(1, maxY - minY) + pad * 2;
    const r = svgRef.current.getBoundingClientRect();
    const z = Math.min(r.width / bw, r.height / bh);
    const newZoom = Math.max(0.05, Math.min(4, z));
    // Centering: viewport center should map to bounds center.
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    setZoom(newZoom);
    setPan({ x: r.width / (2 * newZoom) - cx, y: r.height / (2 * newZoom) - cy });
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
    // Helper: resolve a board pin from admin store first (so wiring matches the
    // visible pin position even after admin edits), falling back to the static layout.
    const resolveBoardPin = (boardId: string) => {
      const b = adminBoards.find((bb) => bb.id === boardId);
      const vp = b?.pins?.find((p) => p.id === pinId);
      if (vp) return { x: vp.x, y: vp.y };
      const bp = findUnoPin(pinId);
      return bp ? { x: bp.x, y: bp.y } : null;
    };

    // Legacy primary board id "board": prefer the actual placed component's
    // position so wires follow when the user drags it. Fall back to the fixed
    // BOARD_X/Y only if no such component exists.
    if (componentId === "board") {
      const placed = components.find((cc) => cc.id === "board");
      const boardId = placed ? String(placed.props.boardId ?? "uno") : "uno";
      const p = resolveBoardPin(boardId);
      if (!p) return null;
      const bx = placed ? placed.x : BOARD_X;
      const by = placed ? placed.y : BOARD_Y;
      return { x: bx + p.x, y: by + p.y };
    }
    const c = components.find((cc) => cc.id === componentId);
    if (!c) return null;
    if (c.kind === "board") {
      const boardId = String(c.props.boardId ?? "uno");
      const p = resolveBoardPin(boardId);
      if (!p) return null;
      return { x: c.x + p.x, y: c.y + p.y };
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

  function removeWorkspaceComponent(id: string) {
    const comp = components.find((c) => c.id === id);
    const sketchFileId = comp?.kind === "board" ? String(comp.props.sketchFileId ?? "") : "";
    if (sketchFileId) ideDeleteFile(sketchFileId);
    removeComponent(id);
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
      {missingBoardIds.length > 0 && !locked && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 max-w-[90%] flex items-center gap-3 rounded-md border border-warning/60 bg-warning/15 backdrop-blur px-3 py-2 text-xs shadow-lg">
          <span className="font-semibold text-warning-foreground">⚠ Missing board</span>
          <span className="text-muted-foreground">
            This example wires to {missingBoardIds.length === 1
              ? <code className="font-mono">{missingBoardIds[0]}</code>
              : <>{missingBoardIds.length} boards</>}, but {missingBoardIds.length === 1 ? "it isn't" : "they aren't"} on the canvas.
          </span>
          <Button size="sm" className="h-7" onClick={autoInsertMissingBoards}>
            Auto-insert {missingBoardIds.length === 1 ? "board" : "boards"}
          </Button>
        </div>
      )}
      <svg
        ref={svgRef}
        className={`w-full h-full select-none ${pending ? "cursor-copy" : tool === "pan" ? (panning ? "cursor-grabbing" : "cursor-grab") : ""}`}
        onDragOver={onSvgDragOver}
        onDrop={onSvgDrop}
        onMouseMove={onMouseMove}
        onMouseUp={(e) => {
          setDragId(null);
          setPanning(false);
          setWpDrag(null);
          // Click without movement → just select the wire
          if (segPending) { setSelectedWireId(segPending.wireId); setSelected(null); setSegPending(null); }
        }}
        onWheel={onWheel}
        onMouseDown={(e) => {
          // Only react to clicks on the empty SVG background.
          if (e.target !== e.currentTarget) return;

          // Pending placement: left-click commits at the cursor; right-click cancels.
          if (pending) {
            if (e.button === 2) { setPending(null); return; }
            if (e.button === 0) {
              commitPlacement(clientToSvg(e));
              return;
            }
          }

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
          if (e.button === 0 && (tool === "pan" || e.altKey || e.metaKey || e.shiftKey)) setPanning(true);
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
                {/* Invisible hit target rendered BEFORE the board art so clicks anywhere on
                    the board reliably select/drag it. Pins (rendered after) stay on top. */}
                <rect
                  x={b.x} y={b.y}
                  width={bid === "uno" ? UNO_WIDTH : 360}
                  height={bid === "uno" ? UNO_HEIGHT : 240}
                  fill="transparent"
                  pointerEvents="all"
                />
                {bid === "uno" ? (
                  <ArduinoUnoBoard
                    x={b.x}
                    y={b.y}
                    highlightPin={drawingFrom?.componentId === b.id ? drawingFrom.pinId : undefined}
                    onPinClick={(pinId) => handleBoardPinClick(b.id, pinId)}
                    onPinHover={hoverHandler}
                    onChipClick={() => setChipInspectorBoardId(b.id)}
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
                  <>
                    <rect
                      x={b.x - 4} y={b.y - 4}
                      width={(bid === "uno" ? UNO_WIDTH : 360) + 8}
                      height={(bid === "uno" ? UNO_HEIGHT : 240) + 8}
                      fill="none" stroke="var(--color-primary)" strokeWidth={2}
                      strokeDasharray="6 4" pointerEvents="none"
                    />
                    {/* Per-board action toolbar — Run / Compile / Delete */}
                    <g transform={`translate(${b.x + (bid === "uno" ? UNO_WIDTH : 360) + 32} ${b.y + 8})`}>
                      {/* Run this board only */}
                      <g
                        className="cursor-pointer"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const fn = (window as unknown as { __embedsimRunBoards?: (ids: string[]) => void }).__embedsimRunBoards;
                          fn?.([b.id]);
                        }}
                      >
                        <title>Run this board's sketch</title>
                        <circle r={28} fill="oklch(0.72 0.18 145)" stroke="var(--color-background)" strokeWidth={3} />
                        <polygon points="-8,-12 12,0 -8,12" fill="oklch(0.15 0.02 145)" />
                      </g>
                      {/* Compile this board only */}
                      <g
                        transform="translate(0 68)"
                        className="cursor-pointer"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const fn = (window as unknown as { __embedsimCompileBoards?: (ids: string[]) => Promise<boolean> }).__embedsimCompileBoards;
                          fn?.([b.id]);
                        }}
                      >
                        <title>Compile this board's sketch</title>
                        <circle r={28} fill="var(--color-primary)" stroke="var(--color-background)" strokeWidth={3} />
                        <text textAnchor="middle" dominantBaseline="central" fontSize={24} fontWeight={800} fill="var(--color-primary-foreground)" fontFamily="monospace">⚙</text>
                      </g>
                      {/* Delete board */}
                      <g
                        transform="translate(0 136)"
                        className="cursor-pointer"
                        onMouseDown={(e) => { e.stopPropagation(); removeWorkspaceComponent(b.id); }}
                      >
                        <title>Delete board</title>
                        <circle r={26} fill="var(--color-destructive)" stroke="var(--color-background)" strokeWidth={3} />
                        <text textAnchor="middle" dominantBaseline="central" fontSize={36} fontWeight={800} fill="var(--color-destructive-foreground)">×</text>
                      </g>
                    </g>
                  </>
                )}
              </g>
            );
          })}

          {/* Components (skip placed boards — rendered above) */}
          {components.filter((c) => c.kind !== "board").map((c) => {
            const motorV = c.kind === "motor" ? computeLoadVoltage(c, net, "+", "-") : { volts: 0, reversed: false };
            return (
            <CircuitComponentNode
              key={c.id}
              comp={c}
              isPowered={status === "running" && isLedPowered(c, net, pinStates)}
              voltage={motorV.volts}
              reversed={motorV.reversed}
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
            );
          })}

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
            const sw = w.thickness ?? 7;
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
                        if (locked) {
                          setSelectedWireId(w.id);
                          setSelected(null);
                          return;
                        }
                        // Plain click+drag bends the wire; click without movement
                        // selects it (handled in onMouseUp on the SVG root).
                        const p = clientToSvg(e);
                        pushWireHistory();
                        setSegPending({ wireId: w.id, idx: i, sx: p.x, sy: p.y });
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
                strokeWidth={4}
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

          {/* Ghost placement preview: follows the cursor until clicked or Escaped. */}
          {pending && (
            <g
              transform={`translate(${mouse.x - pending.w / 2} ${mouse.y - pending.h / 2})`}
              opacity={0.9}
              pointerEvents="none"
            >
              <rect
                x={-4} y={-4} width={pending.w + 8} height={pending.h + 8}
                rx={6} fill="var(--color-primary)" fillOpacity={0.15}
                stroke="var(--color-primary)" strokeWidth={2.5} strokeDasharray="8 4"
              />
              <text x={pending.w / 2} y={pending.h / 2} textAnchor="middle"
                dominantBaseline="middle" fontSize={16} fontWeight={700} fontFamily="monospace"
                fill="var(--color-primary)">
                {pending.kind === "board" ? `Place ${pending.boardId} board`
                  : pending.kind === "custom" ? "Place component"
                  : `Place ${pending.value}`}
              </text>
            </g>
          )}
        </g>
      </svg>

      {/* Floating workspace tool panel — Select / Pan / Wire (more tools added later). */}
      {!locked && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-md bg-card/95 backdrop-blur border border-border p-1 shadow-lg">
          {[
            { id: "select" as const, icon: MousePointer2, label: "Select (V)" },
            { id: "pan" as const,    icon: Hand,          label: "Pan (H) — drag to move workspace" },
            { id: "wire" as const,   icon: Cable,         label: "Wire (W) — click pins to connect" },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => setTool(id)}
              title={label}
              className={`h-8 w-8 flex items-center justify-center rounded transition-colors ${
                tool === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      )}

      {/* Zoom toolbar overlay */}
      <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-card/90 backdrop-blur border border-border px-2 py-1 text-xs font-mono">
        <span className="text-muted-foreground mr-1">zoom</span>
        <button
          className="px-1.5 py-0.5 rounded hover:bg-accent disabled:opacity-40"
          onClick={() => setZoom((z) => Math.max(0.05, +(z * 0.85).toFixed(3)))}
          disabled={zoom <= 0.05}
          title="Zoom out"
        >−</button>
        <span className="tabular-nums w-12 text-center">{(zoom * 100).toFixed(0)}%</span>
        <button
          className="px-1.5 py-0.5 rounded hover:bg-accent disabled:opacity-40"
          onClick={() => setZoom((z) => Math.min(4, +(z * 1.18).toFixed(3)))}
          disabled={zoom >= 4}
          title="Zoom in"
        >+</button>
        <button
          className="px-1.5 py-0.5 rounded hover:bg-accent ml-1"
          onClick={fitToScreen}
          title="Auto-fit all components to screen"
        >fit</button>
        <button
          className="px-1.5 py-0.5 rounded hover:bg-accent"
          onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
          title="Reset zoom to 100%"
        >reset</button>
      </div>

      {selectedId && !locked && (() => {
        const sel = components.find((c) => c.id === selectedId);
        const isCustom = sel?.kind === "custom";
        const isLed = sel?.kind === "led";
        const isResistor = sel?.kind === "resistor";
        const ledColors = ["red", "green", "blue", "yellow", "white", "orange", "purple"] as const;
        const ledColorSwatch: Record<string, string> = {
          red: "oklch(0.7 0.25 25)", green: "oklch(0.78 0.22 145)", blue: "oklch(0.7 0.22 245)",
          yellow: "oklch(0.85 0.18 90)", white: "oklch(0.96 0.02 90)",
          orange: "oklch(0.78 0.20 55)", purple: "oklch(0.7 0.22 305)",
        };
        const resistorPresets = [220, 330, 470, 1_000, 2_200, 4_700, 10_000, 100_000];
        const fmtOhms = (v: number) =>
          v >= 1_000_000 ? `${+(v / 1_000_000).toFixed(2)}MΩ`
          : v >= 1_000 ? `${+(v / 1_000).toFixed(2)}kΩ`
          : `${v}Ω`;
        return (
          <div className="absolute top-3 right-3 flex items-center gap-2 flex-wrap justify-end max-w-[calc(100%-1.5rem)]">
            {isResistor && sel && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card/95 backdrop-blur px-2 py-1 text-xs shadow">
                <span className="text-muted-foreground">Ω</span>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={Number(sel.props.ohms ?? 330)}
                  onChange={(e) => {
                    const n = Math.max(1, Math.round(Number(e.target.value) || 0));
                    setComponentProp(selectedId, "ohms", n);
                  }}
                  className="bg-input border border-border rounded px-1.5 py-0.5 text-xs w-24 font-mono"
                  title="Resistance in ohms"
                />
                <span className="text-muted-foreground font-mono">{fmtOhms(Number(sel.props.ohms ?? 330))}</span>
                <span className="text-muted-foreground ml-1">Preset</span>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setComponentProp(selectedId, "ohms", Number(e.target.value));
                  }}
                  className="bg-input border border-border rounded px-1.5 py-0.5 text-xs"
                >
                  <option value="">—</option>
                  {resistorPresets.map((v) => (
                    <option key={v} value={v}>{fmtOhms(v)}</option>
                  ))}
                </select>
              </div>
            )}
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
                {Boolean(sel.props.burned) && (
                  <button
                    onClick={() => setComponentProp(selectedId, "burned", false)}
                    className="ml-2 px-2 py-0.5 rounded bg-destructive text-destructive-foreground text-xs hover:opacity-90"
                    title="Replace this burned LED"
                  >
                    Replace LED
                  </button>
                )}
              </div>
            )}
            {sel?.kind === "button" && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card/95 backdrop-blur px-2 py-1 text-xs shadow">
                <span className="text-muted-foreground">Cap color</span>
                <div className="flex items-center gap-1">
                  {(["red", "green", "blue", "yellow", "white", "black", "orange"] as const).map((col) => {
                    const sw: Record<string, string> = {
                      red: "oklch(0.7 0.20 25)", green: "oklch(0.72 0.20 145)",
                      blue: "oklch(0.7 0.20 245)", yellow: "oklch(0.85 0.18 90)",
                      white: "oklch(0.95 0.01 0)", black: "oklch(0.25 0.01 0)",
                      orange: "oklch(0.78 0.20 55)",
                    };
                    return (
                      <button
                        key={col}
                        onClick={() => setComponentProp(selectedId, "color", col)}
                        className={[
                          "w-5 h-5 rounded-full border transition",
                          String(sel.props.color || "red") === col ? "ring-2 ring-primary border-primary" : "border-border",
                        ].join(" ")}
                        style={{ background: sw[col] }}
                        title={col}
                      />
                    );
                  })}
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
                  title="Button size"
                />
                <span className="text-muted-foreground font-mono">{Number(sel.props.size ?? 1).toFixed(1)}×</span>
              </div>
            )}
            {sel?.kind === "battery" && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card/95 backdrop-blur px-2 py-1 text-xs shadow">
                <span className="text-muted-foreground">Cells</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  step={1}
                  value={Number(sel.props.cells ?? 1)}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(8, Math.round(Number(e.target.value) || 1)));
                    setComponentProp(selectedId, "cells", n);
                  }}
                  className="bg-input border border-border rounded px-1.5 py-0.5 text-xs w-16 font-mono"
                />
                <span className="text-muted-foreground font-mono">
                  = {(Number(sel.props.cells ?? 1) * 3.7).toFixed(1)}V
                </span>
              </div>
            )}
            {sel?.kind === "motor" && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card/95 backdrop-blur px-2 py-1 text-xs shadow">
                <span className="text-muted-foreground">Propeller</span>
                <div className="flex items-center gap-1">
                  {(["blue", "red", "pink", "yellow", "green"] as const).map((col) => {
                    const sw: Record<string, string> = {
                      blue: "oklch(0.7 0.20 240)", red: "oklch(0.65 0.22 25)",
                      pink: "oklch(0.72 0.22 0)", yellow: "oklch(0.88 0.18 95)",
                      green: "oklch(0.65 0.20 145)",
                    };
                    return (
                      <button
                        key={col}
                        onClick={() => setComponentProp(selectedId, "propColor", col)}
                        className={[
                          "w-5 h-5 rounded-full border transition",
                          String(sel.props.propColor || "blue") === col ? "ring-2 ring-primary border-primary" : "border-border",
                        ].join(" ")}
                        style={{ background: sw[col] }}
                        title={col}
                      />
                    );
                  })}
                </div>
                <span className="ml-2 text-muted-foreground font-mono">5V • 50–100mA • burns &gt;12V</span>
                {Boolean(sel.props.burned) && (
                  <button
                    onClick={() => setComponentProp(selectedId, "burned", false)}
                    className="ml-2 px-2 py-0.5 rounded bg-destructive text-destructive-foreground text-xs hover:opacity-90"
                    title="Replace this burned motor"
                  >
                    Replace Motor
                  </button>
                )}
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
              onClick={() => removeWorkspaceComponent(selectedId)}
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
        const thick = w.thickness ?? 4;

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
        onPickComponent={(kind) => startPlacement({ kind: "component", value: kind })}
        onPickCustom={(entry) => startPlacement({
          kind: "custom",
          customId: entry.id,
          w: entry.width ?? 80,
          h: entry.height ?? 60,
        })}
        onPickBoard={(bid) => startPlacement({ kind: "board", boardId: bid })}
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

      {/* 3D table view removed per user request */}

      {/* Use the unused size constants to silence lint */}
      <span className="hidden">{UNO_WIDTH}{UNO_HEIGHT}</span>
    </div>
  );
}
