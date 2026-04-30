// PinAssignmentManager — list of all placed pins with quick property assignment.
// Supports bulk actions: select multiple pins via checkboxes, then assign or
// remove catalog properties on all of them at once. Sits next to the visual
// SVG editor so admins can place pins first, then manage labels, types, and
// multi-select catalog properties (single or in bulk) in one place.

import { useEffect, useMemo, useState } from "react";
import type { VisualPin } from "@/sim/adminStore";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { PinPropertyPicker } from "@/components/sim/PinPropertyPicker";
import {
  ChevronDown, ChevronRight, Trash2, Search,
  Plus, Minus, X, Loader2,
} from "lucide-react";
import { usePinPropertyStore, type PinProperty } from "@/sim/pinPropertyStore";
import { toast } from "sonner";

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
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const properties = usePinPropertyStore((s) => s.properties);
  const loaded = usePinPropertyStore((s) => s.loaded);
  const load = usePinPropertyStore((s) => s.load);

  useEffect(() => {
    if (!loaded) void load();
  }, [loaded, load]);

  const propByKey = useMemo(() => {
    const m = new Map<string, PinProperty>();
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
  const remove = (id: string) => {
    onChange(pins.filter((p) => p.id !== id));
    setBulkIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleOpen = (id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBulk = (id: string) => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((p) => bulkIds.has(p.id));
  const someFilteredSelected =
    !allFilteredSelected && filtered.some((p) => bulkIds.has(p.id));

  const toggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      // Clear only the filtered ones
      setBulkIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setBulkIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  const clearBulk = () => setBulkIds(new Set());

  // ---- Bulk operations -------------------------------------------------
  const bulkAddProperties = (keys: string[]) => {
    if (bulkIds.size === 0 || keys.length === 0) return;
    onChange(
      pins.map((p) => {
        if (!bulkIds.has(p.id)) return p;
        const cur = new Set(p.properties ?? []);
        keys.forEach((k) => cur.add(k));
        return { ...p, properties: Array.from(cur) };
      }),
    );
    toast.success(
      `Added ${keys.length} propert${keys.length === 1 ? "y" : "ies"} to ${bulkIds.size} pin${bulkIds.size === 1 ? "" : "s"}`,
    );
  };

  const bulkRemoveProperties = (keys: string[]) => {
    if (bulkIds.size === 0 || keys.length === 0) return;
    const remove = new Set(keys);
    onChange(
      pins.map((p) => {
        if (!bulkIds.has(p.id)) return p;
        return {
          ...p,
          properties: (p.properties ?? []).filter((k) => !remove.has(k)),
        };
      }),
    );
    toast.success(
      `Removed ${keys.length} propert${keys.length === 1 ? "y" : "ies"} from ${bulkIds.size} pin${bulkIds.size === 1 ? "" : "s"}`,
    );
  };

  const bulkClearProperties = () => {
    if (bulkIds.size === 0) return;
    onChange(
      pins.map((p) => (bulkIds.has(p.id) ? { ...p, properties: [] } : p)),
    );
    toast.success(`Cleared properties on ${bulkIds.size} pin${bulkIds.size === 1 ? "" : "s"}`);
  };

  const bulkSetType = (type: VisualPin["type"]) => {
    if (bulkIds.size === 0) return;
    onChange(pins.map((p) => (bulkIds.has(p.id) ? { ...p, type } : p)));
    toast.success(`Set type to "${type}" on ${bulkIds.size} pin${bulkIds.size === 1 ? "" : "s"}`);
  };

  const bulkDelete = () => {
    if (bulkIds.size === 0) return;
    if (!confirm(`Delete ${bulkIds.size} pin${bulkIds.size === 1 ? "" : "s"}?`)) return;
    onChange(pins.filter((p) => !bulkIds.has(p.id)));
    setBulkIds(new Set());
  };

  // Properties shared across ALL selected pins (for the Remove picker default).
  const sharedSelectedProps = useMemo(() => {
    if (bulkIds.size === 0) return [] as string[];
    let common: Set<string> | null = null;
    for (const p of pins) {
      if (!bulkIds.has(p.id)) continue;
      const set = new Set(p.properties ?? []);
      if (common === null) common = set;
      else common = new Set([...common].filter((k) => set.has(k)));
    }
    return common ? Array.from(common) : [];
  }, [pins, bulkIds]);

  // Union of properties on selected pins (for the Remove picker pool).
  const unionSelectedProps = useMemo(() => {
    const u = new Set<string>();
    pins.forEach((p) => {
      if (bulkIds.has(p.id)) (p.properties ?? []).forEach((k) => u.add(k));
    });
    return Array.from(u);
  }, [pins, bulkIds]);

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

        {pins.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <Checkbox
                checked={
                  allFilteredSelected
                    ? true
                    : someFilteredSelected
                      ? ("indeterminate" as unknown as boolean)
                      : false
                }
                onCheckedChange={toggleSelectAllFiltered}
              />
              <span className="text-muted-foreground">
                Select{filter ? " filtered" : " all"}
              </span>
            </label>
            {bulkIds.size > 0 && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-medium">{bulkIds.size} selected</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center"
                  onClick={clearBulk}
                  aria-label="Clear selection"
                >
                  <X className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        )}

        {bulkIds.size > 0 && (
          <BulkToolbar
            count={bulkIds.size}
            onAddProperties={bulkAddProperties}
            onRemoveProperties={bulkRemoveProperties}
            onClearProperties={bulkClearProperties}
            onSetType={bulkSetType}
            onDelete={bulkDelete}
            unionSelectedProps={unionSelectedProps}
            sharedSelectedProps={sharedSelectedProps}
          />
        )}
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
              const isBulk = bulkIds.has(p.id);
              const props = p.properties ?? [];
              return (
                <li
                  key={p.id}
                  className={
                    "px-2 py-1.5 transition-colors " +
                    (isBulk
                      ? "bg-primary/10"
                      : isSelected
                        ? "bg-primary/5"
                        : "hover:bg-muted/40")
                  }
                >
                  <div className="flex items-center gap-1.5">
                    <Checkbox
                      checked={isBulk}
                      onCheckedChange={() => toggleBulk(p.id)}
                      aria-label={`Select ${p.label} for bulk actions`}
                      className="shrink-0"
                    />
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
                    <div className="flex flex-wrap gap-1 mt-1 ml-12">
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
                    <div className="mt-2 ml-12 space-y-2 pb-2">
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

/* ---------------- Bulk toolbar ---------------- */

function BulkToolbar({
  count,
  onAddProperties,
  onRemoveProperties,
  onClearProperties,
  onSetType,
  onDelete,
  unionSelectedProps,
  sharedSelectedProps,
}: {
  count: number;
  onAddProperties: (keys: string[]) => void;
  onRemoveProperties: (keys: string[]) => void;
  onClearProperties: () => void;
  onSetType: (type: VisualPin["type"]) => void;
  onDelete: () => void;
  unionSelectedProps: string[];
  sharedSelectedProps: string[];
}) {
  return (
    <div className="rounded-md border border-primary/40 bg-primary/5 p-2 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Bulk actions ({count})
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <BulkAddPropsPopover onApply={onAddProperties} />
        <BulkRemovePropsPopover
          unionKeys={unionSelectedProps}
          sharedKeys={sharedSelectedProps}
          onApply={onRemoveProperties}
          onClearAll={onClearProperties}
        />
        <Select onValueChange={(v) => onSetType(v as VisualPin["type"])}>
          <SelectTrigger className="h-7 text-xs w-[110px]">
            <SelectValue placeholder="Set type…" />
          </SelectTrigger>
          <SelectContent>
            {PIN_TYPES.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 ml-auto"
          onClick={onDelete}
        >
          <Trash2 className="h-3 w-3 mr-1" /> Delete
        </Button>
      </div>
    </div>
  );
}

/** Popover that picks any catalog properties to ADD to the bulk selection. */
function BulkAddPropsPopover({ onApply }: { onApply: (keys: string[]) => void }) {
  const properties = usePinPropertyStore((s) => s.properties);
  const loaded = usePinPropertyStore((s) => s.loaded);
  const load = usePinPropertyStore((s) => s.load);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded, load]);

  useEffect(() => {
    if (!open) { setPicked(new Set()); setFilter(""); }
  }, [open]);

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = f
      ? properties.filter(
          (p) =>
            p.label.toLowerCase().includes(f) ||
            p.key.toLowerCase().includes(f) ||
            p.category.toLowerCase().includes(f),
        )
      : properties;
    const map = new Map<string, PinProperty[]>();
    for (const p of list) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [properties, filter]);

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const apply = () => {
    if (picked.size === 0) return;
    onApply(Array.from(picked));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Add properties
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-8 mb-2"
        />
        <div className="max-h-64 overflow-y-auto pr-1 space-y-2">
          {!loaded ? (
            <div className="text-xs text-muted-foreground flex items-center gap-2 p-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading catalog…
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-xs text-muted-foreground p-2">No properties match.</div>
          ) : (
            grouped.map(([cat, items]) => (
              <div key={cat}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-0.5">
                  {cat}
                </div>
                <div className="space-y-0.5">
                  {items.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/60 cursor-pointer"
                    >
                      <Checkbox
                        checked={picked.has(p.key)}
                        onCheckedChange={() => toggle(p.key)}
                      />
                      <span className="flex-1 text-xs flex items-center gap-1.5">
                        {p.color && (
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-sm border border-border"
                            style={{ background: p.color }}
                          />
                        )}
                        <span className="font-medium">{p.label}</span>
                        <span className="text-muted-foreground">{p.key}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-border">
          <span className="text-[11px] text-muted-foreground">
            {picked.size} picked
          </span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" className="h-7 text-xs" disabled={picked.size === 0} onClick={apply}>
              Add to selected
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Popover that picks properties to REMOVE from the bulk selection. */
function BulkRemovePropsPopover({
  unionKeys,
  sharedKeys,
  onApply,
  onClearAll,
}: {
  unionKeys: string[];
  sharedKeys: string[];
  onApply: (keys: string[]) => void;
  onClearAll: () => void;
}) {
  const properties = usePinPropertyStore((s) => s.properties);
  const propByKey = useMemo(() => {
    const m = new Map<string, PinProperty>();
    properties.forEach((p) => m.set(p.key, p));
    return m;
  }, [properties]);

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) setPicked(new Set());
  }, [open]);

  const toggle = (key: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const apply = () => {
    if (picked.size === 0) return;
    onApply(Array.from(picked));
    setOpen(false);
  };

  const sharedSet = useMemo(() => new Set(sharedKeys), [sharedKeys]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 text-xs" disabled={unionKeys.length === 0}>
          <Minus className="h-3 w-3 mr-1" /> Remove properties
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        {unionKeys.length === 0 ? (
          <div className="text-xs text-muted-foreground p-2">
            No properties on the selected pins.
          </div>
        ) : (
          <>
            <div className="text-[11px] text-muted-foreground mb-1.5 px-1">
              Pick properties to remove. <span className="font-medium">●</span> = on every selected pin.
            </div>
            <div className="max-h-64 overflow-y-auto pr-1 space-y-0.5">
              {unionKeys.map((k) => {
                const meta = propByKey.get(k);
                const onAll = sharedSet.has(k);
                return (
                  <label
                    key={k}
                    className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/60 cursor-pointer"
                  >
                    <Checkbox
                      checked={picked.has(k)}
                      onCheckedChange={() => toggle(k)}
                    />
                    <span className="flex-1 text-xs flex items-center gap-1.5">
                      {meta?.color && (
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm border border-border"
                          style={{ background: meta.color }}
                        />
                      )}
                      <span className="font-medium">{meta?.label ?? k}</span>
                      <span className="text-muted-foreground">{k}</span>
                    </span>
                    {onAll && <span className="text-[10px] text-primary">●</span>}
                  </label>
                );
              })}
            </div>
          </>
        )}
        <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-border">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive"
            onClick={() => { onClearAll(); setOpen(false); }}
          >
            Clear all
          </Button>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={picked.size === 0}
              onClick={apply}
            >
              Remove
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
