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
import { Button } from "@/components/ui/button";
import { Code2, PanelRightClose, PanelRightOpen, LogOut } from "lucide-react";
import { useSimController } from "@/sim/useSimController";
import { useSimStore } from "@/sim/store";
import { useIdeStore } from "@/sim/ideStore";
import { compileSketch, fileSliceForCompile, type CompileResult, type CompileProgress } from "@/sim/compileApi";
import { toast } from "sonner";
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
  const serialLen = useSimStore((s) => s.serial.length);
  const pinStateCount = useSimStore((s) => Object.keys(s.pinStates).length);

  // Show the Pin States + Serial panels only once the simulation actually
  // has something to show — running/paused, errored, or any captured output.
  const showSimPanels =
    status === "running" || status === "paused" || status === "error"
    || serialLen > 0 || pinStateCount > 0;

  const ideHydrate = useIdeStore((s) => s.hydrate);
  const ideLoaded = useIdeStore((s) => s.loaded);

  const [pausedFlag, setPausedFlag] = useState(false);
  const [compileOutput, setCompileOutput] = useState<CompileResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState<CompileProgress | null>(null);
  const [showEditor, setShowEditor] = useState(true);
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

  async function handleBackendCompile(): Promise<boolean> {
    const { files } = useIdeStore.getState();
    const installedLibraries = useIdeStore.getState().installedLibraries.map((l) => l.id);
    setCompiling(true);
    setCompileProgress({ step: "Queued", percent: 0, message: "Submitting job..." });
    setCompileOutput(null);
    const result = await compileSketch(
      {
        board: boardId,
        files: fileSliceForCompile(files),
        libraries: installedLibraries,
      },
      (p) => setCompileProgress(p),
    );
    setCompileOutput(result);
    setCompiling(false);
    setCompileProgress(null);
    if (result.success) {
      toast.success(
        `Compile OK · Flash ${result.flashPercent?.toFixed(1) ?? "?"}% · RAM ${result.ramPercent?.toFixed(1) ?? "?"}%`,
      );
      return true;
    }
    toast.error(`Compilation failed: ${result.errors[0]?.message ?? "see output"}`);
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
  async function compileThenStart() {
    const ok = await handleBackendCompile();
    if (!ok) return;
    ctrl.start(useSimStore.getState().code, useSimStore.getState().speed);
  }

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
          {showSimPanels && (
            <>
              <div className="h-44 shrink-0 border-t border-border">
                <PinStateTable />
              </div>
              <div className="h-56 shrink-0 border-t border-border">
                <SerialPanel onSerialIn={(t) => ctrl.serialIn(t)} />
              </div>
            </>
          )}
        </section>

        {/* Right: Code editor (toggleable) */}
        {showEditor && (
          <section className="w-[42%] min-w-[360px] max-w-[720px] flex flex-col bg-card">
            <div className="flex items-center justify-between border-b border-border bg-muted/30">
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
            <div className="flex-1 min-h-0">
              <CodeEditor />
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
