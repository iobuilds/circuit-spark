import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { CodeEditor } from "@/components/sim/CodeEditor";
import { CircuitCanvas } from "@/components/sim/CircuitCanvas";
import { SerialPanel } from "@/components/sim/SerialPanel";
import { Toolbar } from "@/components/sim/Toolbar";
import { IdeMenubar } from "@/components/sim/IdeMenubar";
import { FileTabs } from "@/components/sim/FileTabs";
import { CompileOutputPanel } from "@/components/sim/CompileOutputPanel";
import { PinStateTable } from "@/components/sim/PinStateTable";
import { BoardSimTabs } from "@/components/sim/BoardSimTabs";
import { Button } from "@/components/ui/button";
import { Code2, FileText, FolderTree, PanelRightClose, PanelRightOpen, LogOut, PanelBottomClose, PanelBottomOpen, Trash2 } from "lucide-react";
import { useSimController } from "@/sim/useSimController";
import { useSimStore } from "@/sim/store";
import { useIdeStore, type SourceFile } from "@/sim/ideStore";
import { compileSketch, type CompileResult, type CompileProgress } from "@/sim/compileApi";
import { resolveRequiredLibraries } from "@/sim/autoInstallLibs";
import { LIBRARY_PACKAGES } from "@/sim/ideCatalog";
import { installLibrary } from "@/services/compilerService";
import { toast } from "sonner";

// Map a missing-header filename like "U8g2lib.h" to the Arduino Library
// Manager package name. Falls back to a few well-known aliases for libraries
// that might not yet be in our catalog snapshot.
const HEADER_ALIASES: Record<string, string> = {
  "u8g2lib.h": "U8g2",
  "u8x8lib.h": "U8g2",
  "adafruit_ssd1306.h": "Adafruit SSD1306",
  "adafruit_gfx.h": "Adafruit GFX Library",
  "adafruit_sensor.h": "Adafruit Unified Sensor",
  "adafruit_busio_register.h": "Adafruit BusIO",
  "adafruit_i2cdevice.h": "Adafruit BusIO",
  "adafruit_spidevice.h": "Adafruit BusIO",
  "adafruit_sh110x.h": "Adafruit SH110X",
  "adafruit_sh1106.h": "Adafruit SH110X",
  "ssd1306ascii.h": "SSD1306Ascii",
  "ssd1306asciiwire.h": "SSD1306Ascii",
  "ssd1306asciispi.h": "SSD1306Ascii",
};

function packageForHeader(header: string): string | null {
  const direct = LIBRARY_PACKAGES.find((p) => p.headers?.some((h) => h.toLowerCase() === header.toLowerCase()));
  if (direct) return direct.name;
  return HEADER_ALIASES[header.toLowerCase()] ?? null;
}

function missingHeadersFromResult(result: CompileResult): string[] {
  const text = `${result.stderr ?? ""}\n${(result.errors ?? []).map((e) => e.message).join("\n")}`;
  const out = new Set<string>();
  const re = /([A-Za-z0-9_./-]+\.h):\s*No such file or directory/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.add(m[1].split("/").pop() ?? m[1]);
  return [...out];
}
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EmbedSim — Online Arduino IDE & MCU Simulator" },
      { name: "description", content: "Browser-based Arduino IDE and embedded systems simulator. Write code, manage libraries, simulate circuits — entirely in your browser." },
      { property: "og:title", content: "EmbedSim — Online Arduino IDE & MCU Simulator" },
      { property: "og:description", content: "Cloud Arduino IDE with multi-file projects, board manager, library manager, serial plotter, and a live circuit simulator." },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) throw redirect({ to: "/auth" });
    const confirmed = (user as { email_confirmed_at?: string; confirmed_at?: string }).email_confirmed_at
      || (user as { email_confirmed_at?: string; confirmed_at?: string }).confirmed_at;
    if (user.email && !confirmed) {
      throw redirect({ to: "/auth" });
    }
  },
  component: SimulatorPage,
});

