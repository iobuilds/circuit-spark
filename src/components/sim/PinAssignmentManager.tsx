// PinAssignmentManager — list of all placed pins with quick property assignment.
// Sits next to the visual SVG editor so admins can place pins first, then
// manage labels, types, and multi-select catalog properties in one place.

import { useEffect, useMemo, useState } from "react";
import type { VisualPin } from "@/sim/adminStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PinPropertyPicker } from "@/components/sim/PinPropertyPicker";
import { ChevronDown, ChevronRight, Trash2, Search } from "lucide-react";
import { usePinPropertyStore } from "@/sim/pinPropertyStore";

const PIN_TYPES: VisualPin["type"][] = [
  "digital", "analog", "pwm", "power", "ground",
  "i2c-sda", "i2c-scl", "spi", "uart", "other",
];

interface Props {
  pins: VisualPin[];
  onChange: (next: VisualPin[]) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

export function PinAssignmentManager({ pins, onChange, selectedId, onSelect }: Props) {
  const [filter, setFilter] = useState("");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const properties = usePinPropertyStore((s) => s.properties);
  const loaded = usePinPropertyStore((s) => s.loaded);
  const load = usePinPropertyStore((s) => s.load);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const propByKey = useMemo(() => {
    const m = new Map<string, (typeof properties)[number]>();
    properties.forEach((p) => m.set(p.key, p));
    return m;
  }, [properties]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return pins;
    return pins.filter(
      (p) =>
        p.label.toLowerCase().includes(f) ||
        p.id.toLowerCase().includes(f) ||
        p.type.toLowerCase().includes(f) ||
        (p.properties ?? []).some((k) => k.toLowerCase().includes(f)),
    );
  }, [pins, filter]);

  const update = (id: string, patch: Partial<VisualPin>) => {
    onChange(pins.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };
  const remove = (id: string) => onChange(pins.filter((p) => p.id !== id));

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="border border-border rounded-lg bg-card flex flex-col h-full min-h-0">
      <div className="p-2.5 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Pin Assignments</h3>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {pins.length} pin{pins.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filter by label, type, property…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {pins.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 text-center">
            No pins yet. Use <strong>Add Pin</strong> in the editor and click on the
            board to place pins. They will appear here for property assignment.
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-muted-foreground p-4 text-center">
            No pins match your filter.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((p) => {
              const isOpen = openIds.has(p.id) || selectedId === p.id;
              const isSelected = selectedId === p.id;
              const props = p.properties ?? [];
              return (
                <li
                  key={p.id}
                  className={
                    "px-2 py-1.5 transition-colors " +
                    (isSelected ? "bg-primary/5" : "hover:bg-muted/40")
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      className="p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() => toggleOpen(p.id)}
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <span
                      className="inline-block h-3 w-3 rounded-full border border-border shrink-0"
                      style={{ background: p.color ?? "#6b7280" }}
                    />
                    <button
                      type="button"
                      className="flex-1 text-left text-xs font-medium truncate hover:text-primary"
                      onClick={() => onSelect?.(p.id)}
                      title={`${p.label} (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`}
                    >
                      {p.label || <span className="text-muted-foreground">Unnamed</span>}
                      <span className="text-muted-foreground font-normal ml-1.5">
                        {p.type}
                      </span>
                    </button>
                    {props.length > 0 && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {props.length}
                      </span>
                    )}
                    <button
                      type="button"
                      className="p-1 text-muted-foreground hover:text-destructive"
                      onClick={() => remove(p.id)}
                      aria-label={`Delete ${p.label}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Inline property chips when collapsed */}
                  {!isOpen && props.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 ml-7">
                      {props.slice(0, 6).map((k) => {
                        const meta = propByKey.get(k);
                        return (
                          <span
                            key={k}
                            className="text-[10px] px-1 py-px rounded border"
                            style={{
                              borderColor: meta?.color ?? "hsl(var(--border))",
                              color: meta?.color ?? undefined,
                              background: meta?.color ? `${meta.color}15` : undefined,
                            }}
                          >
                            {meta?.label ?? k}
                          </span>
                        );
                      })}
                      {props.length > 6 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{props.length - 6}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Expanded editor */}
                  {isOpen && (
                    <div className="mt-2 ml-7 space-y-2 pb-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Label</Label>
                          <Input
                            value={p.label}
                            onChange={(e) => update(p.id, { label: e.target.value })}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</Label>
                          <Select
                            value={p.type}
                            onValueChange={(v) => update(p.id, { type: v as VisualPin["type"] })}
                          >
                            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PIN_TYPES.map((t) => (
                                <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Number</Label>
                          <Input
                            type="number"
                            value={p.number ?? ""}
                            onChange={(e) =>
                              update(p.id, {
                                number: e.target.value === "" ? undefined : Number(e.target.value),
                              })
                            }
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">X</Label>
                          <Input
                            type="number"
                            value={p.x}
                            step="0.1"
                            onChange={(e) => update(p.id, { x: Number(e.target.value) })}
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Y</Label>
                          <Input
                            type="number"
                            value={p.y}
                            step="0.1"
                            onChange={(e) => update(p.id, { y: Number(e.target.value) })}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Color</Label>
                        <Input
                          type="color"
                          value={p.color ?? "#6b7280"}
                          onChange={(e) => update(p.id, { color: e.target.value })}
                          className="h-7 w-20 p-0.5"
                        />
                      </div>

                      <PinPropertyPicker
                        value={p.properties ?? []}
                        onChange={(next) => update(p.id, { properties: next })}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
