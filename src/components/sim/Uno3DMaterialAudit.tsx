// Audit panel for the Uno GLB. Lists every material applied to the loaded
// scene, flags missing textures (the source STEP→GLB has zero), and provides
// a one-click "Reload materials" that re-applies our STEP→GLB fix-ups to the
// LIVE three.js scene (no page refresh needed). Each row also exposes a color
// picker so individual materials can be tweaked toward real Arduino colors
// without re-running the offline conversion.

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Image as ImageIcon, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { MaterialAuditEntry, Uno3DViewerHandle } from "@/components/sim/Uno3DViewer";

interface Props {
  viewerRef: React.RefObject<Uno3DViewerHandle | null>;
  className?: string;
}

const ROLE_LABEL: Record<MaterialAuditEntry["role"], string> = {
  pcb: "PCB green",
  "metal-gold": "Gold pad",
  "metal-silver": "Silver / chrome",
  "plastic-dark": "Dark plastic",
  "plastic-light": "Light plastic",
  blue: "Blue",
  red: "Red",
  yellow: "Yellow",
  unknown: "Unknown",
};

export function Uno3DMaterialAudit({ viewerRef, className }: Props) {
  const [entries, setEntries] = useState<MaterialAuditEntry[]>([]);
  const [stats, setStats] = useState<{ materials: number; textures: number; images: number } | null>(null);
  const [pollTick, setPollTick] = useState(0);

  // Poll for readiness — the viewer loads the GLB asynchronously, so we can't
  // read the audit until the clone exists. Polling stops after first success.
  useEffect(() => {
    if (entries.length > 0) return;
    const v = viewerRef.current;
    if (!v) {
      const t = setTimeout(() => setPollTick((n) => n + 1), 200);
      return () => clearTimeout(t);
    }
    if (!v.isReady()) {
      const t = setTimeout(() => setPollTick((n) => n + 1), 200);
      return () => clearTimeout(t);
    }
    setEntries(v.audit());
    setStats(v.modelStats());
  }, [pollTick, viewerRef, entries.length]);

  function reload() {
    const v = viewerRef.current;
    if (!v) return;
    setEntries(v.reloadMaterials());
    setStats(v.modelStats());
  }

  function setColor(index: number, color: string) {
    const v = viewerRef.current;
    if (!v) return;
    setEntries(v.setMaterialColor(index, color));
  }

  const missingTextures = !!stats && stats.textures === 0;
  const missingPcbGreen = entries.length > 0 && !entries.some((e) => e.role === "pcb");

  return (
    <div className={`flex flex-col bg-card text-foreground border border-border rounded-md overflow-hidden ${className ?? ""}`}>
      <div className="px-3 py-2 border-b border-border flex items-center gap-2 bg-muted/30">
        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium uppercase tracking-wide">GLB material audit</span>
        <span className="ml-auto" />
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={reload}>
          <RefreshCw className="h-3 w-3 mr-1.5" />
          Reload materials
        </Button>
      </div>

      {/* Summary strip: model-level facts pulled from the source GLB. */}
      <div className="grid grid-cols-3 gap-px bg-border text-[10px]">
        <Stat label="Materials" value={stats?.materials ?? "…"} ok={!!stats && stats.materials > 0} />
        <Stat label="Textures" value={stats?.textures ?? "…"} ok={!!stats && stats.textures > 0} />
        <Stat label="Images" value={stats?.images ?? "…"} ok={!!stats && stats.images > 0} />
      </div>

      {/* Diagnostic banners — only shown when we detect real problems. */}
      {(missingTextures || missingPcbGreen) && (
        <div className="px-3 py-2 border-b border-border bg-amber-500/10 text-amber-200 text-[11px] space-y-1">
          {missingTextures && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong>No textures embedded in the GLB.</strong> The STEP→GLB converter exported solid
                colors only — no silkscreen, no chip text, no traces. Use the color overrides below to
                tune flat colors, or replace <code className="font-mono">/models/uno.glb</code> with a
                textured version.
              </span>
            </div>
          )}
          {missingPcbGreen && (
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong>No green PCB material detected.</strong> None of the loaded materials read as
                Arduino teal. The largest dielectric material is likely the board substrate — set its
                color to <code className="font-mono">#006e51</code> to match the real Uno.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Material list */}
      <div className="flex-1 min-h-0 overflow-auto">
        {entries.length === 0 ? (
          <div className="p-4 text-xs text-muted-foreground text-center">Waiting for GLB to load…</div>
        ) : (
          <ul className="divide-y divide-border">
            {entries.map((e) => (
              <li key={e.index} className="px-3 py-2 flex items-center gap-2 text-xs">
                <span className="font-mono text-muted-foreground w-6 text-right">{e.index}</span>
                {/* Color swatch doubles as picker — clicking opens the native input. */}
                <label className="relative shrink-0 cursor-pointer" title="Click to override color">
                  <span
                    className="block w-6 h-6 rounded border border-border"
                    style={{ background: e.color }}
                  />
                  <input
                    type="color"
                    value={e.color}
                    onChange={(ev) => setColor(e.index, ev.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </label>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono truncate">{e.name}</span>
                    <Badge variant="secondary" className="h-4 text-[9px] px-1.5">
                      {ROLE_LABEL[e.role]}
                    </Badge>
                    {(e.hasMap || e.hasNormalMap) && (
                      <Badge variant="outline" className="h-4 text-[9px] px-1.5">
                        textured
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {e.color} · m {e.metalness.toFixed(2)} · r {e.roughness.toFixed(2)} · ×{e.primCount}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-1.5 border-t border-border text-[10px] text-muted-foreground flex items-center gap-1.5">
        <CheckCircle2 className="h-3 w-3" />
        Color edits apply live to the renderer. Reload re-runs the STEP→GLB color heuristics.
      </div>
    </div>
  );
}

function Stat({ label, value, ok }: { label: string; value: number | string; ok: boolean }) {
  return (
    <div className="bg-card px-3 py-1.5">
      <div className="text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`font-mono text-sm ${ok ? "text-foreground" : "text-amber-300"}`}>{value}</div>
    </div>
  );
}
