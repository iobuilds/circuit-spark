import { create } from "zustand";
import type {
  BoardId,
  CircuitComponent,
  ComponentKind,
  PinState,
  SerialLine,
  SimStatus,
  Wire,
} from "./types";

const DEFAULT_CODE = `// Blink the on-board LED on pin 13.
// Wire an LED from pin 13 to GND through a 220Ω resistor.

void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("EmbedSim ready");
}

void loop() {
  digitalWrite(13, HIGH);
  Serial.println("LED ON");
  delay(500);
  digitalWrite(13, LOW);
  Serial.println("LED OFF");
  delay(500);
}
`;

export interface SimState {
  // workspace
  boardId: BoardId;
  components: CircuitComponent[];
  wires: Wire[];
  selectedId: string | null;
  drawingFrom: { componentId: string; pinId: string } | null;
  /** Intermediate click points while drawing a wire, in canvas coordinates. */
  drawingWaypoints: { x: number; y: number }[];

  /** Past wire-array snapshots for undo (most recent at end). */
  wireHistory: Wire[][];
  /** Wire snapshots that have been undone, available for redo. */
  wireFuture: Wire[][];

  // editor / runtime
  code: string;
  status: SimStatus;
  /** Per-board serial lines, keyed by board component id. */
  serialByBoard: Record<string, SerialLine[]>;
  /** Per-board pin states, keyed by board component id. */
  pinStatesByBoard: Record<string, Record<number, PinState>>;
  /** Per-board run/compile status, keyed by board component id. */
  statusByBoard: Record<string, SimStatus>;
  /** Currently focused board for the bottom Pin States / Serial panels. */
  activeSimBoardId: string | null;
  /** Aggregate / focused-board mirrors. Components that don't care about
   *  multi-board can keep reading these. They mirror the active board. */
  serial: SerialLine[];
  pinStates: Record<number, PinState>;
  simTimeMs: number;
  speed: number;
  compileLog: { kind: "info" | "warn" | "error"; text: string }[];

  /** Per-board parsed flash image (Intel HEX → bytes), keyed by board component id. */
  flashByBoard: Record<string, Uint8Array>;
  /** Per-board EEPROM image (1 KB on ATmega328P). Updated by avr8js worker. */
  eepromByBoard: Record<string, Uint8Array>;
  /** Per-board live SRAM snapshot from avr8js (sampled by the worker). */
  sramByBoard: Record<string, Uint8Array>;
  /** Per-board emulator state — PC, SP, cycles. Updated by avr8js worker. */
  cpuByBoard: Record<string, { pc: number; sp: number; cycles: number; sreg: number }>;
  /** Whether avr8js mode is active for a given board (true after a successful compile). */
  avrModeByBoard: Record<string, boolean>;

  // ui
  theme: "dark" | "light";

  // actions
  setBoard: (b: BoardId) => void;
  setCode: (c: string) => void;
  addComponent: (kind: ComponentKind, x: number, y: number, customId?: string) => string;
  moveComponent: (id: string, x: number, y: number) => void;
  removeComponent: (id: string) => void;
  setSelected: (id: string | null) => void;
  setComponentProp: (id: string, key: string, value: number | string | boolean) => void;
  startWire: (componentId: string, pinId: string) => void;
  finishWire: (componentId: string, pinId: string) => void;
  addWireWaypoint: (point: { x: number; y: number }) => void;
  undoWireWaypoint: () => void;
  cancelWire: () => void;
  removeWire: (id: string) => void;
  updateWireWaypoint: (wireId: string, idx: number, point: { x: number; y: number }) => void;
  insertWireWaypoint: (wireId: string, idx: number, point: { x: number; y: number }) => void;
  /** Snapshot current wires into history (used before continuous edits like waypoint drag). */
  pushWireHistory: () => void;
  setWireStyle: (wireId: string, style: { color?: string; thickness?: number }) => void;
  /** Replace the entire wires array (used by bulk operations like apply-to-net or auto-route). */
  setWires: (next: Wire[]) => void;

  /** Undo the last wire-changing action (history-based). */
  undoWires: () => void;
  /** Redo the last undone wire-changing action. */
  redoWires: () => void;
  /** Whether undo / redo are currently available. */
  canUndoWires: () => boolean;
  canRedoWires: () => boolean;

