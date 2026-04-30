// Admin library store. Persists overrides for built-in boards/components plus user-created customs in localStorage.
// Schema versioned (_version: 1) for future migration.

import { create } from "zustand";
import { BOARDS, type BoardDef, type BoardId, type ComponentKind } from "./types";
import { COMPONENT_DEFS } from "./components";
import { UNO_SVG } from "./boardSvgs/unoSvg";
import { defaultUnoPins } from "./boardSvgs/unoPins";

const STORAGE_VERSION = 2;
const KEY_BOARDS = "embedsim_boards";
const KEY_COMPONENTS = "embedsim_components";

/** Pin marker placed visually on top of an SVG. Coordinates are in the SVG's
 *  natural viewBox/user-space (so they survive zoom and pan). */
export interface VisualPin {
  id: string;            // unique within the board/component
  label: string;         // displayed name e.g. "D13", "VCC", "Anode"
  /** Functional role drives how the simulator wires/treats this pin. */
  type: "digital" | "analog" | "pwm" | "power" | "ground" | "i2c-sda" | "i2c-scl" | "spi" | "uart" | "other";
  /** Optional hardware pin number for boards (e.g. 13 for D13). */
  number?: number;
  x: number;             // SVG user-space X
  y: number;             // SVG user-space Y
  color?: string;        // hex e.g. "#22c55e"
  notes?: string;
}

export interface BoardEntry {
  id: string;          // BoardId or custom id
  name: string;
  mcu: string;
  digitalPins: number;
  analogPins: number;
  enabled: boolean;
  builtIn: boolean;
  /** Raw SVG markup for visual rendering in the editor and simulator. */
  svg?: string;
  /** Pins placed on top of the SVG. */
  pins?: VisualPin[];
}

export interface ComponentEntry {
  id: string;          // ComponentKind for built-ins, or custom id
  label: string;
  category: string;
  enabled: boolean;
  builtIn: boolean;
  /** Behavior for custom components in the simulator. */
  behavior?: "digital-out" | "digital-in" | "analog-in" | "passive";
  width?: number;
  height?: number;
  /** Raw SVG markup for visual rendering. */
  svg?: string;
  /** Visual pins placed on the SVG. Replaces legacy basic pin list. */
  pins?: VisualPin[];
  bodyColor?: string;  // hex/oklch for custom rendering
}

interface PersistedShape<T> {
  _version: number;
  items: T[];
}

function defaultBoards(): BoardEntry[] {
  return BOARDS.map((b) => {
    const base: BoardEntry = {
      id: b.id,
      name: b.name,
      mcu: b.mcu,
      digitalPins: b.digitalPins,
      analogPins: b.analogPins,
      enabled: b.available,
      builtIn: true,
    };
    if (b.id === "uno") {
      base.svg = UNO_SVG;
      base.pins = defaultUnoPins();
    }
    return base;
  });
}

function defaultComponents(): ComponentEntry[] {
  return Object.values(COMPONENT_DEFS).map((c) => ({
    id: c.kind,
    label: c.label,
    category: c.category,
    enabled: c.available,
    builtIn: true,
  }));
}

function loadPersisted<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as PersistedShape<T>;
    if (!parsed || !Array.isArray(parsed.items)) return fallback;
    // Forward-compatible: v1 data has the same shape minus svg/pins (both optional).
    if (parsed._version !== STORAGE_VERSION && parsed._version !== 1) return fallback;
    return parsed.items;
  } catch { return fallback; }
}

function persist<T>(key: string, items: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ _version: STORAGE_VERSION, items }));
  } catch (e) { console.error("Persist failed", e); }
}

/** Merge persisted overrides with built-ins so newly-added built-ins still appear after a release. */
function mergeBoards(persisted: BoardEntry[]): BoardEntry[] {
  const defaults = defaultBoards();
  const map = new Map<string, BoardEntry>();
  defaults.forEach((b) => map.set(b.id, b));
  const ordered: BoardEntry[] = [];
  persisted.forEach((p) => {
    const def = map.get(p.id);
    if (def) {
      // Backfill svg/pins from defaults when persisted entry doesn't have them yet.
      const merged: BoardEntry = {
        ...def,
        ...p,
        builtIn: true,
        svg: p.svg ?? def.svg,
        pins: p.pins && p.pins.length > 0 ? p.pins : def.pins,
      };
      ordered.push(merged);
      map.delete(p.id);
    } else if (!p.builtIn) {
      ordered.push(p);
    }
  });
  // Append any new built-ins not in persisted
  map.forEach((b) => ordered.push(b));
  return ordered;
}

function mergeComponents(persisted: ComponentEntry[]): ComponentEntry[] {
  const defaults = defaultComponents();
  const map = new Map<string, ComponentEntry>();
  defaults.forEach((c) => map.set(c.id, c));
  const ordered: ComponentEntry[] = [];
  persisted.forEach((p) => {
    const def = map.get(p.id);
    if (def) {
      ordered.push({ ...def, ...p, builtIn: true });
      map.delete(p.id);
    } else if (!p.builtIn) {
      ordered.push(p);
    }
  });
  map.forEach((c) => ordered.push(c));
  return ordered;
}

interface AdminState {
  boards: BoardEntry[];
  components: ComponentEntry[];
  loaded: boolean;

  hydrate: () => void;
  setBoardEnabled: (id: string, enabled: boolean) => void;
  setComponentEnabled: (id: string, enabled: boolean) => void;
  bulkSetBoards: (ids: string[], enabled: boolean) => void;
  bulkSetComponents: (ids: string[], enabled: boolean) => void;
  reorderBoards: (fromIdx: number, toIdx: number) => void;
  reorderComponents: (fromIdx: number, toIdx: number) => void;
  resetBoards: () => void;
  resetComponents: () => void;
  importBoards: (items: BoardEntry[]) => void;
  importComponents: (items: ComponentEntry[]) => void;

