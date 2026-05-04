import { useSimStore } from "@/sim/store";
import { useEffect, useMemo, useRef, useState } from "react";
import { Trash2, ArrowDown, Plug, Unplug, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  onSerialIn: (text: string) => void;
}

export function SerialMonitor({ onSerialIn }: Props) {
  const serial = useSimStore((s) => s.serial);
  const clear = useSimStore((s) => s.clearSerial);

  const [input, setInput] = useState("");
  const [autoscroll, setAutoscroll] = useState(true);
  const [showTs, setShowTs] = useState(false);
  const [baud, setBaud] = useState(9600);
  /** When false, incoming serial lines are dropped until reconnected. */
  const [connected, setConnected] = useState(true);
  /** Index in `serial` at which we last paused; lines arriving while
   *  disconnected are not displayed. */
  const cutoffRef = useRef<number>(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Snapshot of lines visible to the user. When disconnected we keep the
  // current view frozen; reconnecting marks the new "live" cutoff.
  const visible = useMemo(() => {
    if (connected) return serial;
    return serial.slice(0, cutoffRef.current);
  }, [serial, connected]);

  useEffect(() => {
    if (autoscroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visible, autoscroll]);

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input || !connected) return;
    onSerialIn(input + "\n");
    setInput("");
  }

  function toggleConnection() {
    if (connected) {
      // Pause: freeze view at current length.
      cutoffRef.current = serial.length;
      setConnected(false);
    } else {
      // Resume: drop the gap, keep showing newest output.
      cutoffRef.current = serial.length;
      setConnected(true);
    }
  }

  function exportText() {
    const lines = visible.map((l) => {
      const ts = showTs
        ? `[${new Date(l.ts).toLocaleTimeString(undefined, { hour12: false })}] `
        : "";
      const tag = l.kind === "sys" ? "[sys] " : l.kind === "in" ? "[tx] " : "";
      return ts + tag + l.text.replace(/\n$/, "");
    });
    const blob = new Blob([lines.join("\n") + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `serial-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs">
        <span className="font-medium text-foreground/80">Serial Monitor</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            connected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {connected ? "● connected" : "○ disconnected"}
        </span>
        <div className="flex-1" />
        <select
          className="bg-input rounded px-1.5 py-0.5 text-xs border border-border"
          value={baud}
          onChange={(e) => setBaud(Number(e.target.value))}
        >
          {[9600, 19200, 38400, 57600, 115200].map((b) => (
            <option key={b} value={b}>{b} baud</option>
          ))}
        </select>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={showTs} onChange={(e) => setShowTs(e.target.checked)} />
          ts
        </label>
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={autoscroll} onChange={(e) => setAutoscroll(e.target.checked)} />
          auto
        </label>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2"
          onClick={toggleConnection}
          title={connected ? "Disconnect (pause incoming serial)" : "Connect (resume)"}
        >
          {connected
            ? <Unplug className="h-3.5 w-3.5" />
            : <Plug className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2"
          onClick={exportText}
          title="Export visible output as .txt"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2"
          onClick={() => { clear(); cutoffRef.current = 0; }}
          title="Clear serial output"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin font-mono text-xs px-3 py-2 leading-relaxed"
      >
        {visible.length === 0 ? (
          <div className="text-muted-foreground italic">
            {connected
              ? "No output yet. Run the simulation to see Serial output."
              : "Disconnected — incoming serial output is paused."}
          </div>
        ) : (
          visible.map((l, i) => (
            <div key={i} className={l.kind === "sys" ? "text-primary/80" : l.kind === "in" ? "text-warning" : "text-foreground"}>
              {showTs && (
                <span className="text-muted-foreground mr-2">
                  {new Date(l.ts).toLocaleTimeString(undefined, { hour12: false })}
                </span>
              )}
              <span className="whitespace-pre-wrap">{l.text.replace(/\n$/, "")}</span>
            </div>
          ))
        )}
      </div>

      <form onSubmit={send} className="flex gap-1.5 border-t border-border p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={connected ? "Send to serial..." : "Disconnected — connect to send"}
          disabled={!connected}
          className="flex-1 rounded bg-input border border-border px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        />
        <Button type="submit" size="sm" className="h-7" disabled={!connected}>
          Send <ArrowDown className="h-3 w-3 ml-1 rotate-[-90deg]" />
        </Button>
      </form>
    </div>
  );
}

