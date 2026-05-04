import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSimStore } from "@/sim/store";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, AlertTriangle, Package, Download } from "lucide-react";

interface LogEntry {
  ts: number;
  step: string;
  message: string;
  kind: "info" | "install" | "header" | "retry" | "success" | "error";
}

function classifyProgress(step: string, message: string): LogEntry["kind"] {
  const m = (message || "").toLowerCase();
  const s = (step || "").toLowerCase();
  if (s.includes("install") || m.includes("installing") || m.includes("auto-install")) return "install";
  if (m.includes("missing header") || m.includes("no such file")) return "header";
  if (m.includes("retry")) return "retry";
  if (m.includes("✓") || m.includes("success")) return "success";
  if (m.includes("✗") || m.includes("fail")) return "error";
  return "info";
}

// Pull library names out of messages like:
//   "Auto-installing libraries for missing headers: U8g2, Adafruit GFX Library"
//   "Installing 2 missing libraries: U8g2, Adafruit BusIO"
function extractLibsFromMessage(message: string): string[] {
  const m = message.match(/libraries?[^:]*:\s*(.+)$/i);
  if (!m) return [];
  return m[1]
    .split(/[,;]/)
    .map((s) => s.trim().replace(/[.✓✗]+$/, ""))
    .filter(Boolean);
}

export interface CompileOutput {
  success: boolean;
  stdout?: string;
  stderr?: string;
  errors: { file: string; line: number; col?: number; message: string; severity?: "error" | "warning" }[];
  warnings?: { file: string; line: number; col?: number; message: string; severity?: "error" | "warning" }[];
  binarySize?: number;
  flashUsed?: number;
  flashTotal?: number;
  flashPercent?: number;
  ramUsed?: number;
  ramTotal?: number;
  ramPercent?: number;
  duration?: number;
  fromCache?: boolean;
}

export interface CompileProgressView {
  step: string;
  percent: number;
  message: string;
  lastLine?: string;
}

interface Props {
  output: CompileOutput | null;
  progress?: CompileProgressView | null;
  compiling?: boolean;
  onClose: () => void;
  onErrorClick?: (file: string, line: number, col?: number) => void;
}

