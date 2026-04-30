// IDE state store: installed boards/libraries, multi-file project, preferences.
// Persisted in localStorage.

import { create } from "zustand";
import { BOARD_PACKAGES, LIBRARY_PACKAGES } from "./ideCatalog";

const STORAGE_VERSION = 1;
const KEY_BOARDS = "ide_installed_boards";
const KEY_LIBS = "ide_installed_libraries";
const KEY_PROJECT = "ide_project_files";
const KEY_PREFS = "ide_preferences";

export type SourceFileKind = "ino" | "h" | "cpp" | "c";

export interface SourceFile {
  id: string;
  name: string;        // includes extension
  kind: SourceFileKind;
  content: string;
}

export interface InstalledBoard {
  id: string;
  version: string;
}
export interface InstalledLibrary {
  id: string;
  version: string;
  /** True when the library was uploaded as a zip (not from catalog). */
  custom?: boolean;
  name?: string;
  headers?: string[];
}

export interface IdePreferences {
  fontSize: number;
  editorTheme: "embedsim-dark" | "vs-dark" | "light" | "hc-black" | "monokai" | "dracula";
  autoIncludeOnInstall: boolean;
}

const DEFAULT_PREFS: IdePreferences = {
  fontSize: 13,
  editorTheme: "embedsim-dark",
  autoIncludeOnInstall: false,
};

const DEFAULT_INO = `// sketch.ino — main entry
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("EmbedSim ready");
}

void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}
`;

function loadJson<T>(key: string, fallback: T): T {
  try {
    if (typeof window === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "_version" in parsed && parsed._version === STORAGE_VERSION) {
      return parsed.data as T;
    }
    return fallback;
  } catch {
    return fallback;
  }
}
function saveJson<T>(key: string, data: T) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify({ _version: STORAGE_VERSION, data }));
  } catch (e) { console.error("ide save failed", e); }
}

function defaultInstalledBoards(): InstalledBoard[] {
  return BOARD_PACKAGES.filter((b) => b.installedByDefault).map((b) => ({ id: b.id, version: b.version }));
}
function defaultInstalledLibraries(): InstalledLibrary[] {
  return LIBRARY_PACKAGES.filter((l) => l.installedByDefault).map((l) => ({ id: l.id, version: l.version }));
}

