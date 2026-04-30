import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "@/sim/store";
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Pause, Play, Trash2 } from "lucide-react";

interface PlotPoint {
  t: number;
  [series: string]: number;
}

const COLORS = ["#8be9fd", "#50fa7b", "#ff79c6", "#ffb86c", "#bd93f9", "#f1fa8c", "#ff5555"];
const WINDOW_MS = 30_000;

export function SerialPlotter() {
  const serial = useSimStore((s) => s.serial);
  const [paused, setPaused] = useState(false);
  const [points, setPoints] = useState<PlotPoint[]>([]);
  const seenIdxRef = useRef(0);
  const startRef = useRef<number | null>(null);

  // Reset when serial is cleared
  useEffect(() => {
    if (serial.length < seenIdxRef.current) {
      seenIdxRef.current = 0;
      setPoints([]);
      startRef.current = null;
    }
  }, [serial.length]);

  useEffect(() => {
    if (paused) return;
    if (serial.length === seenIdxRef.current) return;
    const next: PlotPoint[] = [];
    for (let i = seenIdxRef.current; i < serial.length; i++) {
      const line = serial[i];
      if (line.kind !== "out") continue;
      const text = line.text.trim();
      // strip "label: " prefix on each value: e.g. "A0 = 512" -> 512
      const tokens = text.split(/[\s,;\t]+/).map((tok) => {
        const m = tok.match(/-?\d+(?:\.\d+)?/);
        return m ? Number(m[0]) : NaN;
      });
      const nums = tokens.filter((n) => Number.isFinite(n));
      if (nums.length === 0) continue;
      if (startRef.current === null) startRef.current = line.ts;
      const t = (line.ts - startRef.current) / 1000;
      const point: PlotPoint = { t: +t.toFixed(3) };
      nums.forEach((v, idx) => { point[`s${idx}`] = v; });
      next.push(point);
    }
    seenIdxRef.current = serial.length;
    if (next.length === 0) return;
    setPoints((prev) => {
      const merged = [...prev, ...next];
      const cutoff = merged.length ? merged[merged.length - 1].t - WINDOW_MS / 1000 : 0;
      return merged.filter((p) => p.t >= cutoff);
    });
  }, [serial, paused]);

  const seriesKeys = useMemo(() => {
    const set = new Set<string>();
    points.forEach((p) => Object.keys(p).forEach((k) => { if (k !== "t") set.add(k); }));
    return Array.from(set);
  }, [points]);

  function clear() {
    setPoints([]);
    seenIdxRef.current = serial.length;
    startRef.current = null;
  }

  return (
    <div className="flex flex-col h-full bg-card">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border text-xs">
        <span className="font-medium text-foreground/80">Serial Plotter</span>
        <span className="text-muted-foreground">{seriesKeys.length} series · {points.length} pts</span>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setPaused((p) => !p)}>
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          <span className="ml-1">{paused ? "Resume" : "Pause"}</span>
        </Button>
        <Button size="sm" variant="ghost" className="h-6 px-2" onClick={clear}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 p-2">
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-xs italic">
            Waiting for numeric Serial output... (e.g. <code className="font-mono mx-1">Serial.println(value)</code>)
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="t" tickFormatter={(v) => `${v}s`} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", fontSize: 11 }}
                labelFormatter={(v) => `${v}s`}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {seriesKeys.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