export function CompileOutputPanel({ output, progress, compiling, onClose, onErrorClick }: Props) {
  const compileLog = useSimStore((s) => s.compileLog);
  const [tab, setTab] = useState<"output" | "errors" | "warnings" | "log">("log");
  const [liveLog, setLiveLog] = useState<LogEntry[]>([]);
  const lastSigRef = useRef<string>("");
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  // Append every distinct progress event into the live log.
  useEffect(() => {
    if (!progress) return;
    const sig = `${progress.step}|${progress.percent}|${progress.message}`;
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    const kind = classifyProgress(progress.step, progress.message);
    setLiveLog((prev) => [
      ...prev,
      { ts: Date.now(), step: progress.step, message: progress.message, kind },
    ]);
  }, [progress]);

  // When a brand-new compile starts (compiling flips on), clear the log.
  useEffect(() => {
    if (compiling) {
      setLiveLog([]);
      lastSigRef.current = "";
      setTab("log");
    }
  }, [compiling]);

  // Auto-scroll to newest entry.
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [liveLog.length]);

  useEffect(() => {
    if (output && output.errors.length > 0) setTab("errors");
    else if (output && (output.warnings?.length ?? 0) > 0 && !output.errors.length) setTab("warnings");
    else if (output) setTab("output");
  }, [output]);

  if (!output && !compiling && compileLog.length === 0 && liveLog.length === 0) return null;

  const warnings = output?.warnings ?? [];
  const fmtKB = (n?: number) => (n === undefined ? "—" : `${(n / 1024).toFixed(1)} KB`);
  const fmtMs = (n?: number) => (n === undefined ? "" : `${(n / 1000).toFixed(2)}s`);

  return (
    <div className="border-t border-border bg-card text-xs flex flex-col" style={{ maxHeight: 260 }}>
      {/* Header / status bar */}
      <div className="flex items-center px-3 py-1.5 border-b border-border gap-2">
        {compiling ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : output?.success ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        ) : output ? (
          <XCircle className="h-3.5 w-3.5 text-destructive" />
        ) : null}
        <span className="font-medium">
          {compiling ? "Compiling..." : output?.success ? "Compile OK" : output ? "Compile failed" : "Compile output"}
        </span>
        {output?.fromCache && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">cached</span>
        )}
        <div className="flex-1" />
        {output?.success && (
          <span className="text-success font-mono text-[11px]">
            Flash {fmtKB(output.flashUsed)}{output.flashTotal ? ` / ${fmtKB(output.flashTotal)}` : ""}
            {output.flashPercent !== undefined ? ` (${output.flashPercent.toFixed(1)}%)` : ""}
            {" · "}
            RAM {fmtKB(output.ramUsed)}{output.ramTotal ? ` / ${fmtKB(output.ramTotal)}` : ""}
            {output.ramPercent !== undefined ? ` (${output.ramPercent.toFixed(1)}%)` : ""}
            {output.duration !== undefined ? ` · ${fmtMs(output.duration)}` : ""}
          </span>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-2 ml-2" onClick={onClose}>Close</Button>
      </div>

      {/* Progress bar */}
      {compiling && progress && (
        <div className="px-3 py-2 border-b border-border space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-foreground/80">{progress.step}{progress.message ? ` — ${progress.message}` : ""}</span>
            <span className="font-mono text-muted-foreground">{Math.round(progress.percent)}%</span>
          </div>
          <div className="h-1.5 w-full bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }}
            />
          </div>
          {progress.lastLine && (
            <pre className="font-mono text-[10px] text-muted-foreground truncate">{progress.lastLine}</pre>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 min-h-0 flex flex-col">
        <TabsList className="rounded-none h-7 px-2 self-start bg-transparent">
          <TabsTrigger value="log" className="text-xs">
            Live Log {liveLog.length > 0 ? `(${liveLog.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="output" className="text-xs">Output</TabsTrigger>
          <TabsTrigger value="errors" className="text-xs">
            Errors {output && output.errors.length > 0 ? `(${output.errors.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="warnings" className="text-xs">
            Warnings {warnings.length > 0 ? `(${warnings.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="log" className="flex-1 min-h-0 mt-0 overflow-auto">
          <div ref={logScrollRef} className="h-full overflow-auto">
            {liveLog.length === 0 ? (
              <div className="px-3 py-3 text-muted-foreground italic">Waiting for compile events…</div>
            ) : (
              <ul className="font-mono text-[11px] divide-y divide-border">
                {liveLog.map((entry, i) => {
                  const libs = entry.kind === "install" ? extractLibsFromMessage(entry.message) : [];
                  const headers = entry.kind === "header" ? extractLibsFromMessage(entry.message) : [];
                  const time = new Date(entry.ts).toLocaleTimeString(undefined, { hour12: false });
                  const Icon =
                    entry.kind === "install" ? Download :
                    entry.kind === "header" ? AlertTriangle :
                    entry.kind === "success" ? CheckCircle2 :
                    entry.kind === "error" ? XCircle :
                    entry.kind === "retry" ? Loader2 :
                    Package;
                  const color =
                    entry.kind === "install" ? "text-primary" :
                    entry.kind === "header" ? "text-warning" :
                    entry.kind === "success" ? "text-success" :
                    entry.kind === "error" ? "text-destructive" :
                    entry.kind === "retry" ? "text-primary" :
                    "text-muted-foreground";
                  return (
                    <li key={i} className="px-3 py-1.5">
                      <div className="flex items-start gap-2">
                        <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${color} ${entry.kind === "retry" ? "animate-spin" : ""}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground text-[10px] tabular-nums">{time}</span>
                            <span className="text-foreground/60 text-[10px] uppercase tracking-wide">{entry.step}</span>
                          </div>
                          <div className="text-foreground break-words">{entry.message}</div>
                          {libs.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {libs.map((l) => (
                                <span key={l} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-medium">
                                  <Download className="h-3 w-3" /> {l}
                                </span>
                              ))}
                            </div>
                          )}
                          {headers.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {headers.map((h) => (
                                <span key={h} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[10px] font-medium">
                                  <AlertTriangle className="h-3 w-3" /> {h}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="output" className="flex-1 min-h-0 mt-0 overflow-auto">
          <pre className="font-mono text-[11px] px-3 py-2 whitespace-pre-wrap text-foreground/80">
            {output?.stdout || output?.stderr || compileLog.map((l) => l.text).join("\n") || "Ready."}
          </pre>
        </TabsContent>

        <TabsContent value="errors" className="flex-1 min-h-0 mt-0 overflow-auto">
          {output && output.errors.length > 0 ? (
            <ul className="font-mono text-[11px] divide-y divide-border">
              {output.errors.map((e, i) => (
                <li
                  key={i}
                  className="px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
                  onClick={() => onErrorClick?.(e.file, e.line, e.col)}
                >
                  <span className="text-destructive font-semibold">error</span>
                  <span className="text-muted-foreground"> {e.file}:{e.line}{e.col ? `:${e.col}` : ""}</span>
                  <div className="text-foreground">{e.message}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-muted-foreground italic">No errors.</div>
          )}
        </TabsContent>

        <TabsContent value="warnings" className="flex-1 min-h-0 mt-0 overflow-auto">
          {warnings.length > 0 ? (
            <ul className="font-mono text-[11px] divide-y divide-border">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className="px-3 py-1.5 hover:bg-muted/50 cursor-pointer"
                  onClick={() => onErrorClick?.(w.file, w.line, w.col)}
                >
                  <AlertTriangle className="inline h-3 w-3 text-warning mr-1" />
                  <span className="text-warning font-semibold">warning</span>
                  <span className="text-muted-foreground"> {w.file}:{w.line}{w.col ? `:${w.col}` : ""}</span>
                  <div className="text-foreground">{w.message}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-3 text-muted-foreground italic">No warnings.</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
