import { useSimStore } from "@/sim/store";
import { useEffect, useRef, useState } from "react";
import { Trash2, ArrowDown } from "lucide-react";
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
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoscroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [serial, autoscroll]);

  function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input) return;
    onSerialIn(input + "\n");
    setInput("");
  }

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs">
        <span className="font-medium text-foreground/80">Serial Monitor</span>
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
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => clear()}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto scrollbar-thin font-mono text-xs px-3 py-2 leading-relaxed"
      >
        {serial.length === 0 ? (
          <div className="text-muted-foreground italic">No output yet. Run the simulation to see Serial output.</div>
        ) : (
          serial.map((l, i) => (
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
          placeholder="Send to serial..."
          className="flex-1 rounded bg-input border border-border px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <Button type="submit" size="sm" className="h-7">
          Send <ArrowDown className="h-3 w-3 ml-1 rotate-[-90deg]" />
        </Button>
      </form>
    </div>
  );
}