  setStatus: (s: SimStatus) => void;
  setPinStates: (s: Record<number, PinState>, boardId?: string) => void;
  appendSerial: (line: SerialLine, boardId?: string) => void;
  clearSerial: (boardId?: string) => void;
  setSimTime: (ms: number) => void;
  setSpeed: (n: number) => void;
  setCompileLog: (l: SimState["compileLog"]) => void;
  setActiveSimBoard: (id: string | null) => void;
  setBoardStatus: (id: string, s: SimStatus) => void;

  toggleTheme: () => void;
  resetWorkspace: () => void;
  loadProject: (p: {
    code: string;
    components: CircuitComponent[];
    wires: Wire[];
    boardId: BoardId;
    /** Optional: per-board sketches. When present, the IDE creates one .ino
     *  file per entry and attaches each to its `boardCompId` board. */
    sketches?: { boardCompId: string; fileName: string; code: string }[];
  }) => void;
}

let cidCounter = 1;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${cidCounter++}`;

const HISTORY_LIMIT = 50;

export const useSimStore = create<SimState>((set, get) => {
  /** Snapshot the current wires array into history, clearing the redo stack. */
  const snapshotWires = () => {
    const cur = get().wires;
    const hist = get().wireHistory;
    const next = [...hist, cur].slice(-HISTORY_LIMIT);
    set({ wireHistory: next, wireFuture: [] });
  };

  return ({
  boardId: "uno",
  components: [],
  wires: [],
  selectedId: null,
  drawingFrom: null,
  drawingWaypoints: [],

  wireHistory: [],
  wireFuture: [],

  code: DEFAULT_CODE,
  status: "idle",
  serial: [],
  pinStates: {},
  serialByBoard: {},
  pinStatesByBoard: {},
  statusByBoard: {},
  activeSimBoardId: null,
  simTimeMs: 0,
  speed: 1,
  compileLog: [],
  flashByBoard: {},
  eepromByBoard: {},
  sramByBoard: {},
  cpuByBoard: {},
  avrModeByBoard: {},

  theme: "dark",

  setBoard: (b) => set({ boardId: b }),
  setCode: (c) => set({ code: c }),

  addComponent: (kind, x, y, customId) => {
    const id = nid("c");
    const props: Record<string, number | string | boolean> = {};
    if (kind === "led") { props.color = "red"; props.size = 1; props.mode = "auto"; }
    if (kind === "button") { props.color = "red"; props.size = 1; }
    if (kind === "resistor") { props.ohms = 330; }
    if (kind === "potentiometer") { props.value = 512; }
    if (kind === "battery") { props.cells = 1; }
    if (kind === "motor") { props.propColor = "blue"; }
    if (kind === "custom" && customId) { props.customId = customId; }
    if (kind === "board") {
      // customId is reused as the BoardId for boards (e.g. "uno", "mega").
      props.boardId = customId ?? "uno";
    }
    set((s) => ({
      components: [...s.components, { id, kind, x, y, rotation: 0, props }],
      selectedId: id,
    }));
    return id;
  },
  moveComponent: (id, x, y) => set((s) => ({
    components: s.components.map((c) => (c.id === id ? { ...c, x, y } : c)),
  })),
  removeComponent: (id) => set((s) => ({
    components: s.components.filter((c) => c.id !== id),
    wires: s.wires.filter((w) => w.from.componentId !== id && w.to.componentId !== id),
    selectedId: s.selectedId === id ? null : s.selectedId,
  })),
  setSelected: (id) => set({ selectedId: id }),
  setComponentProp: (id, key, value) => set((s) => ({
    components: s.components.map((c) =>
      c.id === id ? { ...c, props: { ...c.props, [key]: value } } : c
    ),
  })),

  startWire: (componentId, pinId) => set({
    drawingFrom: { componentId, pinId },
    drawingWaypoints: [],
  }),
  finishWire: (componentId, pinId) => {
    const { drawingFrom, wires, drawingWaypoints } = get();
    if (!drawingFrom) return;
    // Clicking the same pin you started from cancels (incomplete → vanish).
    if (drawingFrom.componentId === componentId && drawingFrom.pinId === pinId) {
      set({ drawingFrom: null, drawingWaypoints: [] });
      return;
    }
    snapshotWires();
    set({
      wires: [
        ...wires,
        {
          id: nid("w"),
          from: drawingFrom,
          to: { componentId, pinId },
          waypoints: drawingWaypoints.length ? [...drawingWaypoints] : undefined,
        },
      ],
      drawingFrom: null,
      drawingWaypoints: [],
    });
  },
  addWireWaypoint: (point) => set((s) => (
    s.drawingFrom ? { drawingWaypoints: [...s.drawingWaypoints, point] } : {}
  )),
  undoWireWaypoint: () => set((s) => (
    s.drawingWaypoints.length
      ? { drawingWaypoints: s.drawingWaypoints.slice(0, -1) }
      : {}
  )),
  cancelWire: () => set({ drawingFrom: null, drawingWaypoints: [] }),
  removeWire: (id) => {
    snapshotWires();
    set((s) => ({ wires: s.wires.filter((w) => w.id !== id) }));
  },
  updateWireWaypoint: (wireId, idx, point) => set((s) => ({
    wires: s.wires.map((w) => {
      if (w.id !== wireId) return w;
      const wp = [...(w.waypoints ?? [])];
      if (idx < 0 || idx >= wp.length) return w;
      wp[idx] = point;
      return { ...w, waypoints: wp };
    }),
  })),
  insertWireWaypoint: (wireId, idx, point) => {
    snapshotWires();
    set((s) => ({
      wires: s.wires.map((w) => {
        if (w.id !== wireId) return w;
        const wp = [...(w.waypoints ?? [])];
        wp.splice(idx, 0, point);
        return { ...w, waypoints: wp };
      }),
    }));
  },
  setWireStyle: (wireId, style) => {
    snapshotWires();
    set((s) => ({
      wires: s.wires.map((w) => (w.id === wireId ? { ...w, ...style } : w)),
    }));
  },
  setWires: (next) => {
    snapshotWires();
    set({ wires: next });
  },
  pushWireHistory: () => snapshotWires(),

  undoWires: () => {
    const hist = get().wireHistory;
    if (hist.length === 0) return;
    const prev = hist[hist.length - 1];
    const cur = get().wires;
    set({
      wires: prev,
      wireHistory: hist.slice(0, -1),
      wireFuture: [...get().wireFuture, cur].slice(-HISTORY_LIMIT),
    });
  },
  redoWires: () => {
    const fut = get().wireFuture;
    if (fut.length === 0) return;
    const next = fut[fut.length - 1];
    const cur = get().wires;
    set({
      wires: next,
      wireFuture: fut.slice(0, -1),
      wireHistory: [...get().wireHistory, cur].slice(-HISTORY_LIMIT),
    });
  },
  canUndoWires: () => get().wireHistory.length > 0,
  canRedoWires: () => get().wireFuture.length > 0,

  setStatus: (s) => set({ status: s }),
  setPinStates: (p, boardId) => set((st) => {
    if (!boardId) return { pinStates: p };
    const next = { ...st.pinStatesByBoard, [boardId]: p };
    const isActive = st.activeSimBoardId === boardId || st.activeSimBoardId == null;
    return isActive
      ? { pinStatesByBoard: next, pinStates: p }
      : { pinStatesByBoard: next };
  }),
  appendSerial: (line, boardId) => set((st) => {
    if (!boardId) return { serial: [...st.serial, line].slice(-500) };
    const prev = st.serialByBoard[boardId] ?? [];
    const updated = [...prev, line].slice(-500);
    const byBoard = { ...st.serialByBoard, [boardId]: updated };
    const isActive = st.activeSimBoardId === boardId || st.activeSimBoardId == null;
    return isActive
      ? { serialByBoard: byBoard, serial: updated }
      : { serialByBoard: byBoard };
  }),
  clearSerial: (boardId) => set((st) => {
    if (!boardId) return { serial: [], serialByBoard: {} };
    const byBoard = { ...st.serialByBoard, [boardId]: [] };
    const isActive = st.activeSimBoardId === boardId;
    return isActive
      ? { serialByBoard: byBoard, serial: [] }
      : { serialByBoard: byBoard };
  }),
  setSimTime: (ms) => set({ simTimeMs: ms }),
  setSpeed: (n) => set({ speed: n }),
  setCompileLog: (l) => set({ compileLog: l }),
  setActiveSimBoard: (id) => set((st) => ({
    activeSimBoardId: id,
    serial: id ? (st.serialByBoard[id] ?? []) : [],
    pinStates: id ? (st.pinStatesByBoard[id] ?? {}) : {},
    status: id ? (st.statusByBoard[id] ?? st.status) : st.status,
  })),
  setBoardStatus: (id, s) => set((st) => {
    const byBoard = { ...st.statusByBoard, [id]: s };
    const isActive = st.activeSimBoardId === id || st.activeSimBoardId == null;
    // Aggregate top-level status: running if any board is running, else error if any error, else idle.
    const vals = Object.values(byBoard);
    const agg: SimStatus = vals.includes("running") ? "running"
      : vals.includes("paused") ? "paused"
      : vals.includes("error") ? "error" : "idle";
    return { statusByBoard: byBoard, status: isActive ? s : agg };
  }),

  toggleTheme: () => set((s) => {
    const next = s.theme === "dark" ? "light" : "dark";
    if (typeof document !== "undefined") {
      document.documentElement.classList.toggle("light", next === "light");
    }
    return { theme: next };
  }),

  resetWorkspace: () => set({
    components: [], wires: [], selectedId: null, serial: [], pinStates: {},
    serialByBoard: {}, pinStatesByBoard: {}, statusByBoard: {}, activeSimBoardId: null,
    simTimeMs: 0, drawingFrom: null, drawingWaypoints: [],
    wireHistory: [], wireFuture: [],
  }),
  loadProject: (p) => {
    // Ensure a board exists for templates that wire to the legacy "board" id
    // without including a board component in their components[] array.
    const hasBoardComp = p.components.some((c) => c.kind === "board");
    const refsLegacyBoard = p.wires.some(
      (w) => w.from.componentId === "board" || w.to.componentId === "board",
    );
    const components = !hasBoardComp && (refsLegacyBoard || p.components.length === 0 || (!p.sketches || p.sketches.length === 0))
      ? [
          {
            id: "board",
            kind: "board" as const,
            x: 60,
            y: 60,
            rotation: 0 as const,
            props: { boardId: p.boardId },
          },
          ...p.components,
        ]
      : p.components;

    // Reset multi-board runtime state so old data doesn't leak between projects.
    set({
      code: p.code,
      components,
      wires: p.wires,
      boardId: p.boardId,
      selectedId: null,
      serial: [],
      pinStates: {},
      serialByBoard: {},
      pinStatesByBoard: {},
      statusByBoard: {},
      activeSimBoardId: null,
      wireHistory: [],
      wireFuture: [],
    });

    import("./ideStore").then(({ useIdeStore }) => {
      const ide = useIdeStore.getState();
      if (!ide.loaded) return;

      // Multi-board path: create one .ino per entry in p.sketches and attach
      // each new file's id to its target board's `sketchFileId` prop.
      if (p.sketches && p.sketches.length > 0) {
        const keep = ide.files.filter(
          (f) => !(f.kind === "ino" && f.name.startsWith("sketch_")),
        );
        const cidGen = (n: number) =>
          `f_${Date.now().toString(36)}_${n.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        const newFiles = p.sketches.map((s, i) => ({
          id: cidGen(i),
          name: s.fileName,
          kind: "ino" as const,
          content: s.code,
        }));
        const allFiles = [...keep, ...newFiles];

        const compsWithSketches = p.components.map((c) => {
          if (c.kind !== "board") return c;
          const idx = p.sketches!.findIndex((s) => s.boardCompId === c.id);
          if (idx < 0) return c;
          return { ...c, props: { ...c.props, sketchFileId: newFiles[idx].id } };
        });

        useIdeStore.setState({ files: allFiles, activeFileId: newFiles[0].id });
        set({ components: compsWithSketches });
        return;
      }

      // Single-board legacy path: write p.code into the active .ino file.
      if (ide.files.length === 0) return;
      const target =
        ide.files.find((f) => f.id === ide.activeFileId && f.kind === "ino") ??
        ide.files.find((f) => f.kind === "ino") ??
        ide.files[0];
      if (!target) return;
      useIdeStore.setState({
        files: ide.files.map((f) => (f.id === target.id ? { ...f, content: p.code } : f)),
        activeFileId: target.id,
      });
    }).catch(() => { /* non-fatal */ });
  },
  });
});
