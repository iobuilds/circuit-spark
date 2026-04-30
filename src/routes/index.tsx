import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Toaster } from "@/components/ui/sonner";
import { CodeEditor } from "@/components/sim/CodeEditor";
import { CircuitCanvas } from "@/components/sim/CircuitCanvas";
import { ComponentPalette } from "@/components/sim/ComponentPalette";
import { SerialPanel } from "@/components/sim/SerialPanel";
import { Toolbar } from "@/components/sim/Toolbar";
import { IdeMenubar } from "@/components/sim/IdeMenubar";
import { FileTabs } from "@/components/sim/FileTabs";
import { CompileOutputPanel } from "@/components/sim/CompileOutputPanel";
import { PinStateTable } from "@/components/sim/PinStateTable";
import { useSimController } from "@/sim/useSimController";
import { useSimStore } from "@/sim/store";
import { useIdeStore } from "@/sim/ideStore";
import { compileSketch, fileSliceForCompile, type CompileResult } from "@/sim/compileApi";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EmbedSim — Online Arduino IDE & MCU Simulator" },
      { name: "description", content: "Browser-based Arduino IDE and embedded systems simulator. Write code, manage libraries, simulate circuits — entirely in your browser." },
      { property: "og:title", content: "EmbedSim — Online Arduino IDE & MCU Simulator" },
      { property: "og:description", content: "Cloud Arduino IDE with multi-file projects, board manager, library manager, serial plotter, and a live circuit simulator." },
    ],
  }),
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

  const ideHydrate = useIdeStore((s) => s.hydrate);
  const ideLoaded = useIdeStore((s) => s.loaded);

  const [pausedFlag, setPausedFlag] = useState(false);
  const [compileOutput, setCompileOutput] = useState<CompileResult | null>(null);
  const [compiling, setCompiling] = useState(false);
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

  async function handleBackendCompile() {
    const { files } = useIdeStore.getState();
    const installedLibraries = useIdeStore.getState().installedLibraries.map((l) => l.id);
    setCompiling(true);
    const result = await compileSketch({
      board: boardId,
      files: fileSliceForCompile(files),
      libraries: installedLibraries,
    });
    setCompileOutput(result);
    setCompiling(false);
    if (result.success) toast.success(result.mock ? "Compile OK (mock)" : "Compile OK");
    else toast.error(`Compilation failed: ${result.errors[0]?.message ?? "see output"}`);
  }

  function handleUpload() {
    // "Upload" in this browser context = compile + start the in-browser sim
    handleBackendCompile().then(() => {
      ctrl.start(useSimStore.getState().code, useSimStore.getState().speed);
    });
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
        ctrl.start(useSimStore.getState().code, useSimStore.getState().speed);
      }
      if (meta && e.key === ".") {
        e.preventDefault();
        ctrl.stop();
      }
      if (meta && e.key.toLowerCase() === "r") {
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
        onStart={() => ctrl.start(useSimStore.getState().code, speed)}
        onPause={() => { ctrl.pause(); setPausedFlag(true); }}
        onResume={() => { ctrl.resume(); setPausedFlag(false); }}
        onStop={() => { ctrl.stop(); setPausedFlag(false); }}
      />
      <IdeMenubar onCompile={handleBackendCompile} onUpload={handleUpload} />

      <div className="flex-1 min-h-0">
        <PanelGroup orientation="horizontal">
          <Panel defaultSize={16} minSize={12} maxSize={24}>
            <ComponentPalette />
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors" />

          <Panel defaultSize={40} minSize={24}>
            <PanelGroup orientation="vertical">
              <Panel defaultSize={62} minSize={20}>
                <div className="h-full flex flex-col bg-card">
                  <FileTabs />
                  <div className="flex-1 min-h-0">
                    <CodeEditor />
                  </div>
                  {compileOutput && (
                    <CompileOutputPanel output={compileOutput} onClose={() => setCompileOutput(null)} />
                  )}
                </div>
              </Panel>
              <PanelResizeHandle className="h-1 bg-border hover:bg-primary/40 transition-colors" />
              <Panel defaultSize={38} minSize={15}>
                <SerialPanel onSerialIn={(t) => ctrl.serialIn(t)} />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors" />

          <Panel defaultSize={44} minSize={25}>
            <PanelGroup orientation="vertical">
              <Panel defaultSize={75} minSize={30}>
                <CircuitCanvas onPinInputChange={pushPinInput} />
              </Panel>
              <PanelResizeHandle className="h-1 bg-border hover:bg-primary/40 transition-colors" />
              <Panel defaultSize={25} minSize={10}>
                <PinStateTable />
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
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
