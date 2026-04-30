import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSimStore } from "@/sim/store";
import { Button } from "@/components/ui/button";

interface CompileOutput {
  success: boolean;
  stdout?: string;
  stderr?: string;
  errors: { file: string; line: number; col?: number; message: string }[];
  binarySize?: number;
  flashPercent?: number;
  ramUsed?: number;
  ramPercent?: number;
  mock?: boolean;
}

interface Props {
  output: CompileOutput | null;
  onClose: () => void;
}

export function CompileOutputPanel({ output, onClose }: Props) {
  const compileLog = useSimStore((s) => s.compileLog);
  const [tab, setTab] = useState<"output" | "errors">("output");

  useEffect(() => {
    if (output && output.errors.length > 0) setTab("errors");
    else setTab("output");
  }, [output]);

  if (!output && compileLog.length === 0) return null;
  return (
    <div className="border-t border-border bg-card text-xs flex flex-col" style={{ maxHeight: 200 }}>
      <div className="flex items-center px-3 py-1 border-b border-border">
        <span className="font-medium">Compile output</span>
        {output?.mock && <span className="ml-2 text-muted-foreground italic">(mock — VITE_API_URL not set)</span>}
        <div className="flex-1" />
        {output?.success && (
          <span className="text-success">
            ✓ Sketch uses {output.binarySize ?? 0} bytes
            {output.flashPercent !== undefined ? ` (${output.flashPercent}% flash)` : ""}
            {output.ramUsed !== undefined ? `, RAM ${output.ramUsed}B` : ""}
          </span>
        )}
        <Button size="sm" variant="ghost" className="h-6 px-2 ml-2" onClick={onClose}>Close</Button>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 min-h-0 flex flex-col">
        <TabsList className="rounded-none h-7 px-2 self-start bg-transparent">
          <TabsTrigger value="output" className="text-xs">Output</TabsTrigger>
          <TabsTrigger value="errors" className="text-xs">
            Errors {output && output.errors.length > 0 ? `(${output.errors.length})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="output" className="flex-1 min-h-0 mt-0 overflow-auto">
          <pre className="font-mono text-[11px] px-3 py-2 whitespace-pre-wrap text-foreground/80">
            {output?.stdout || output?.stderr || compileLog.map((l) => l.text).join("\n") || "Ready."}
          </pre>
        </TabsContent>
        <TabsContent value="errors" className="flex-1 min-h-0 mt-0 overflow-auto">
          {output && output.errors.length > 0 ? (
            <ul className="font-mono text-[11px] divide-y divide-border">
              {output.errors.map((e, i) => (
                <li key={i} className="px-3 py-1.5">
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
      </Tabs>
    </div>
  );
}