function SimulatorPage() {
  const ctrl = useSimController();
  const speed = useSimStore((s) => s.speed);
  const status = useSimStore((s) => s.status);
  const simTime = useSimStore((s) => s.simTimeMs);
  const components = useSimStore((s) => s.components);
  const wires = useSimStore((s) => s.wires);
  const loadProject = useSimStore((s) => s.loadProject);
  const boardId = useSimStore((s) => s.boardId);
  const serialLen = useSimStore((s) =>
    s.serial.length + Object.values(s.serialByBoard).reduce((a, v) => a + v.length, 0));
  const pinStateCount = useSimStore((s) =>
    Object.keys(s.pinStates).length
    + Object.values(s.pinStatesByBoard).reduce((a, v) => a + Object.keys(v).length, 0));
  const anyRunning = useSimStore((s) =>
    s.status === "running" || Object.values(s.statusByBoard).includes("running"));

  // Show the Pin States + Serial panels only once the simulation actually
  // has something to show — running/paused, errored, or any captured output.
  const showSimPanels =
    anyRunning || status === "paused" || status === "error"
    || serialLen > 0 || pinStateCount > 0;

  const ideHydrate = useIdeStore((s) => s.hydrate);
  const ideLoaded = useIdeStore((s) => s.loaded);

  const [pausedFlag, setPausedFlag] = useState(false);
  const [compileOutput, setCompileOutput] = useState<CompileResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState<CompileProgress | null>(null);
  const [showEditor, setShowEditor] = useState(true);
  const [showExplorer, setShowExplorer] = useState(true);
  const [showBottomPanels, setShowBottomPanels] = useState(true);
  const inputCacheRef = useRef<Record<number, { d?: 0 | 1; a?: number }>>({});

  useEffect(() => { if (!ideLoaded) ideHydrate(); }, [ideLoaded, ideHydrate]);

  // Load shared project from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("p");
    if (p) {
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob(p))));
        loadProject(data);
        toast.success("Loaded shared project");
      } catch {
        toast.error("Invalid share link");
      }
    }
  }, [loadProject]);

  useEffect(() => { ctrl.setSpeed(speed); }, [speed, ctrl]);

  // Push compile diagnostics to the Monaco editor as inline markers (red
  // squiggles for errors, yellow for warnings). Cleared when output is null.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("ide:set-diagnostics", {
      detail: {
        errors: compileOutput?.errors ?? [],
        warnings: compileOutput?.warnings ?? [],
      },
    }));
  }, [compileOutput]);

  /**
   * Compile sketches.
   * @param onlyBoardCompIds Optional list of board component IDs. When provided,
   * only those boards' sketches are compiled. Otherwise, all placed boards.
   */
  async function handleBackendCompile(onlyBoardCompIds?: string[]): Promise<boolean> {
    const { files, activeFileId } = useIdeStore.getState();
    // (Required libraries are auto-detected per-sketch from #include lines below.)
    let boards = useSimStore.getState().components.filter((c) => c.kind === "board");
    if (onlyBoardCompIds && onlyBoardCompIds.length > 0) {
      const set = new Set(onlyBoardCompIds);
      boards = boards.filter((b) => set.has(b.id));
    }
    const supportFiles = files.filter((f) => f.kind !== "ino").map((f) => ({ name: f.name, content: f.content }));
    const sketches: { boardId: string; fileId: string; displayName: string; files: { name: string; content: string }[] }[] = [];
    for (const b of boards) {
      const fid = String(b.props.sketchFileId ?? "");
      const f = files.find((ff) => ff.id === fid && ff.kind === "ino");
      if (f) sketches.push({
        boardId: String(b.props.boardId ?? boardId),
        fileId: f.id,
        // Keep the IDE-side filename (e.g. sketch_uno_2.ino) for display in
        // toasts/progress so the user can tell WHICH board's sketch is being
        // compiled. Arduino CLI requires the main file to match its folder, so
        // we rename to "sketch.ino" only on the wire.
        displayName: f.name,
        files: [{ name: "sketch.ino", content: f.content }, ...supportFiles],
      });
    }
    if (sketches.length === 0 && !onlyBoardCompIds) {
      const slice = fileSliceForActiveSketch(files, activeFileId);
      if (slice.length > 0) sketches.push({ boardId, fileId: slice[0].name, displayName: slice[0].name, files: slice });
    }
    if (sketches.length === 0) {
      toast.error("No sketches to compile");
      return false;
    }
    setCompiling(true);
    setCompileOutput(null);
    let allOk = true;
    let lastResult: CompileResult | null = null;
    for (let i = 0; i < sketches.length; i++) {
      const s = sketches[i];
      // Auto-detect libraries required by this sketch's #include lines and
      // make sure they're installed (and shipped to the backend so it can
      // resolve them). New libs get added to the user's IDE library list.
      const resolved = resolveRequiredLibraries(s.files);
      const stepLabel0 = `Board ${i + 1}/${sketches.length} · ${s.displayName}`;
      if (resolved.added.length > 0) {
        const names = resolved.added.map((a) => a.name).join(", ");
        toast.info(
          `Installing ${resolved.added.length} required ${resolved.added.length === 1 ? "library" : "libraries"}: ${names}`,
        );
        setCompileProgress({ step: stepLabel0, percent: 0, message: `Auto-installing libraries: ${names}` });
        await new Promise((r) => setTimeout(r, 30));
      }
      setCompileProgress({ step: stepLabel0, percent: 0, message: `Compiling ${s.displayName}...` });
      let result = await compileSketch(
        { board: s.boardId, files: s.files, libraries: resolved.libraryIds },
        (p) => setCompileProgress({ ...p, step: stepLabel0, message: `[${s.displayName}] ${p.message ?? ""}` }),
      );

      // Self-heal: if compile failed because a header file wasn't found, ask
      // the backend to install the matching Library Manager package(s) and
      // retry once. Covers cases where the backend cache thinks a library is
      // installed but it isn't, or the user typed an #include for a library
      // we know about but couldn't auto-resolve from the catalog.
      if (!result.success) {
        const missing = missingHeadersFromResult(result);
        const stepLabel = `Board ${i + 1}/${sketches.length} · ${s.displayName}`;
        const tick = () => new Promise((r) => setTimeout(r, 30));
        if (missing.length > 0) {
          setCompileProgress({ step: stepLabel, percent: 70, message: `Missing headers detected: ${missing.join(", ")}` });
          await tick();
        }
        const packages = [...new Set(missing.map(packageForHeader).filter((p): p is string => !!p))];
        if (packages.length > 0) {
          toast.info(`Installing missing ${packages.length === 1 ? "library" : "libraries"}: ${packages.join(", ")}`);
          setCompileProgress({ step: stepLabel, percent: 75, message: `Auto-installing libraries: ${packages.join(", ")}` });
          await tick();
          try {
            await Promise.all(packages.map((p) => installLibrary(p)));
            setCompileProgress({ step: stepLabel, percent: 80, message: `Installed: ${packages.join(", ")} ✓` });
            await tick();
            setCompileProgress({ step: stepLabel, percent: 85, message: `Retrying compile for ${s.displayName}...` });
            await tick();
            result = await compileSketch(
              { board: s.boardId, files: s.files, libraries: [...resolved.libraryIds, ...packages] },
              (p) => setCompileProgress({ ...p, step: stepLabel, message: `[${s.displayName}] ${p.message ?? ""}` }),
            );
          } catch (e) {
            console.warn("auto library install failed:", e);
            setCompileProgress({ step: stepLabel, percent: 100, message: `Library install failed: ${(e as Error).message} ✗` });
          }
        }
      }

      lastResult = result;
      if (!result.success) {
        allOk = false;
        setCompileOutput(result);
        // If the failure was caused by missing headers, surface a toast with
        // an action that opens the Install Libraries dialog pre-filled.
        const stillMissing = missingHeadersFromResult(result);
        const stillPackages = [...new Set(stillMissing.map(packageForHeader).filter((p): p is string => !!p))];
        if (stillPackages.length > 0) {
          toast.error(`${s.displayName}: missing ${stillPackages.join(", ")}`, {
            action: {
              label: "Install",
              onClick: () =>
                window.dispatchEvent(new CustomEvent("ide:install-libraries", { detail: { names: stillPackages } })),
            },
          });
        } else {
          toast.error(`${s.displayName}: ${result.errors[0]?.message ?? "compile failed"}`);
        }
        break;
      }
    }
    if (allOk && lastResult) {
      setCompileOutput(lastResult);
      // Parse the .hex from the last successful compile and stash flash bytes
      // per board so the chip inspector can show real program contents.
      try {
        if (lastResult.binary) {
          const { parseIntelHex } = await import("@/sim/intelHex");
          const parsed = parseIntelHex(lastResult.binary);
          const targetIds = onlyBoardCompIds && onlyBoardCompIds.length
            ? onlyBoardCompIds
            : useSimStore.getState().components.filter((c) => c.kind === "board").map((c) => c.id);
          const setFlash = useSimStore.getState().setBoardFlash;
          targetIds.forEach((id) => setFlash(id, parsed.data));
        }
      } catch (e) {
        console.warn("HEX parse failed:", e);
      }
    }
    setCompiling(false);
    setCompileProgress(null);
    if (allOk && lastResult) {
      toast.success(
        `Compiled ${sketches.length} sketch${sketches.length === 1 ? "" : "es"} · Flash ${lastResult.flashPercent?.toFixed(1) ?? "?"}% · RAM ${lastResult.ramPercent?.toFixed(1) ?? "?"}%`,
      );
      return true;
    }
    return false;
  }

  function jumpToError(file: string, line: number, col?: number) {
    const { files, setActiveFile } = useIdeStore.getState();
    const match = files.find((f) => f.name === file);
    if (match) {
      setActiveFile(match.id);
      // Monaco listens to a custom event for line jumps
      window.dispatchEvent(new CustomEvent("ide:goto-line", { detail: { line, col } }));
    }
  }

  // Simulation REQUIRES a successful compile first. If the compile fails, the
  // errors stay visible in the CompileOutputPanel + a toast, and the sim does
  // not start.
  async function compileThenStart(onlyBoardCompIds?: string[]) {
    const ok = await handleBackendCompile(onlyBoardCompIds);
    if (!ok) return;
    // Start each board with its own sketch, in its own worker.
    const { components, speed: simSpeed } = useSimStore.getState();
    const { files } = useIdeStore.getState();
    let boards = components.filter((c) => c.kind === "board");
    if (onlyBoardCompIds && onlyBoardCompIds.length > 0) {
      const set = new Set(onlyBoardCompIds);
      boards = boards.filter((b) => set.has(b.id));
    }
    if (boards.length === 0) {
      // No board on canvas — fall back to running the active sketch on a default worker.
      ctrl.start(useSimStore.getState().code, simSpeed);
      return;
    }
    // Focus the first started board so the bottom panels show its serial output.
    useSimStore.getState().setActiveSimBoard(boards[0].id);
    for (const b of boards) {
      const fid = String(b.props.sketchFileId ?? "");
      const f = files.find((ff) => ff.id === fid && ff.kind === "ino");
      const sketch = f?.content ?? useSimStore.getState().code;
      ctrl.start(sketch, simSpeed, b.id);
    }
  }

  // Expose per-board compile/run to the canvas via window so we don't have to
  // thread the handlers through every nested component.
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__embedsimCompileBoards = (ids: string[]) => handleBackendCompile(ids);
    (window as unknown as Record<string, unknown>).__embedsimRunBoards = (ids: string[]) => compileThenStart(ids);
    // Cross-board GPIO propagation: another board's OUTPUT pin drives this
    // board's INPUT via a shared net. Routed per-board so reads are isolated.
    (window as unknown as Record<string, unknown>).__embedsimPropagateBoardGPIO = (target: {
      boardCompId: string; pin: number; digital?: 0 | 1; analog?: number;
    }) => {
      ctrl.setInput(target.pin, { digital: target.digital, analog: target.analog }, target.boardCompId);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__embedsimCompileBoards;
      delete (window as unknown as Record<string, unknown>).__embedsimRunBoards;
      delete (window as unknown as Record<string, unknown>).__embedsimPropagateBoardGPIO;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleUpload() {
    // "Upload" in this browser context = compile + start the in-browser sim
    void compileThenStart();
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const data = { code: useSimStore.getState().code, components, wires, boardId };
        localStorage.setItem("embedsim:project", JSON.stringify(data));
        toast.success("Project saved");
      }
      if (meta && e.key === "Enter") {
        e.preventDefault();
        void compileThenStart();
      }
      if (meta && e.key === ".") {
        e.preventDefault();
        ctrl.stop();
      }
      if (meta && !e.shiftKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        handleBackendCompile();
      }
      if (meta && e.key.toLowerCase() === "u") {
        e.preventDefault();
        handleUpload();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, wires, ctrl, boardId]);

  function pushPinInput(pin: number, value: { digital?: 0 | 1; analog?: number }) {
    const cur = inputCacheRef.current[pin] ?? {};
    if (cur.d === value.digital && cur.a === value.analog) return;
    inputCacheRef.current[pin] = { d: value.digital, a: value.analog };
    ctrl.setInput(pin, value);
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <Toolbar
        onCompile={handleBackendCompile}
        onStart={() => void compileThenStart()}
        onPause={() => { ctrl.pause(); setPausedFlag(true); }}
        onResume={() => { ctrl.resume(); setPausedFlag(false); }}
        onStop={() => { ctrl.stop(); setPausedFlag(false); }}
      />
      <div className="flex items-center">
        <div className="flex-1"><IdeMenubar onCompile={handleBackendCompile} onUpload={handleUpload} /></div>
        <Link to="/admin" className="text-xs px-3 py-1 mr-2 text-muted-foreground hover:text-foreground border border-border rounded">
          ✨ AI Builder
        </Link>
        <Button
          size="sm" variant="ghost" className="h-7 mr-2 text-xs"
          onClick={async () => { await supabase.auth.signOut(); window.location.href = "/auth"; }}
          title="Sign out"
        >
          <LogOut className="h-3.5 w-3.5 mr-1" />Sign out
        </Button>
      </div>

      <div className="flex-1 min-h-0 flex w-full overflow-hidden">
        {/* Components palette removed — use the floating "+" button on the canvas to add boards/components. */}

        {/* Middle: Builder workspace (canvas + pin states + serial) */}
        <section className="flex-1 min-w-0 flex flex-col border-r border-border relative">
          <div className="flex-1 min-h-0 relative">
            <CircuitCanvas onPinInputChange={pushPinInput} />
            {!showEditor && (
              <Button
                size="sm"
                variant="outline"
                className="absolute top-3 right-3 h-8 shadow-md"
                onClick={() => setShowEditor(true)}
                title="Show code editor"
              >
                <PanelRightOpen className="h-3.5 w-3.5 mr-1.5" />
                <Code2 className="h-3.5 w-3.5 mr-1" /> Code
              </Button>
            )}
          </div>
          {showSimPanels && showBottomPanels && (
            <>
              <BoardSimTabs />
              <div className="h-44 shrink-0 border-t border-border relative">
                <PinStateTable />
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-1 right-1 h-6 w-6 p-0"
                  onClick={() => setShowBottomPanels(false)}
                  title="Hide pin & serial panels"
                >
                  <PanelBottomClose className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="h-56 shrink-0 border-t border-border">
                <SerialPanel onSerialIn={(t) => ctrl.serialIn(t)} />
              </div>
            </>
          )}
          {showSimPanels && !showBottomPanels && (
            <Button
              size="sm"
              variant="outline"
              className="absolute bottom-3 left-3 h-8 shadow-md"
              onClick={() => setShowBottomPanels(true)}
              title="Show pin & serial panels"
            >
              <PanelBottomOpen className="h-3.5 w-3.5 mr-1.5" />
              Panels
            </Button>
          )}
        </section>

        {/* Right: Code editor (toggleable) */}
        {showEditor && (
          <section className="w-[42%] min-w-[360px] max-w-[720px] flex flex-col bg-card">
            <div className="flex items-center justify-between border-b border-border bg-muted/30">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => setShowExplorer((v) => !v)}
                title={showExplorer ? "Hide project file explorer" : "Show project file explorer"}
              >
                <FolderTree className="h-4 w-4" />
              </Button>
              <div className="flex-1 min-w-0">
                <FileTabs />
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0"
                onClick={() => setShowEditor(false)}
                title="Hide code editor"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 min-h-0 flex">
              {showExplorer && <ProjectFileExplorer />}
              <div className="flex-1 min-w-0">
                <CodeEditor />
              </div>
            </div>
            {(compileOutput || compiling) && (
              <CompileOutputPanel
                output={compileOutput}
                progress={compileProgress}
                compiling={compiling}
                onClose={() => { setCompileOutput(null); setCompileProgress(null); }}
                onErrorClick={(file, line, col) => jumpToError(file, line, col)}
              />
            )}
          </section>
        )}
      </div>

      <div className="flex items-center gap-4 px-3 py-1 text-[11px] font-mono border-t border-border bg-card text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${
            status === "running" ? "bg-success animate-pulse"
            : status === "error" ? "bg-destructive"
            : pausedFlag ? "bg-warning" : "bg-muted-foreground"
          }`} />
          {status}{pausedFlag ? " (paused)" : ""}{compiling ? " · compiling..." : ""}
        </span>
        <span>sim time: <span className="text-foreground">{(simTime / 1000).toFixed(2)}s</span></span>
        <span>speed: <span className="text-foreground">{speed}x</span></span>
        <span>components: <span className="text-foreground">{components.length}</span></span>
        <span>wires: <span className="text-foreground">{wires.length}</span></span>
        <div className="flex-1" />
        <span>⌘R: Compile · ⌘U: Upload · ⌘Enter: Run · ⌘. : Stop · ⌘S: Save</span>
      </div>

      <Toaster />
    </div>
  );
}

function ProjectFileExplorer() {
  const files = useIdeStore((s) => s.files);
  const activeFileId = useIdeStore((s) => s.activeFileId);
  const setActiveFile = useIdeStore((s) => s.setActiveFile);
  const deleteFile = useIdeStore((s) => s.deleteFile);

  return (
    <aside className="w-44 shrink-0 border-r border-border bg-muted/20 overflow-y-auto">
      <div className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
        Project files
      </div>
      <div className="py-1">
        {files.map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFile(f.id)}
            className={`group w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors ${
              f.id === activeFileId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            }`}
            title={f.name}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-mono">{f.name}</span>
            <Trash2
              className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-70 hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }}
            />
          </button>
        ))}
        {files.length === 0 && (
          <div className="px-2 py-4 text-xs text-muted-foreground">Add a board to create a sketch file.</div>
        )}
      </div>
    </aside>
  );
}

function fileSliceForActiveSketch(files: SourceFile[], activeFileId: string | null) {
  const active = files.find((f) => f.id === activeFileId && f.kind === "ino") ?? files.find((f) => f.kind === "ino");
  const support = files.filter((f) => f.kind !== "ino");
  return active ? [{ name: active.name, content: active.content }, ...support.map((f) => ({ name: f.name, content: f.content }))] : [];
}
