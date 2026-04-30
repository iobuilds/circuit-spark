// PinPropertyPicker — multi-select chips for pin functions, sourced from the
// shared Lovable Cloud catalog. Lets the admin tick existing properties and
// add brand-new ones inline (which then become available everywhere).

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, Loader2, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { usePinPropertyStore, type PinProperty } from "@/sim/pinPropertyStore";

interface Props {
  /** Array of catalog property keys currently assigned to this pin. */
  value: string[];
  onChange: (next: string[]) => void;
}

export function PinPropertyPicker({ value, onChange }: Props) {
  const properties = usePinPropertyStore((s) => s.properties);
  const loaded = usePinPropertyStore((s) => s.loaded);
  const loading = usePinPropertyStore((s) => s.loading);
  const load = usePinPropertyStore((s) => s.load);
  const add = usePinPropertyStore((s) => s.add);
  const remove = usePinPropertyStore((s) => s.remove);

  const [filter, setFilter] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("custom");
  const [newColor, setNewColor] = useState("#6b7280");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loaded && !loading) void load();
  }, [loaded, loading, load]);

  const grouped = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const filtered = f
      ? properties.filter(
          (p) =>
            p.label.toLowerCase().includes(f) ||
            p.key.toLowerCase().includes(f) ||
            p.category.toLowerCase().includes(f),
        )
      : properties;
    const map = new Map<string, PinProperty[]>();
    for (const p of filtered) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [properties, filter]);

  const toggle = (key: string) => {
    if (value.includes(key)) onChange(value.filter((k) => k !== key));
    else onChange([...value, key]);
  };

  const propByKey = useMemo(() => {
    const m = new Map<string, PinProperty>();
    properties.forEach((p) => m.set(p.key, p));
    return m;
  }, [properties]);

  const submitNew = async () => {
    const key = newKey.trim().toLowerCase();
    const label = newLabel.trim();
    if (!key || !label) {
      toast.error("Key and label are required");
      return;
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(key)) {
      toast.error("Key must be lowercase letters, digits, dash or underscore");
      return;
    }
    setBusy(true);
    const created = await add({
      key,
      label,
      category: newCategory.trim() || "custom",
      color: newColor || null,
    });
    setBusy(false);
    if (created) {
      onChange([...value, created.key]);
      setNewKey("");
      setNewLabel("");
      setShowAdd(false);
      toast.success(`Added "${created.label}" to the catalog`);
    } else {
      toast.error("Could not add property (key may already exist)");
    }
  };

  const handleRemove = async (id: string, label: string) => {
    if (!confirm(`Remove "${label}" from the catalog? This cannot be undone.`)) return;
    const ok = await remove(id);
    if (ok) toast.success(`Removed "${label}"`);
    else toast.error("Built-in properties cannot be deleted");
  };

  return (
    <div className="space-y-2">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
        Pin properties (multi-select)
      </Label>

      {/* Selected chips */}
      <div className="flex flex-wrap gap-1 min-h-[28px] p-1.5 rounded-md border border-border bg-muted/30">
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground px-1">No properties assigned</span>
        )}
        {value.map((k) => {
          const p = propByKey.get(k);
          return (
            <span
              key={k}
              className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border"
              style={{
                borderColor: p?.color ?? "hsl(var(--border))",
                color: p?.color ?? undefined,
                background: p?.color ? `${p.color}15` : undefined,
              }}
            >
              {p?.label ?? k}
              <button
                type="button"
                className="opacity-60 hover:opacity-100"
                onClick={() => toggle(k)}
                aria-label={`Remove ${k}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>

      {/* Picker popover */}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 w-full justify-start">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add / edit properties
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <Input
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 mb-2"
          />
          <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
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
                    {items.map((p) => {
                      const checked = value.includes(p.key);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-muted/60 group"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggle(p.key)}
                            id={`prop-${p.id}`}
                          />
                          <label
                            htmlFor={`prop-${p.id}`}
                            className="flex-1 text-xs flex items-center gap-1.5 cursor-pointer"
                          >
                            {p.color && (
                              <span
                                className="inline-block h-2.5 w-2.5 rounded-sm border border-border"
                                style={{ background: p.color }}
                              />
                            )}
                            <span className="font-medium">{p.label}</span>
                            <span className="text-muted-foreground">{p.key}</span>
                          </label>
                          {!p.builtin && (
                            <button
                              type="button"
                              className="opacity-0 group-hover:opacity-60 hover:opacity-100"
                              onClick={() => handleRemove(p.id, p.label)}
                              aria-label={`Delete ${p.label}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border mt-2 pt-2">
            {!showAdd ? (
              <Button
                size="sm"
                variant="ghost"
                className="w-full justify-start h-8"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" /> New property…
              </Button>
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <Input
                    placeholder="key (e.g. can-tx)"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="Label (e.g. CAN TX)"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <Input
                    placeholder="category"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    className="h-8 w-12 p-0.5"
                  />
                </div>
                <div className="flex gap-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 h-8"
                    onClick={() => setShowAdd(false)}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" className="flex-1 h-8" onClick={submitNew} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
