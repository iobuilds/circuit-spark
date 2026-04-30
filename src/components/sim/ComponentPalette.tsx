import { COMPONENT_DEFS } from "@/sim/components";
import type { BoardId, ComponentKind } from "@/sim/types";
import { BOARDS } from "@/sim/types";
import { useEffect, useMemo, useState } from "react";
import { Search, Cpu } from "lucide-react";
import { useAdminStore, type ComponentEntry } from "@/sim/adminStore";
import { useSimStore } from "@/sim/store";

const CATEGORIES = ["Basic", "Displays", "Sensors", "Actuators", "Power", "Comms"] as const;

interface PaletteEntry {
  /** Drag payload — built-in ComponentKind, or `custom:<id>` for admin customs. */
  payload: string;
  label: string;
  category: string;
  kind?: ComponentKind;          // built-in only
  custom?: ComponentEntry;       // present for admin-created customs
  disabled?: boolean;
}

export function ComponentPalette() {
  const [q, setQ] = useState("");
  const adminLoaded = useAdminStore((s) => s.loaded);
  const adminComps = useAdminStore((s) => s.components);
  const hydrate = useAdminStore((s) => s.hydrate);
  useEffect(() => { if (!adminLoaded) hydrate(); }, [adminLoaded, hydrate]);

  // Built-ins map to COMPONENT_DEFS; custom entries (non-built-in admin items)
  // are also added so users see what they created in the admin panel.
  const all: PaletteEntry[] = useMemo(() => {
    if (!adminLoaded) {
      return Object.values(COMPONENT_DEFS)
        .filter((c) => c.available)
        .map((c) => ({ payload: c.kind, label: c.label, category: c.category, kind: c.kind }));
    }
    const out: PaletteEntry[] = [];
    for (const a of adminComps) {
      if (!a.enabled) continue;
      if (a.builtIn) {
        const def = COMPONENT_DEFS[a.id as ComponentKind];
        if (!def) continue;
        out.push({
          payload: def.kind,
          label: def.label,
          category: def.category,
          kind: def.kind,
          disabled: !def.available,
        });
      } else {
        out.push({
          payload: `custom:${a.id}`,
          label: a.label,
          category: a.category || "Basic",
          custom: a,
        });
      }
    }
    return out;
  }, [adminLoaded, adminComps]);

  const filtered = all.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground">
      <div className="px-3 py-2 border-b border-sidebar-border">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Components</div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search components..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded bg-input border border-sidebar-border focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin py-2">
        <BoardsSection query={q} />
        {[...CATEGORIES, "Custom"].map((cat) => {
          const items = filtered.filter((c) =>
            cat === "Custom" ? !!c.custom : c.category === cat && !c.custom
          );
          if (!items.length) return null;
          return (
            <div key={cat} className="mb-3">
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {cat}
              </div>
              <div className="grid grid-cols-2 gap-1.5 px-2">
                {items.map((c) => (
                  <PaletteItem key={c.payload} entry={c} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-[10px] text-muted-foreground px-3 py-2 border-t border-sidebar-border">
        Drag components onto the canvas
      </div>
    </div>
  );
}

function PaletteItem({ entry }: { entry: PaletteEntry }) {
  const disabled = !!entry.disabled;
  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => {
        if (disabled) { e.preventDefault(); return; }
        e.dataTransfer.setData("application/x-embedsim-component", entry.payload);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={[
        "rounded border p-2 text-xs flex flex-col items-center gap-1 transition-all",
        disabled
          ? "border-sidebar-border opacity-40 cursor-not-allowed"
          : "border-sidebar-border bg-sidebar-accent hover:border-primary hover:glow-neon cursor-grab active:cursor-grabbing",
      ].join(" ")}
      title={disabled ? `${entry.label} (coming soon)` : entry.label}
    >
      <div className="w-full h-8 flex items-center justify-center overflow-hidden">
        {entry.custom ? <CustomThumb entry={entry.custom} /> : <PaletteIcon kind={entry.kind!} />}
      </div>
      <div className="truncate w-full text-center">{entry.label}</div>
    </div>
  );
}

function CustomThumb({ entry }: { entry: ComponentEntry }) {
  if (entry.svg) {
    return (
      <div
        className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full"
        dangerouslySetInnerHTML={{ __html: entry.svg }}
      />
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6">
      <rect x={3} y={6} width={18} height={12} rx={2}
        fill={entry.bodyColor ?? "oklch(0.32 0.02 250)"} stroke="currentColor" strokeWidth={0.6} />
    </svg>
  );
}

function PaletteIcon({ kind }: { kind: ComponentKind }) {
  switch (kind) {
    case "led":
      return (
        <svg viewBox="0 0 30 30" className="w-6 h-6">
          <ellipse cx={15} cy={12} rx={9} ry={11} fill="oklch(0.7 0.25 25)" />
          <line x1={11} y1={22} x2={11} y2={28} stroke="currentColor" strokeWidth={1.5} />
          <line x1={19} y1={22} x2={19} y2={28} stroke="currentColor" strokeWidth={1.5} />
        </svg>
      );
    case "resistor":
      return (
        <svg viewBox="0 0 36 16" className="w-8 h-4">
          <line x1={0} y1={8} x2={6} y2={8} stroke="currentColor" />
          <rect x={6} y={3} width={24} height={10} rx={2} fill="oklch(0.65 0.10 60)" />
          <line x1={30} y1={8} x2={36} y2={8} stroke="currentColor" />
        </svg>
      );
    case "button":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <rect x={2} y={6} width={20} height={12} rx={2} fill="oklch(0.32 0.02 250)" />
          <circle cx={12} cy={12} r={5} fill="oklch(0.7 0.20 25)" />
        </svg>
      );
    case "potentiometer":
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <circle cx={12} cy={12} r={9} fill="oklch(0.32 0.04 195)" stroke="currentColor" />
          <line x1={12} y1={12} x2={12} y2={5} stroke="var(--color-primary)" strokeWidth={2} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className="w-6 h-6">
          <rect x={3} y={6} width={18} height={12} rx={2} fill="oklch(0.32 0.02 250)" />
        </svg>
      );
  }
}