  updateBoard: (id: string, patch: Partial<BoardEntry>) => void;
  updateComponent: (id: string, patch: Partial<ComponentEntry>) => void;
  createCustomBoard: (init?: Partial<BoardEntry>) => string;
  createCustomComponent: (init?: Partial<ComponentEntry>) => string;
  deleteBoard: (id: string) => void;
  deleteComponent: (id: string) => void;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  boards: [],
  components: [],
  loaded: false,

  hydrate: () => {
    if (typeof window === "undefined") return;
    const boards = mergeBoards(loadPersisted<BoardEntry>(KEY_BOARDS, defaultBoards()));
    const components = mergeComponents(loadPersisted<ComponentEntry>(KEY_COMPONENTS, defaultComponents()));
    set({ boards, components, loaded: true });
  },

  setBoardEnabled: (id, enabled) => {
    const next = get().boards.map((b) => (b.id === id ? { ...b, enabled } : b));
    persist(KEY_BOARDS, next);
    set({ boards: next });
  },
  setComponentEnabled: (id, enabled) => {
    const next = get().components.map((c) => (c.id === id ? { ...c, enabled } : c));
    persist(KEY_COMPONENTS, next);
    set({ components: next });
  },
  bulkSetBoards: (ids, enabled) => {
    const set2 = new Set(ids);
    const next = get().boards.map((b) => (set2.has(b.id) ? { ...b, enabled } : b));
    persist(KEY_BOARDS, next);
    set({ boards: next });
  },
  bulkSetComponents: (ids, enabled) => {
    const set2 = new Set(ids);
    const next = get().components.map((c) => (set2.has(c.id) ? { ...c, enabled } : c));
    persist(KEY_COMPONENTS, next);
    set({ components: next });
  },
  reorderBoards: (fromIdx, toIdx) => {
    const arr = [...get().boards];
    const [m] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, m);
    persist(KEY_BOARDS, arr);
    set({ boards: arr });
  },
  reorderComponents: (fromIdx, toIdx) => {
    const arr = [...get().components];
    const [m] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, m);
    persist(KEY_COMPONENTS, arr);
    set({ components: arr });
  },
  resetBoards: () => {
    const d = defaultBoards();
    persist(KEY_BOARDS, d);
    set({ boards: d });
  },
  resetComponents: () => {
    const d = defaultComponents();
    persist(KEY_COMPONENTS, d);
    set({ components: d });
  },
  importBoards: (items) => {
    const merged = mergeBoards(items);
    persist(KEY_BOARDS, merged);
    set({ boards: merged });
  },
  importComponents: (items) => {
    const merged = mergeComponents(items);
    persist(KEY_COMPONENTS, merged);
    set({ components: merged });
  },

  updateBoard: (id, patch) => {
    const next = get().boards.map((b) => (b.id === id ? { ...b, ...patch, id: b.id } : b));
    persist(KEY_BOARDS, next);
    set({ boards: next });
  },
  updateComponent: (id, patch) => {
    const next = get().components.map((c) => (c.id === id ? { ...c, ...patch, id: c.id } : c));
    persist(KEY_COMPONENTS, next);
    set({ components: next });
  },
  createCustomBoard: (init) => {
    const id = init?.id ?? `custom-board-${Date.now().toString(36)}`;
    const entry: BoardEntry = {
      id,
      name: init?.name ?? "Untitled Board",
      mcu: init?.mcu ?? "ATmega328P",
      digitalPins: init?.digitalPins ?? 14,
      analogPins: init?.analogPins ?? 6,
      enabled: init?.enabled ?? true,
      builtIn: false,
      svg: init?.svg,
      pins: init?.pins ?? [],
    };
    const next = [...get().boards, entry];
    persist(KEY_BOARDS, next);
    set({ boards: next });
    return id;
  },
  createCustomComponent: (init) => {
    const id = init?.id ?? `custom-component-${Date.now().toString(36)}`;
    const entry: ComponentEntry = {
      id,
      label: init?.label ?? "Untitled Component",
      category: init?.category ?? "custom",
      enabled: init?.enabled ?? true,
      builtIn: false,
      behavior: init?.behavior ?? "passive",
      svg: init?.svg,
      pins: init?.pins ?? [],
      bodyColor: init?.bodyColor,
      width: init?.width,
      height: init?.height,
    };
    const next = [...get().components, entry];
    persist(KEY_COMPONENTS, next);
    set({ components: next });
    return id;
  },
  deleteBoard: (id) => {
    const next = get().boards.filter((b) => !(b.id === id && !b.builtIn));
    persist(KEY_BOARDS, next);
    set({ boards: next });
  },
  deleteComponent: (id) => {
    const next = get().components.filter((c) => !(c.id === id && !c.builtIn));
    persist(KEY_COMPONENTS, next);
    set({ components: next });
  },
}));

/** Convenience: sets of ids that are enabled. Used by the simulator. */
export function selectEnabledBoardIds(state: AdminState): Set<BoardId> {
  return new Set(state.boards.filter((b) => b.enabled).map((b) => b.id as BoardId));
}
export function selectEnabledComponentIds(state: AdminState): Set<ComponentKind> {
  return new Set(state.components.filter((c) => c.enabled).map((c) => c.id as ComponentKind));
}

export function exportSnapshot(): { boards: BoardEntry[]; components: ComponentEntry[]; _version: number } {
  return {
    _version: STORAGE_VERSION,
    boards: useAdminStore.getState().boards,
    components: useAdminStore.getState().components,
  };
}