function uid(p: string) {
  return `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

interface IdeState {
  loaded: boolean;
  installedBoards: InstalledBoard[];
  installedLibraries: InstalledLibrary[];
  files: SourceFile[];
  activeFileId: string | null;
  prefs: IdePreferences;

  hydrate: () => void;
  installBoard: (id: string, version: string) => void;
  removeBoard: (id: string) => void;
  installLibrary: (lib: InstalledLibrary) => void;
  removeLibrary: (id: string) => void;
  isBoardInstalled: (id: string) => boolean;
  isLibraryInstalled: (id: string) => boolean;

  // files
  setActiveFile: (id: string) => void;
  addFile: (name: string, kind: SourceFileKind, content?: string) => string;
  renameFile: (id: string, name: string) => void;
  deleteFile: (id: string) => void;
  duplicateFile: (id: string) => void;
  reorderFiles: (fromIdx: number, toIdx: number) => void;
  updateFileContent: (id: string, content: string) => void;
  importFile: (name: string, content: string) => string;

  setPrefs: (patch: Partial<IdePreferences>) => void;
}

export const useIdeStore = create<IdeState>((set, get) => ({
  loaded: false,
  installedBoards: [],
  installedLibraries: [],
  files: [],
  activeFileId: null,
  prefs: DEFAULT_PREFS,

  hydrate: () => {
    const installedBoards = loadJson<InstalledBoard[]>(KEY_BOARDS, defaultInstalledBoards());
    const installedLibraries = loadJson<InstalledLibrary[]>(KEY_LIBS, defaultInstalledLibraries());
    const persistedFiles = loadJson<SourceFile[]>(KEY_PROJECT, []);
    const prefs = { ...DEFAULT_PREFS, ...loadJson<Partial<IdePreferences>>(KEY_PREFS, {}) };
    const files = persistedFiles.length ? persistedFiles : [
      { id: uid("f"), name: "sketch.ino", kind: "ino" as const, content: DEFAULT_INO },
    ];
    set({
      loaded: true,
      installedBoards,
      installedLibraries,
      files,
      activeFileId: files[0]?.id ?? null,
      prefs,
    });
  },

  installBoard: (id, version) => {
    const next = [...get().installedBoards.filter((b) => b.id !== id), { id, version }];
    saveJson(KEY_BOARDS, next);
    set({ installedBoards: next });
  },
  removeBoard: (id) => {
    const next = get().installedBoards.filter((b) => b.id !== id);
    saveJson(KEY_BOARDS, next);
    set({ installedBoards: next });
  },
  installLibrary: (lib) => {
    const next = [...get().installedLibraries.filter((l) => l.id !== lib.id), lib];
    saveJson(KEY_LIBS, next);
    set({ installedLibraries: next });

    // Optional auto-include in active sketch
    const { prefs, files, activeFileId } = get();
    if (prefs.autoIncludeOnInstall && lib.headers?.length) {
      const fid = activeFileId;
      const file = files.find((f) => f.id === fid);
      if (file && file.kind === "ino") {
        const include = `#include <${lib.headers[0]}>\n`;
        if (!file.content.includes(include)) {
          const updated = include + file.content;
          const updatedFiles = files.map((f) => (f.id === file.id ? { ...f, content: updated } : f));
          saveJson(KEY_PROJECT, updatedFiles);
          set({ files: updatedFiles });
        }
      }
    }
  },
  removeLibrary: (id) => {
    const next = get().installedLibraries.filter((l) => l.id !== id);
    saveJson(KEY_LIBS, next);
    set({ installedLibraries: next });
  },
  isBoardInstalled: (id) => get().installedBoards.some((b) => b.id === id),
  isLibraryInstalled: (id) => get().installedLibraries.some((l) => l.id === id),

  setActiveFile: (id) => set({ activeFileId: id }),
  addFile: (name, kind, content = "") => {
    const id = uid("f");
    const next = [...get().files, { id, name, kind, content }];
    saveJson(KEY_PROJECT, next);
    set({ files: next, activeFileId: id });
    return id;
  },
  renameFile: (id, name) => {
    const next = get().files.map((f) => (f.id === id ? { ...f, name, kind: extKind(name) } : f));
    saveJson(KEY_PROJECT, next);
    set({ files: next });
  },
  deleteFile: (id) => {
    const { files, activeFileId } = get();
    if (files.length <= 1) return;
    const next = files.filter((f) => f.id !== id);
    saveJson(KEY_PROJECT, next);
    set({
      files: next,
      activeFileId: activeFileId === id ? next[0].id : activeFileId,
    });
  },
  duplicateFile: (id) => {
    const f = get().files.find((x) => x.id === id);
    if (!f) return;
    const newName = f.name.replace(/(\.[^.]+)?$/, (m) => `_copy${m}`);
    const newFile: SourceFile = { id: uid("f"), name: newName, kind: f.kind, content: f.content };
    const next = [...get().files, newFile];
    saveJson(KEY_PROJECT, next);
    set({ files: next, activeFileId: newFile.id });
  },
  reorderFiles: (fromIdx, toIdx) => {
    const arr = [...get().files];
    const [m] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, m);
    saveJson(KEY_PROJECT, arr);
    set({ files: arr });
  },
  updateFileContent: (id, content) => {
    const next = get().files.map((f) => (f.id === id ? { ...f, content } : f));
    // Avoid hammering localStorage on every keystroke — debounce via microtask batching is fine here for size.
    saveJson(KEY_PROJECT, next);
    set({ files: next });
  },
  importFile: (name, content) => {
    return get().addFile(name, extKind(name), content);
  },

  setPrefs: (patch) => {
    const next = { ...get().prefs, ...patch };
    saveJson(KEY_PREFS, next);
    set({ prefs: next });
  },
}));

function extKind(name: string): SourceFileKind {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "ino") return "ino";
  if (ext === "h" || ext === "hpp") return "h";
  if (ext === "cpp" || ext === "cc") return "cpp";
  return "c";
}
