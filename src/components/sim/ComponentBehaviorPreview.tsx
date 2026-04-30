// Live behavior simulator for AI-generated components in the admin builder.
// Renders the SVG, exposes tunable params (sliders/toggles/selects), evaluates
// the component's state machine, and animates the SVG accordingly:
//  - data-spin elements rotate at a rate proportional to "speed"
//  - data-glow elements glow proportional to "brightness"
//  - data-flicker elements flicker in failure states
//  - overlays (smoke/spark/flame) render on top in burned/broken states.

import { useEffect, useMemo, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw, Zap, AlertTriangle } from "lucide-react";

export interface PreviewSpecLike {
  name: string;
  width: number;
  height: number;
  svg: string;
  pins: { id: string; label: string; x: number; y: number; role?: string }[];
  behavior?: {
    params?: Array<{
      id: string;
      label: string;
      type: "number" | "boolean" | "enum";
      min?: number;
      max?: number;
      step?: number;
      default?: number | boolean | string;
      options?: string[];
      unit?: string;
    }>;
    states?: Array<{
      id: string;
      label: string;
      when?: string;
      visual?: {
        filter?: string;
        spinSelector?: string;
        glowSelector?: string;
        flickerSelector?: string;
        overlay?: "smoke" | "spark" | "flame" | null;
      };
    }>;
    failures?: Array<{ when: string; state: string; reason: string }>;
    notes?: string;
  };
}

type ParamValues = Record<string, number | boolean | string>;

/** Safely evaluate a small boolean expression against a values bag. */
function evalExpr(expr: string, values: ParamValues, burned: boolean): boolean {
  if (!expr) return false;
  try {
    const keys = Object.keys(values);
    const fn = new Function(...keys, "burned", `return (${expr});`);
    return Boolean(fn(...keys.map((k) => values[k]), burned));
  } catch {
    return false;
  }
}

