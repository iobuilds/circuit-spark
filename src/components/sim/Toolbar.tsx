import { useSimStore } from "@/sim/store";
import { BOARDS } from "@/sim/types";
import { Button } from "@/components/ui/button";
import { Play, Square, Pause, RotateCcw, Save, Share2, Sparkles, Cpu, Sun, Moon, FileCode } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { TEMPLATES } from "@/sim/templates";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";

interface Props {
  onCompile: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}

export function Toolbar({ onCompile, onStart, onPause, onResume, onStop }: Props) {
  const status = useSimStore((s) => s.status);
  const speed = useSimStore((s) => s.speed);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const boardId = useSimStore((s) => s.boardId);
  const setBoard = useSimStore((s) => s.setBoard);
  const theme = useSimStore((s) => s.theme);
  const toggleTheme = useSimStore((s) => s.toggleTheme);
  const loadProject = useSimStore((s) => s.loadProject);
  const code = useSimStore((s) => s.code);
  const components = useSimStore((s) => s.components);
  const wires = useSimStore((s) => s.wires);
  const reset = useSimStore((s) => s.resetWorkspace);

  function saveProject() {
    const data = { code, components, wires, boardId };
    localStorage.setItem("embedsim:project", JSON.stringify(data));
    toast.success("Project saved locally");
  }
  function loadSaved() {
    const raw = localStorage.getItem("embedsim:project");
    if (!raw) { toast.error("No saved project"); return; }
    loadProject(JSON.parse(raw));
    toast.success("Project loaded");
  }
  function exportJson() {
    const data = { code, components, wires, boardId };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "embedsim-project.json"; a.click();
    URL.revokeObjectURL(url);
  }
  function shareLink() {
    const data = { code, components, wires, boardId };
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
    const url = `${window.location.origin}/?p=${enc}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied to clipboard");
  }

  const isRunning = status === "running";
  const isPaused = status === "paused";

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card">
      <div className="flex items-center gap-2 mr-2">
        <Cpu className="h-5 w-5 text-primary" />
        <span className="font-mono font-semibold tracking-tight">EmbedSim</span>
      </div>

      <Select value={boardId} onValueChange={(v) => setBoard(v as never)}>
        <SelectTrigger className="w-48 h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BOARDS.map((b) => (
            <SelectItem key={b.id} value={b.id} disabled={!b.available}>
              {b.name} {!b.available && "(soon)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="h-6 w-px bg-border mx-1" />

      <Button size="sm" variant="outline" onClick={onCompile} className="h-8">
        <FileCode className="h-3.5 w-3.5 mr-1.5" /> Compile
      </Button>

      {!isRunning && !isPaused && (
        <Button size="sm" onClick={onStart} className="h-8 bg-primary text-primary-foreground hover:bg-primary/90">
          <Play className="h-3.5 w-3.5 mr-1.5" /> Run
        </Button>
      )}
      {isRunning && (
        <>
          <Button size="sm" variant="outline" onClick={onPause} className="h-8">
            <Pause className="h-3.5 w-3.5 mr-1.5" /> Pause
          </Button>
          <Button size="sm" variant="destructive" onClick={onStop} className="h-8">
            <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
          </Button>
        </>
      )}
      {isPaused && (
        <>
          <Button size="sm" onClick={onResume} className="h-8">
            <Play className="h-3.5 w-3.5 mr-1.5" /> Resume
          </Button>
          <Button size="sm" variant="destructive" onClick={onStop} className="h-8">
            <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
          </Button>
        </>
      )}

      <div className="flex items-center gap-1 text-xs ml-1">
        <span className="text-muted-foreground">Speed</span>
        <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
          <SelectTrigger className="w-16 h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[0.5, 1, 2, 5, 10].map((s) => (
              <SelectItem key={s} value={String(s)}>{s}x</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Examples
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Templates</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {TEMPLATES.map((t) => (
            <DropdownMenuItem key={t.id} onClick={() => { loadProject(t); toast.success(`Loaded "${t.name}"`); }}>
              <div>
                <div className="text-sm">{t.name}</div>
                <div className="text-[10px] text-muted-foreground">{t.description}</div>
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/examples">Browse all examples →</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" variant="outline" className="h-8" onClick={saveProject}>
        <Save className="h-3.5 w-3.5 mr-1.5" /> Save
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={loadSaved}>Load</Button>
      <Button size="sm" variant="outline" className="h-8" onClick={exportJson}>Export</Button>
      <Button size="sm" variant="outline" className="h-8" onClick={shareLink}>
        <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share
      </Button>
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { reset(); onStop(); }} title="Reset">
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={toggleTheme} title="Toggle theme">
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      <div className="h-6 w-px bg-border mx-1" />
      <nav className="flex items-center gap-3 text-xs">
        <Link to="/" className="hover:text-primary" activeProps={{ className: "text-primary font-semibold" }} activeOptions={{ exact: true }}>Sim</Link>
        <Link to="/examples" className="hover:text-primary" activeProps={{ className: "text-primary font-semibold" }}>Examples</Link>
        <Link to="/docs" className="hover:text-primary" activeProps={{ className: "text-primary font-semibold" }}>Docs</Link>
        <Link to="/about" className="hover:text-primary" activeProps={{ className: "text-primary font-semibold" }}>About</Link>
      </nav>
    </div>
  );
}
