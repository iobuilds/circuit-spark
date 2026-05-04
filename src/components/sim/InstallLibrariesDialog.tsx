import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  installLibrariesStream,
  repairLibraryIndexes,
  type InstallProgressEvent,
} from "@/services/compilerService";
import { CheckCircle2, XCircle, Loader2, Wrench, Download, Package } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional pre-filled list (e.g. when triggered by a failed compile). */
  initialNames?: string[];
}

interface LogLine {
  ts: number;
  kind: "info" | "ok" | "err";
  text: string;
}

export function InstallLibrariesDialog({ open, onOpenChange, initialNames }: Props) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<LogLine[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open && initialNames && initialNames.length > 0) {
      setText(initialNames.join("\n"));
    }
  }, [open, initialNames]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [log.length]);

  function append(kind: LogLine["kind"], text: string) {
    setLog((prev) => [...prev, { ts: Date.now(), kind, text }]);
  }

  function parseNames(raw: string): string[] {
    return raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function handleInstall() {
    const names = parseNames(text);
    if (names.length === 0) {
      toast.error("Enter at least one library name");
      return;
    }
    if (names.length > 25) {
      toast.error("Max 25 libraries per batch");
      return;
    }

    setRunning(true);
    setProgress(0);
    setLog([]);
    append("info", `Submitting ${names.length} ${names.length === 1 ? "library" : "libraries"}: ${names.join(", ")}`);
    abortRef.current = new AbortController();

    const onEvent = (e: InstallProgressEvent) => {
      switch (e.type) {
        case "start":
          append("info", `Starting batch (${e.total} libraries)`);
          break;
        case "install_start":
          append("info", `↓ Installing ${e.name}…`);
          if (e.total) setProgress(((e.index ?? 0) / e.total) * 100);
          break;
        case "install_done":
          append("ok", `✓ ${e.name} installed`);
          if (e.total) setProgress((((e.index ?? 0) + 1) / e.total) * 100);
          break;
        case "install_error":
          append("err", `✗ ${e.name} — ${e.error}`);
          if (e.total) setProgress((((e.index ?? 0) + 1) / e.total) * 100);
          break;
        case "finish":
          setProgress(100);
          break;
        case "result": {
          const ok = e.results?.filter((r) => r.ok).length ?? 0;
          const fail = (e.results?.length ?? 0) - ok;
          append(fail === 0 ? "ok" : "err", `Done: ${ok} succeeded, ${fail} failed`);
          if (fail === 0) toast.success(`Installed ${ok} ${ok === 1 ? "library" : "libraries"}`);
          else toast.warning(`${ok} installed, ${fail} failed`);
          break;
        }
        case "fatal":
          append("err", `Fatal: ${e.error}`);
          toast.error(`Install failed: ${e.error}`);
          break;
      }
    };

    try {
      await installLibrariesStream(names, onEvent, abortRef.current.signal);
    } catch (e) {
      append("err", `Network error: ${(e as Error).message}`);
      toast.error(`Network error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  async function handleRepair() {
    setRunning(true);
    append("info", "Repairing arduino-cli indexes…");
    try {
      const r = await repairLibraryIndexes();
      if (r?.success) {
        append("ok", "Indexes repaired ✓");
        toast.success("Library indexes repaired");
      } else {
        append("err", `Repair failed: ${r?.error ?? "unknown"}`);
        toast.error("Repair failed");
      }
    } catch (e) {
      append("err", `Repair error: ${(e as Error).message}`);
      toast.error(`Repair error: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !running && onOpenChange(v)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" /> Install Libraries
          </DialogTitle>
          <DialogDescription>
            Trigger an install on the compile server. Enter one library name per line
            (e.g. <code className="text-foreground">U8g2</code>,{" "}
            <code className="text-foreground">Adafruit GFX Library</code>). Use{" "}
            <code className="text-foreground">Name@1.2.3</code> to pin a version.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"U8g2\nAdafruit GFX Library\nAdafruit SSD1306"}
          rows={5}
          disabled={running}
          className="font-mono text-sm"
        />

        <div className="flex items-center gap-2">
          <Button onClick={handleInstall} disabled={running || !text.trim()}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Install
          </Button>
          <Button variant="outline" onClick={handleRepair} disabled={running}>
            <Wrench className="h-4 w-4 mr-2" /> Repair indexes
          </Button>
          <div className="flex-1" />
          {running && (
            <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
              Cancel
            </Button>
          )}
        </div>

        {(running || progress > 0) && (
          <div className="space-y-1">
            <Progress value={progress} className="h-1.5" />
            <div className="text-[11px] text-muted-foreground font-mono text-right">
              {Math.round(progress)}%
            </div>
          </div>
        )}

        {log.length > 0 && (
          <ScrollArea className="h-56 rounded border border-border bg-muted/30">
            <div ref={scrollRef} className="h-full overflow-auto">
              <ul className="font-mono text-[11px] divide-y divide-border">
                {log.map((l, i) => {
                  const time = new Date(l.ts).toLocaleTimeString(undefined, { hour12: false });
                  const Icon =
                    l.kind === "ok" ? CheckCircle2 : l.kind === "err" ? XCircle : Loader2;
                  const color =
                    l.kind === "ok" ? "text-success" : l.kind === "err" ? "text-destructive" : "text-muted-foreground";
                  return (
                    <li key={i} className="px-3 py-1.5 flex items-start gap-2">
                      <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${color}`} />
                      <span className="text-muted-foreground text-[10px] tabular-nums">{time}</span>
                      <span className="flex-1 text-foreground break-words">{l.text}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