export function ComponentBehaviorPreview({ spec }: { spec: PreviewSpecLike }) {
  const params = spec.behavior?.params ?? [];
  const states = spec.behavior?.states ?? [];
  const failures = spec.behavior?.failures ?? [];

  // Initial param values
  const initial = useMemo<ParamValues>(() => {
    const v: ParamValues = {};
    for (const p of params) {
      if (p.default !== undefined) v[p.id] = p.default as never;
      else if (p.type === "number") v[p.id] = p.min ?? 0;
      else if (p.type === "boolean") v[p.id] = false;
      else if (p.type === "enum") v[p.id] = p.options?.[0] ?? "";
    }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  const [values, setValues] = useState<ParamValues>(initial);
  const [burned, setBurned] = useState(false);
  const [burnReason, setBurnReason] = useState<string | null>(null);

  useEffect(() => {
    setValues(initial);
    setBurned(false);
    setBurnReason(null);
  }, [initial]);

  // Detect failure transitions
  useEffect(() => {
    if (burned) return;
    for (const f of failures) {
      if (evalExpr(f.when, values, burned)) {
        setBurned(true);
        setBurnReason(f.reason);
        return;
      }
    }
  }, [values, failures, burned]);

  // Resolve current state (first matching `when`, else last state, else "idle")
  const activeState = useMemo(() => {
    if (burned) {
      const burnedState = states.find((s) => /burn|broken|damag|dead|fail/i.test(s.id) || /burn|broken|damag|dead|fail/i.test(s.label));
      if (burnedState) return burnedState;
    }
    for (const s of states) {
      if (s.when && evalExpr(s.when, values, burned)) return s;
    }
    return states[0];
  }, [states, values, burned]);

  // Spin animation: drive a CSS rotation based on time + speed-like param.
  const svgRef = useRef<SVGSVGElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const angleRef = useRef(0);
  const lastT = useRef<number>(0);

  // Pick a numeric "speed-ish" param for rotation rate.
  const speedValue = useMemo(() => {
    const speedKey = params.find((p) =>
      /speed|rpm|rate|freq/i.test(p.id) || /speed|rpm|rate|freq/i.test(p.label),
    )?.id;
    if (speedKey && typeof values[speedKey] === "number") return values[speedKey] as number;
    // Fallback: any numeric > 0 param
    const firstNum = params.find((p) => p.type === "number");
    return firstNum && typeof values[firstNum.id] === "number" ? (values[firstNum.id] as number) : 0;
  }, [params, values]);

  const directionMul = useMemo(() => {
    const dirKey = params.find((p) => /direction|dir/i.test(p.id))?.id;
    const v = dirKey ? values[dirKey] : null;
    if (typeof v === "string" && /rev|back|ccw|left/i.test(v)) return -1;
    return 1;
  }, [params, values]);

  useEffect(() => {
    function tick(t: number) {
      const dt = lastT.current ? (t - lastT.current) / 1000 : 0;
      lastT.current = t;
      if (!burned) {
        // speedValue normalized 0..1 (assume 0..max); fallback rate 0..720 deg/s
        const max = params.find((p) => /speed|rpm|rate|freq/i.test(p.id))?.max ?? 100;
        const norm = Math.max(0, Math.min(1, (speedValue ?? 0) / (max || 100)));
        angleRef.current += dt * 720 * norm * directionMul;
      }
      const root = svgRef.current;
      if (root) {
        const visual = activeState?.visual;
        const spinSel = visual?.spinSelector || "[data-spin]";
        const glowSel = visual?.glowSelector || "[data-glow]";
        const flickerSel = visual?.flickerSelector || "[data-flicker]";

        root.querySelectorAll<SVGGraphicsElement>(spinSel).forEach((el) => {
          // Compute element center for rotation origin
          try {
            const bbox = el.getBBox();
            const cx = bbox.x + bbox.width / 2;
            const cy = bbox.y + bbox.height / 2;
            el.setAttribute(
              "transform",
              `rotate(${angleRef.current.toFixed(2)} ${cx} ${cy})`,
            );
          } catch { /* getBBox can throw if not rendered */ }
        });

        // Glow intensity
        const brightnessKey = params.find((p) => /bright|lumin|glow|intens/i.test(p.id))?.id;
        const brightness =
          (brightnessKey && typeof values[brightnessKey] === "number"
            ? (values[brightnessKey] as number)
            : speedValue) || 0;
        const max = params.find((p) => /bright|lumin|glow|intens/i.test(p.id))?.max ?? 100;
        const glowNorm = Math.max(0, Math.min(1, brightness / (max || 100)));
        root.querySelectorAll<SVGGraphicsElement>(glowSel).forEach((el) => {
          el.style.filter = burned
            ? "grayscale(1) brightness(0.4)"
            : `drop-shadow(0 0 ${4 + glowNorm * 10}px currentColor) brightness(${0.7 + glowNorm * 0.8})`;
          el.style.opacity = burned ? "0.5" : String(0.4 + glowNorm * 0.6);
        });

        // Flicker
        root.querySelectorAll<SVGGraphicsElement>(flickerSel).forEach((el) => {
          if (burned) {
            el.style.opacity = Math.random() > 0.5 ? "0.3" : "1";
          } else {
            el.style.opacity = "1";
          }
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastT.current = 0;
    };
  }, [activeState, params, values, speedValue, directionMul, burned]);

  const overlay = activeState?.visual?.overlay ?? (burned ? "smoke" : null);
  const filter = burned
    ? "grayscale(0.7) brightness(0.85) sepia(0.3)"
    : activeState?.visual?.filter;

  function reset() {
    setValues(initial);
    setBurned(false);
    setBurnReason(null);
  }

  return (
    <div className="space-y-3">
      {/* SVG stage */}
      <div className="relative bg-card rounded border border-border p-4 flex items-center justify-center">
        <svg
          ref={svgRef}
          xmlns="http://www.w3.org/2000/svg"
          viewBox={`0 0 ${spec.width} ${spec.height}`}
          width={Math.min(spec.width * 1.5, 320)}
          height={Math.min(spec.height * 1.5, 240)}
          style={{ filter, transition: "filter 0.3s" }}
          dangerouslySetInnerHTML={{ __html: spec.svg + renderPinDots(spec) }}
        />
        {overlay && <OverlayFx kind={overlay} />}
        <div className="absolute top-2 left-2 flex gap-1 items-center">
          {activeState && (
            <Badge variant={burned ? "destructive" : "secondary"} className="text-[10px]">
              {burned && <AlertTriangle className="h-3 w-3 mr-1" />}
              {!burned && <Zap className="h-3 w-3 mr-1" />}
              {activeState.label}
            </Badge>
          )}
        </div>
        <div className="absolute top-2 right-2">
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={reset}>
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        </div>
      </div>

      {burnReason && (
        <div className="text-xs text-destructive flex items-start gap-1.5 p-2 bg-destructive/10 rounded border border-destructive/30">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span><strong>Component burned:</strong> {burnReason}</span>
        </div>
      )}

      {/* Param controls */}
      {params.length > 0 ? (
        <div className="space-y-2.5 p-3 bg-muted/40 rounded border border-border">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
            Live controls
          </div>
          {params.map((p) => (
            <div key={p.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <label className="text-foreground">{p.label}</label>
                <span className="text-muted-foreground font-mono">
                  {String(values[p.id] ?? "")}{p.unit ? ` ${p.unit}` : ""}
                </span>
              </div>
              {p.type === "number" && (
                <Slider
                  value={[Number(values[p.id] ?? p.min ?? 0)]}
                  min={p.min ?? 0}
                  max={p.max ?? 100}
                  step={p.step ?? 1}
                  onValueChange={([v]) => setValues((prev) => ({ ...prev, [p.id]: v }))}
                />
              )}
              {p.type === "boolean" && (
                <Switch
                  checked={Boolean(values[p.id])}
                  onCheckedChange={(v) => setValues((prev) => ({ ...prev, [p.id]: v }))}
                />
              )}
              {p.type === "enum" && (
                <Select
                  value={String(values[p.id] ?? "")}
                  onValueChange={(v) => setValues((prev) => ({ ...prev, [p.id]: v }))}
                >
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(p.options ?? []).map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground italic px-1">
          No tunable behavior params — this component is passive.
        </div>
      )}

      {spec.behavior?.notes && (
        <div className="text-xs text-muted-foreground p-2 bg-muted/30 rounded">
          {spec.behavior.notes}
        </div>
      )}
    </div>
  );
}

function renderPinDots(spec: PreviewSpecLike): string {
  return spec.pins
    .map(
      (p) =>
        `<g><circle cx="${p.x}" cy="${p.y}" r="3" fill="oklch(0.78 0.15 195)" stroke="oklch(0.15 0 0)" stroke-width="0.5"/><title>${escapeXml(p.label)}</title></g>`,
    )
    .join("");
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;", "'": "&apos;" }[c]!));
}

function OverlayFx({ kind }: { kind: "smoke" | "spark" | "flame" }) {
  if (kind === "smoke") {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-hidden">
        <div className="smoke-puff smoke-1" />
        <div className="smoke-puff smoke-2" />
        <div className="smoke-puff smoke-3" />
        <style>{`
          .smoke-puff { position:absolute; bottom:40%; width:30px; height:30px; border-radius:50%;
            background: radial-gradient(circle, oklch(0.6 0 0 / 0.55), oklch(0.4 0 0 / 0));
            animation: smokeRise 2.4s ease-in infinite; }
          .smoke-1 { left:42%; animation-delay:0s; }
          .smoke-2 { left:50%; animation-delay:0.8s; }
          .smoke-3 { left:58%; animation-delay:1.4s; }
          @keyframes smokeRise {
            0% { transform: translateY(0) scale(0.4); opacity:0; }
            20% { opacity:0.8; }
            100% { transform: translateY(-120px) scale(1.6); opacity:0; }
          }
        `}</style>
      </div>
    );
  }
  if (kind === "flame") {
    return (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="text-3xl animate-pulse">🔥</div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="spark" />
      <style>{`
        .spark { width:8px; height:8px; background: oklch(0.95 0.2 90);
          border-radius:50%; box-shadow: 0 0 12px 4px oklch(0.85 0.25 60);
          animation: sparkBlink 0.18s steps(2) infinite; }
        @keyframes sparkBlink { 0%{opacity:1} 50%{opacity:0} 100%{opacity:1} }
      `}</style>
    </div>
  );
}
