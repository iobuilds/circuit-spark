import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from "react-resizable-panels";
import { Toaster } from "@/components/ui/sonner";
import { CodeEditor } from "@/components/sim/CodeEditor";
import { CircuitCanvas } from "@/components/sim/CircuitCanvas";
import { ComponentPalette } from "@/components/sim/ComponentPalette";
import { SerialMonitor } from "@/components/sim/SerialMonitor";
import { Toolbar } from "@/components/sim/Toolbar";
import { PinStateTable } from "@/components/sim/PinStateTable";
import { useSimController } from "@/sim/useSimController";
import { useSimStore } from "@/sim/store";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "EmbedSim — Online Arduino & MCU Simulator" },
      { name: "description", content: "Browser-based embedded systems simulator. Write Arduino code, build circuits, and simulate them in real time." },
      { property: "og:title", content: "EmbedSim — Online Arduino & MCU Simulator" },
      { property: "og:description", content: "Browser-based embedded systems simulator with live circuit canvas and serial monitor." },
    ],
  }),
  component: SimulatorPage,
});

function SimulatorPage() {
  const ctrl = useSimController();
  const code = useSimStore((s) => s.code);
  const speed = useSimStore((s) => s.speed);
  const status = useSimStore((s) => s.status);
  const simTime = useSimStore((s) => s.simTimeMs);
  const components = useSimStore((s) => s.components);
  const wires = useSimStore((s) => s.wires);
  const loadProject = useSimStore((s) => s.loadProject);

  const [pausedFlag, setPausedFlag] = useState(false);
  const inputCacheRef = useRef<Record<number, { d?: 0 | 1; a?: number }>>({});

  // Load shared project from URL hash on mount
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

  // Push speed changes
  useEffect(() => { ctrl.setSpeed(speed); }, [speed, ctrl]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        const data = { code, components, wires, boardId: useSimStore.getState().boardId };
        localStorage.setItem("embedsim:project", JSON.stringify(data));
        toast.success("Project saved");
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        ctrl.start(useSimStore.getState().code, useSimStore.getState().speed);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ".") {
        e.preventDefault();
        ctrl.stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [code, components, wires, ctrl]);

  function pushPinInput(pin: number, value: { digital?: 0 | 1; analog?: number }) {
    const cur = inputCacheRef.current[pin] ?? {};
    if (cur.d === value.digital && cur.a === value.analog) return;
    inputCacheRef.current[pin] = { d: value.digital, a: value.analog };
    ctrl.setInput(pin, value);
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <Toolbar
        onCompile={() => ctrl.compile(code)}
        onStart={() => ctrl.start(code, speed)}
        onPause={() => { ctrl.pause(); setPausedFlag(true); }}
        onResume={() => { ctrl.resume(); setPausedFlag(false); }}
        onStop={() => { ctrl.stop(); setPausedFlag(false); }}
      />

      <div className="flex-1 min-h-0">
        <PanelGroup orientation="horizontal">
          <Panel defaultSize={16} minSize={12} maxSize={24}>
            <ComponentPalette />
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors" />

          <Panel defaultSize={38} minSize={24}>
            <PanelGroup orientation="vertical">
              <Panel defaultSize={62} minSize={20}>
                <div className="h-full bg-card">
                  <CodeEditor />
                </div>
              </Panel>
              <PanelResizeHandle className="h-1 bg-border hover:bg-primary/40 transition-colors" />
              <Panel defaultSize={38} minSize={15}>
                <SerialMonitor onSerialIn={(t) => ctrl.serialIn(t)} />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1 bg-border hover:bg-primary/40 transition-colors" />

          <Panel defaultSize={46} minSize={25}>
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
          {status}{pausedFlag ? " (paused)" : ""}
        </span>
        <span>sim time: <span className="text-foreground">{(simTime / 1000).toFixed(2)}s</span></span>
        <span>speed: <span className="text-foreground">{speed}x</span></span>
        <span>components: <span className="text-foreground">{components.length}</span></span>
        <span>wires: <span className="text-foreground">{wires.length}</span></span>
        <div className="flex-1" />
        <span>Ctrl+Enter: Run · Ctrl+. : Stop · Ctrl+S: Save</span>
      </div>

      <Toaster />
    </div>
  );
}
