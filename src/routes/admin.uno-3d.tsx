// Admin route: place pins on the Uno board's real top view (rendered from the
// imported STEP→GLB model). Pins are stored in the existing BoardEntry.pins
// array on the admin store, replacing the SVG-based Uno pin layout.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Plus, Trash2, Save, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Uno3DViewer, type Marker3D, type Uno3DViewerHandle } from "@/components/sim/Uno3DViewer";
import { Uno3DMaterialAudit } from "@/components/sim/Uno3DMaterialAudit";
import { useAdminStore, type VisualPin } from "@/sim/adminStore";

export const Route = createFileRoute("/admin/uno-3d")({
  head: () => ({
    meta: [
      { title: "Admin · Uno 3D Pin Editor" },
      { name: "description", content: "Place pins on the real Arduino Uno top view." },
    ],
  }),
  component: Uno3DAdminPage,
});

const TOP_W = 1000;
const TOP_H = 700;

const PIN_TYPES: VisualPin["type"][] = [
  "digital", "analog", "pwm", "power", "ground",
  "i2c-sda", "i2c-scl", "spi", "uart", "other",
];

function Uno3DAdminPage() {
  const hydrate = useAdminStore((s) => s.hydrate);
  const loaded = useAdminStore((s) => s.loaded);
  const boards = useAdminStore((s) => s.boards);
  const updateBoard = useAdminStore((s) => s.updateBoard);
  useEffect(() => { hydrate(); }, [hydrate]);

  const uno = boards.find((b) => b.id === "uno");

  // Local working copy so a misclick doesn't immediately corrupt persisted pins.
  const [pins, setPins] = useState<VisualPin[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  // Material audit panel: toggled via the toolbar; talks to the live scene
  // through the viewer's imperative handle.
  const viewerRef = useRef<Uno3DViewerHandle | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  // Hydrate pins from the existing Uno board entry once it's loaded. Pins are
  // stored in SVG-viewBox space; we re-use that same coordinate system for the
  // 3D top view so existing pin coordinates map without conversion (they're
  // just normalized by TOP_W/TOP_H).
  useEffect(() => {
    if (loaded && uno && pins.length === 0) {
      setPins(uno.pins ?? []);
    }
  }, [loaded, uno, pins.length]);

  const markers = useMemo<Marker3D[]>(
    () =>
      pins.map((p) => ({
        id: p.id,
        x: p.x,
        y: p.y,
        label: p.label,
        color: p.id === selectedId ? "#f59e0b" : (p.color ?? "#22c55e"),
      })),
    [pins, selectedId],
  );

  function handleTopViewClick(x: number, y: number) {
    // Add a new pin at the click. Snap to integer coordinates for clean values.
    const id = `pin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const next: VisualPin = {
      id,
      label: `P${pins.length + 1}`,
      type: "digital",
      x: Math.round(x),
      y: Math.round(y),
    };
    setPins((prev) => [...prev, next]);
    setSelectedId(id);
    setDirty(true);
  }

  function patchSelected(patch: Partial<VisualPin>) {
    if (!selectedId) return;
    setPins((prev) => prev.map((p) => (p.id === selectedId ? { ...p, ...patch } : p)));
    setDirty(true);
  }

  function deleteSelected() {
    if (!selectedId) return;
    setPins((prev) => prev.filter((p) => p.id !== selectedId));
    setSelectedId(null);
    setDirty(true);
  }

  function save() {
    if (!uno) return;
    updateBoard("uno", { pins });
    setDirty(false);
    toast.success(`Saved ${pins.length} pins to Uno board`);
  }

  const selected = pins.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <Link to="/admin" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="font-semibold">Uno 3D Pin Editor</h1>
        <span className="text-xs text-muted-foreground">click the top view to place pins</span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant={showAudit ? "default" : "outline"}
          onClick={() => setShowAudit((v) => !v)}
          title="Inspect GLB materials and reload colors"
        >
          <Palette className="h-3.5 w-3.5 mr-1.5" />
          Material audit
        </Button>
        <Button size="sm" disabled={!dirty} onClick={save}>
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {dirty ? "Save pins" : "Saved"}
        </Button>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_320px]">
        <section className="relative bg-muted/20 border-r border-border">
          <Uno3DViewer
            ref={viewerRef}
            topView
            topViewWidth={TOP_W}
            topViewHeight={TOP_H}
            onTopViewClick={handleTopViewClick}
            markers={markers}
          />
          {/* Floating audit panel — overlays the top-view, draggable feel via fixed position */}
          {showAudit && (
            <div className="absolute top-2 right-2 w-[340px] max-h-[calc(100%-1rem)] flex flex-col shadow-xl">
              <Uno3DMaterialAudit viewerRef={viewerRef} className="flex-1 min-h-0" />
            </div>
          )}
          <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wide text-muted-foreground bg-background/80 backdrop-blur px-2 py-1 rounded">
            top view (orthographic) · {TOP_W}×{TOP_H}
          </div>
          <div className="absolute bottom-2 left-2 text-[10px] text-muted-foreground bg-background/80 backdrop-blur px-2 py-1 rounded">
            <Plus className="inline h-3 w-3 mr-1" />click empty board area to add a pin
          </div>
        </section>

        <aside className="flex flex-col bg-card overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center">
            <span className="text-xs font-medium uppercase tracking-wide">Pins</span>
            <span className="ml-2 text-xs text-muted-foreground">{pins.length}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            {pins.length === 0 && (
              <div className="text-xs text-muted-foreground p-4 text-center">
                No pins yet. Click on the board top view to add the first pin.
              </div>
            )}
            <ul>
              {pins.map((p) => (
                <li
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`px-3 py-1.5 text-xs cursor-pointer border-b border-border/50 flex items-center gap-2 ${
                    p.id === selectedId ? "bg-primary/10" : "hover:bg-muted/40"
                  }`}
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{ background: p.color ?? "#22c55e" }}
                  />
                  <span className="font-mono">{p.label}</span>
                  <span className="text-muted-foreground">{p.type}</span>
                  <span className="ml-auto text-muted-foreground font-mono text-[10px]">
                    {p.x},{p.y}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {selected && (
            <Card className="m-2 p-3 space-y-2 rounded-md">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium">Edit pin</div>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={deleteSelected}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Label</Label>
                  <Input
                    value={selected.label}
                    onChange={(e) => patchSelected({ label: e.target.value })}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Pin #</Label>
                  <Input
                    type="number"
                    value={selected.number ?? ""}
                    onChange={(e) =>
                      patchSelected({ number: e.target.value === "" ? undefined : Number(e.target.value) })
                    }
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Type</Label>
                <Select value={selected.type} onValueChange={(v) => patchSelected({ type: v as VisualPin["type"] })}>
                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">X</Label>
                  <Input
                    type="number"
                    value={selected.x}
                    onChange={(e) => patchSelected({ x: Number(e.target.value) || 0 })}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Y</Label>
                  <Input
                    type="number"
                    value={selected.y}
                    onChange={(e) => patchSelected({ y: Number(e.target.value) || 0 })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Color</Label>
                <Input
                  value={selected.color ?? "#22c55e"}
                  onChange={(e) => patchSelected({ color: e.target.value })}
                  className="h-7 text-xs font-mono"
                />
              </div>
            </Card>
          )}
        </aside>
      </div>

      <Toaster />
    </div>
  );
}
