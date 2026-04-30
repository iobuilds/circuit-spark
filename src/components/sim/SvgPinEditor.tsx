// SVG Pin Editor — a self-contained component for the admin Board/Component editor.
//
// Features (Part A, full scope):
//   * Drag-and-drop SVG upload with validation
//   * Renders SVG inside an 800x600 canvas at its natural aspect ratio
//   * Mouse-wheel zoom, +/- buttons, "Fit", and Space+drag panning
//   * Toggleable dot-grid overlay with selectable grid size + snap-to-grid
//   * Modes: [Add Pin] (crosshair, click to place) / [Select] (click to select / drag pins)
//   * Pin markers with labels, color, selection ring
//   * Pin Properties popover (id, label, type, number, color, notes)
//   * Delete selected pin
//   * "Edit SVG markup" drawer with live preview
//
// Coordinates: pins are stored in the SVG's natural user-space (viewBox units).
// This makes them stable across zoom/pan and useful for the simulator runtime.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  MousePointer2, Plus, Trash2, ZoomIn, ZoomOut, Maximize2,
  Grid3x3, Code2, Upload, X, Image as ImageIcon,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignHorizontalSpaceBetween, AlignVerticalSpaceBetween,
} from "lucide-react";
import { toast } from "sonner";
import type { VisualPin } from "@/sim/adminStore";
import { PngToSvgConverter } from "@/components/sim/PngToSvgConverter";
import { PinPropertyPicker } from "@/components/sim/PinPropertyPicker";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CANVAS_W = 800;
const CANVAS_H = 600;
const BLANK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" preserveAspectRatio="xMidYMid meet">' +
  '<rect x="0" y="0" width="360" height="240" rx="8" fill="hsl(220 14% 96%)" stroke="hsl(220 13% 80%)" stroke-width="0.6"/>' +
  '<text x="180" y="124" text-anchor="middle" font-family="monospace" font-size="11" fill="hsl(220 9% 46%)">Blank canvas — place pins or edit SVG markup</text>' +
  "</svg>";
const PIN_TYPES: VisualPin["type"][] = [
  "digital", "analog", "pwm", "power", "ground",
  "i2c-sda", "i2c-scl", "spi", "uart", "other",
];
const TYPE_COLORS: Record<VisualPin["type"], string> = {
  digital: "#22c55e",
  analog: "#3b82f6",
  pwm: "#a855f7",
  power: "#ef4444",
  ground: "#111827",
  "i2c-sda": "#f59e0b",
  "i2c-scl": "#f59e0b",
  spi: "#06b6d4",
  uart: "#ec4899",
  other: "#6b7280",
};

interface SvgPinEditorProps {
  svg: string | undefined;
  pins: VisualPin[];
  onChange: (next: { svg?: string; pins: VisualPin[] }) => void;
}

type Mode = "select" | "add";

export function SvgPinEditor({ svg, pins, onChange }: SvgPinEditorProps) {
  const [mode, setMode] = useState<Mode>("select");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = useState(false);
  const [snap, setSnap] = useState(false);
  const [gridSize, setGridSize] = useState(10);
  const [selectedPin, setSelectedPin] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerSvg, setDrawerSvg] = useState(svg ?? "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  /** Pin currently being dragged (set on mousedown over a pin marker). */
  const [dragPinId, setDragPinId] = useState<string | null>(null);
  const dragStateRef = useRef<{
    startX: number; startY: number; moved: boolean;
    origin?: Map<string, { x: number; y: number }>;
  } | null>(null);
  // Marquee rubber-band selection (in screen px relative to canvas container)
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const marqueeRef = useRef<{ additive: boolean; baseline: Set<string> } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panStartRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  // Parse the SVG once to extract its natural viewBox dimensions so pin
  // coordinates always live in user-space units.
  const svgInfo = useMemo(() => parseSvgInfo(svg), [svg]);

  // ---- Keyboard handlers (Space for pan, Delete for selected) ----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !isTypingTarget(e.target)) {
        if (selectedIds.size > 0) {
          e.preventDefault();
          deleteSelected();
        } else if (selectedPin) {
          e.preventDefault();
          deletePin(selectedPin);
        }
      }
      if ((e.key === "a" || e.key === "A") && (e.ctrlKey || e.metaKey) && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSelectedIds(new Set(pins.map((p) => p.id)));
      }
      if (e.key === "Escape") {
        setSelectedIds(new Set());
        setSelectedPin(null);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPin, selectedIds, pins]);

  // ---- Upload handlers (.svg only; PNG goes through PngToSvgConverter) ----
  const handleFiles = useCallback((files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    const isSvg = f.name.toLowerCase().endsWith(".svg") || f.type === "image/svg+xml";
    if (!isSvg) {
      toast.error("Use 'Add SVG / Convert PNG' for raster images");
      return;
    }
    f.text().then((txt) => {
      if (!txt.includes("<svg")) {
        toast.error("File does not contain an <svg> element");
        return;
      }
      onChange({ svg: txt, pins });
      setDrawerSvg(txt);
      toast.success("SVG uploaded");
      setZoom(1);
      setPan({ x: 0, y: 0 });
    });
  }, [onChange, pins]);

  const acceptConvertedSvg = useCallback((svg: string) => {
    onChange({ svg, pins });
    setDrawerSvg(svg);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    toast.success("Converted PNG → SVG");
  }, [onChange, pins]);

  // ---- Coordinate conversion: screen px -> SVG user-space ----
  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el || !svgInfo) return null;
    const rect = el.getBoundingClientRect();
    // Centered canvas with pan + zoom. The SVG fills the canvas with object-fit: contain.
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    // Reverse the transform applied to the inner stage:
    //   stage = translate(pan) * translate(center) * scale(zoom) * translate(-center)
    // For coordinates inside the unzoomed canvas frame:
    const localX = (cx - pan.x - CANVAS_W / 2) / zoom + CANVAS_W / 2;
    const localY = (cy - pan.y - CANVAS_H / 2) / zoom + CANVAS_H / 2;
    // Convert canvas coords -> SVG user-space using the contain-fit factor
    const fit = computeFit(svgInfo.vbWidth, svgInfo.vbHeight);
    const svgX = (localX - fit.offsetX) / fit.scale + svgInfo.vbX;
    const svgY = (localY - fit.offsetY) / fit.scale + svgInfo.vbY;
    return { x: svgX, y: svgY };
  }, [pan, zoom, svgInfo]);

  // ---- Canvas mouse interactions ----
  function handleCanvasMouseDown(e: React.MouseEvent) {
    if (spaceDown || e.button === 1) {
      e.preventDefault();
      panStartRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      setPanning(true);
      return;
    }
    if (mode === "add" && svgInfo) {
      const p = screenToSvg(e.clientX, e.clientY);
      if (!p) return;
      const snapped = snap ? snapPoint(p, gridSize, svgInfo) : p;
      const id = `pin-${Math.random().toString(36).slice(2, 8)}`;
      const newPin: VisualPin = {
        id,
        label: `P${pins.length + 1}`,
        type: "digital",
        x: round1(snapped.x),
        y: round1(snapped.y),
        color: TYPE_COLORS.digital,
      };
      onChange({ svg, pins: [...pins, newPin] });
      setSelectedPin(id);
      setPopoverOpen(true);
      return;
    }
    // Select mode: start marquee on empty canvas
    if (mode === "select") {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      marqueeRef.current = {
        additive: e.shiftKey || e.metaKey || e.ctrlKey,
        baseline: new Set(selectedIds),
      };
      setMarquee({ x0: x, y0: y, x1: x, y1: y });
      if (!(e.shiftKey || e.metaKey || e.ctrlKey)) {
        setSelectedIds(new Set());
        setSelectedPin(null);
      }
    }
  }
  function handleCanvasMouseMove(e: React.MouseEvent) {
    if (panning && panStartRef.current) {
      setPan({
        x: panStartRef.current.px + (e.clientX - panStartRef.current.x),
        y: panStartRef.current.py + (e.clientY - panStartRef.current.y),
      });
      return;
    }
    if (dragPinId && dragStateRef.current && svgInfo) {
      const dx = e.clientX - dragStateRef.current.startX;
      const dy = e.clientY - dragStateRef.current.startY;
      if (!dragStateRef.current.moved && Math.hypot(dx, dy) < 3) return;
      dragStateRef.current.moved = true;
      const p = screenToSvg(e.clientX, e.clientY);
      if (!p) return;
      const origin = dragStateRef.current.origin;
      // If multi-selected and the dragged pin is part of selection, move all together
      const movingIds = selectedIds.has(dragPinId) && selectedIds.size > 1
        ? selectedIds
        : new Set([dragPinId]);
      // Compute delta in SVG space relative to origin of dragged pin
      const originPin = origin?.get(dragPinId);
      if (!originPin) return;
      const startSvg = screenToSvg(dragStateRef.current.startX, dragStateRef.current.startY);
      if (!startSvg) return;
      let dxS = p.x - startSvg.x;
      let dyS = p.y - startSvg.y;
      if (snap) {
        dxS = Math.round(dxS / gridSize) * gridSize;
        dyS = Math.round(dyS / gridSize) * gridSize;
      }
      const minX = svgInfo.vbX;
      const maxX = svgInfo.vbX + svgInfo.vbWidth;
      const minY = svgInfo.vbY;
      const maxY = svgInfo.vbY + svgInfo.vbHeight;
      onChange({
        svg,
        pins: pins.map((p2) => {
          if (!movingIds.has(p2.id)) return p2;
          const o = origin?.get(p2.id);
          if (!o) return p2;
          const nx = Math.max(minX, Math.min(maxX, o.x + dxS));
          const ny = Math.max(minY, Math.min(maxY, o.y + dyS));
          return { ...p2, x: round1(nx), y: round1(ny) };
        }),
      });
      if (popoverOpen) setPopoverOpen(false);
      return;
    }
    if (marquee && marqueeRef.current) {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setMarquee({ ...marquee, x1: e.clientX - rect.left, y1: e.clientY - rect.top });
    }
  }
  function handleCanvasMouseUp() {
    panStartRef.current = null;
    setPanning(false);
    if (dragPinId) {
      if (dragStateRef.current && !dragStateRef.current.moved) {
        setSelectedPin(dragPinId);
        setPopoverOpen(true);
      }
      setDragPinId(null);
      dragStateRef.current = null;
    }
    if (marquee && marqueeRef.current && svgInfo) {
      // Compute selection from marquee rect (canvas px → svg space → match pins)
      const fit = computeFit(svgInfo.vbWidth, svgInfo.vbHeight);
      const toSvg = (cx: number, cy: number) => {
        const localX = (cx - pan.x - CANVAS_W / 2) / zoom + CANVAS_W / 2;
        const localY = (cy - pan.y - CANVAS_H / 2) / zoom + CANVAS_H / 2;
        return {
          x: (localX - fit.offsetX) / fit.scale + svgInfo.vbX,
          y: (localY - fit.offsetY) / fit.scale + svgInfo.vbY,
        };
      };
      const a = toSvg(marquee.x0, marquee.y0);
      const b = toSvg(marquee.x1, marquee.y1);
      const xMin = Math.min(a.x, b.x), xMax = Math.max(a.x, b.x);
      const yMin = Math.min(a.y, b.y), yMax = Math.max(a.y, b.y);
      const tiny = Math.abs(marquee.x0 - marquee.x1) < 3 && Math.abs(marquee.y0 - marquee.y1) < 3;
      if (!tiny) {
        const hits = pins.filter((p) => p.x >= xMin && p.x <= xMax && p.y >= yMin && p.y <= yMax).map((p) => p.id);
        const baseline = marqueeRef.current.baseline;
        const next = marqueeRef.current.additive
          ? new Set([...baseline, ...hits])
          : new Set(hits);
        setSelectedIds(next);
        if (hits.length > 0) setSelectedPin(hits[hits.length - 1]);
      }
      setMarquee(null);
      marqueeRef.current = null;
    }
  }
  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    setZoom((z) => Math.max(0.2, Math.min(8, z * factor)));
  }

  function fitToScreen() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function deletePin(id: string) {
    onChange({ svg, pins: pins.filter((p) => p.id !== id) });
    if (selectedPin === id) setSelectedPin(null);
    setPopoverOpen(false);
  }
  function updatePin(id: string, patch: Partial<VisualPin>) {
    onChange({
      svg,
      pins: pins.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  }

  function deleteSelected() {
    if (selectedIds.size === 0) return;
    onChange({ svg, pins: pins.filter((p) => !selectedIds.has(p.id)) });
    setSelectedIds(new Set());
    setSelectedPin(null);
    setPopoverOpen(false);
  }

  type AlignOp = "left" | "right" | "top" | "bottom" | "centerH" | "centerV"
    | "distH" | "distV";
  function alignSelection(op: AlignOp) {
    if (selectedIds.size < 2) {
      toast.error("Select 2+ pins to align");
      return;
    }
    const sel = pins.filter((p) => selectedIds.has(p.id));
    if ((op === "distH" || op === "distV") && sel.length < 3) {
      toast.error("Select 3+ pins to distribute");
      return;
    }
    const xs = sel.map((p) => p.x);
    const ys = sel.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let updates = new Map<string, { x?: number; y?: number }>();
    if (op === "left") sel.forEach((p) => updates.set(p.id, { x: minX }));
    else if (op === "right") sel.forEach((p) => updates.set(p.id, { x: maxX }));
    else if (op === "top") sel.forEach((p) => updates.set(p.id, { y: minY }));
    else if (op === "bottom") sel.forEach((p) => updates.set(p.id, { y: maxY }));
    else if (op === "centerV") sel.forEach((p) => updates.set(p.id, { x: cx }));
    else if (op === "centerH") sel.forEach((p) => updates.set(p.id, { y: cy }));
    else if (op === "distH") {
      const sorted = [...sel].sort((a, b) => a.x - b.x);
      const step = (sorted[sorted.length - 1].x - sorted[0].x) / (sorted.length - 1);
      sorted.forEach((p, i) => updates.set(p.id, { x: sorted[0].x + step * i }));
    } else if (op === "distV") {
      const sorted = [...sel].sort((a, b) => a.y - b.y);
      const step = (sorted[sorted.length - 1].y - sorted[0].y) / (sorted.length - 1);
      sorted.forEach((p, i) => updates.set(p.id, { y: sorted[0].y + step * i }));
    }
    onChange({
      svg,
      pins: pins.map((p) => {
        const u = updates.get(p.id);
        if (!u) return p;
        return {
          ...p,
          x: u.x !== undefined ? round1(u.x) : p.x,
          y: u.y !== undefined ? round1(u.y) : p.y,
        };
      }),
    });
  }

  function applySvgMarkup() {
    if (!drawerSvg.includes("<svg")) {
      toast.error("Markup must contain an <svg> root element");
      return;
    }
    onChange({ svg: drawerSvg, pins });
    toast.success("SVG markup applied");
    setDrawerOpen(false);
  }

  function clearSvg() {
    onChange({ svg: undefined, pins: [] });
    setDrawerSvg("");
    setSelectedPin(null);
  }

  // ---- Render ----
  if (!svg) {
    return (
      <UploadZone
        onFiles={handleFiles}
        fileRef={fileRef}
        onStartBlank={() => onChange({ svg: BLANK_SVG, pins })}
        onConvertedSvg={acceptConvertedSvg}
      />
    );
  }

  const fit = svgInfo ? computeFit(svgInfo.vbWidth, svgInfo.vbHeight) : null;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 border border-border rounded-lg bg-card">
        <ToolButton active={mode === "add"} onClick={() => setMode("add")} icon={<Plus className="h-4 w-4" />}>
          Add Pin
        </ToolButton>
        <ToolButton active={mode === "select"} onClick={() => setMode("select")} icon={<MousePointer2 className="h-4 w-4" />}>
          Select
        </ToolButton>
        <Button
          size="sm"
          variant="outline"
          className="h-8"
          disabled={!selectedPin && selectedIds.size === 0}
          onClick={() => {
            if (selectedIds.size > 0) deleteSelected();
            else if (selectedPin) deletePin(selectedPin);
          }}
        >
          <Trash2 className="h-4 w-4 mr-1.5" />
          Delete{selectedIds.size > 1 ? ` (${selectedIds.size})` : ""}
        </Button>

        <div className="h-6 w-px bg-border mx-1" />

        <div className="flex items-center gap-0.5">
          <AlignBtn title="Align left" disabled={selectedIds.size < 2} onClick={() => alignSelection("left")}>
            <AlignStartVertical className="h-4 w-4" />
          </AlignBtn>
          <AlignBtn title="Align center (vertical axis)" disabled={selectedIds.size < 2} onClick={() => alignSelection("centerV")}>
            <AlignCenterVertical className="h-4 w-4" />
          </AlignBtn>
          <AlignBtn title="Align right" disabled={selectedIds.size < 2} onClick={() => alignSelection("right")}>
            <AlignEndVertical className="h-4 w-4" />
          </AlignBtn>
          <div className="w-1" />
          <AlignBtn title="Align top" disabled={selectedIds.size < 2} onClick={() => alignSelection("top")}>
            <AlignStartHorizontal className="h-4 w-4" />
          </AlignBtn>
          <AlignBtn title="Align middle (horizontal axis)" disabled={selectedIds.size < 2} onClick={() => alignSelection("centerH")}>
            <AlignCenterHorizontal className="h-4 w-4" />
          </AlignBtn>
          <AlignBtn title="Align bottom" disabled={selectedIds.size < 2} onClick={() => alignSelection("bottom")}>
            <AlignEndHorizontal className="h-4 w-4" />
          </AlignBtn>
          <div className="w-1" />
          <AlignBtn title="Distribute horizontally" disabled={selectedIds.size < 3} onClick={() => alignSelection("distH")}>
            <AlignHorizontalSpaceBetween className="h-4 w-4" />
          </AlignBtn>
          <AlignBtn title="Distribute vertically" disabled={selectedIds.size < 3} onClick={() => alignSelection("distV")}>
            <AlignVerticalSpaceBetween className="h-4 w-4" />
          </AlignBtn>
        </div>

        <div className="h-6 w-px bg-border mx-1" />


        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(8, z * 1.2))}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button size="sm" variant="outline" className="h-8" onClick={fitToScreen}>
          <Maximize2 className="h-4 w-4 mr-1.5" /> Fit
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums w-12">{Math.round(zoom * 100)}%</span>

        <div className="h-6 w-px bg-border mx-1" />

        <label className="flex items-center gap-1.5 text-xs">
          <Grid3x3 className="h-4 w-4 text-muted-foreground" />
          <Switch checked={showGrid} onCheckedChange={setShowGrid} />
          Grid
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={snap} onCheckedChange={setSnap} />
          Snap
        </label>
        <Select value={String(gridSize)} onValueChange={(v) => setGridSize(Number(v))}>
          <SelectTrigger className="h-8 w-[88px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 px</SelectItem>
            <SelectItem value="10">10 px</SelectItem>
            <SelectItem value="20">20 px</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <Sheet open={drawerOpen} onOpenChange={(o) => { setDrawerOpen(o); if (o) setDrawerSvg(svg); }}>
          <SheetTrigger asChild>
            <Button size="sm" variant="outline" className="h-8">
              <Code2 className="h-4 w-4 mr-1.5" /> Edit SVG markup
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[640px] sm:max-w-[640px] flex flex-col">
            <SheetHeader>
              <SheetTitle>Edit SVG markup</SheetTitle>
            </SheetHeader>
            <div className="flex-1 grid grid-rows-[1fr_auto_220px] gap-3 mt-3 min-h-0">
              <Textarea
                value={drawerSvg}
                onChange={(e) => setDrawerSvg(e.target.value)}
                spellCheck={false}
                className="font-mono text-xs h-full resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setDrawerOpen(false)}>Cancel</Button>
                <Button size="sm" onClick={applySvgMarkup}>Apply</Button>
              </div>
              <div className="border border-border rounded-md p-2 overflow-hidden bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">Live preview</div>
                <div
                  className="w-full h-[180px] flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full"
                  // SVG markup is admin-authored content, identical trust model to importing JSON. We sanitize before persistence in production builds.
                  dangerouslySetInnerHTML={{ __html: drawerSvg }}
                />
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-8">
              <ImageIcon className="h-4 w-4 mr-1.5" /> PNG → SVG
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Add SVG / Convert PNG</DialogTitle>
            </DialogHeader>
            <PngToSvgConverter onSvg={(s) => acceptConvertedSvg(s)} />
          </DialogContent>
        </Dialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-8">
              <X className="h-4 w-4 mr-1.5" /> Clear SVG
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear SVG and pins?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the uploaded SVG and all pins placed on it. You can upload a new file afterwards.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={clearSvg}>Clear</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative border border-border rounded-lg bg-[hsl(var(--muted)/0.3)] overflow-hidden select-none"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          maxWidth: "100%",
          cursor: panning || spaceDown ? "grabbing" : mode === "add" ? "crosshair" : "default",
        }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleCanvasMouseMove}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
        onWheel={handleWheel}
      >
        {/* Inner zoom/pan stage */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
          }}
        >
          {/* SVG layer (slightly desaturated/dimmed so pins pop) */}
          <div
            className="absolute inset-0 pointer-events-none opacity-90"
            style={{
              filter: "saturate(0.85)",
            }}
            dangerouslySetInnerHTML={{
              __html: prepareSvg(svg),
            }}
          />

          {/* Grid overlay */}
          {showGrid && fit && svgInfo && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={CANVAS_W}
              height={CANVAS_H}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
            >
              <DotGrid
                fit={fit}
                vbX={svgInfo.vbX}
                vbY={svgInfo.vbY}
                vbW={svgInfo.vbWidth}
                vbH={svgInfo.vbHeight}
                gridSize={gridSize}
              />
            </svg>
          )}

          {/* Pin overlay */}
          {fit && svgInfo && (
            <svg
              className="absolute inset-0"
              width={CANVAS_W}
              height={CANVAS_H}
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              style={{ pointerEvents: "none" }}
            >
              {pins.map((p) => {
                const cx = (p.x - svgInfo.vbX) * fit.scale + fit.offsetX;
                const cy = (p.y - svgInfo.vbY) * fit.scale + fit.offsetY;
                const isSel = p.id === selectedPin;
                const isMulti = selectedIds.has(p.id);
                return (
                  <g key={p.id} style={{ pointerEvents: "auto" }}>
                    {(isSel || isMulti) && (
                      <circle
                        cx={cx} cy={cy} r={9}
                        fill="none"
                        stroke={isMulti ? "hsl(var(--primary))" : "hsl(var(--primary))"}
                        strokeWidth={2}
                        strokeDasharray={isMulti && !isSel ? "3 2" : undefined}
                      />
                    )}
                    <Popover
                      open={popoverOpen && isSel && selectedIds.size <= 1}
                      onOpenChange={(o) => { if (isSel) setPopoverOpen(o); }}
                    >
                      <PopoverTrigger asChild>
                        <circle
                          cx={cx} cy={cy} r={6}
                          fill={p.color ?? TYPE_COLORS[p.type]}
                          stroke="white"
                          strokeWidth={1.5}
                          style={{ cursor: dragPinId === p.id ? "grabbing" : "grab" }}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            const additive = e.shiftKey || e.metaKey || e.ctrlKey;
                            setSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (additive) {
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                              } else if (!next.has(p.id)) {
                                next.clear();
                                next.add(p.id);
                              }
                              return next;
                            });
                            setSelectedPin(p.id);
                            setDragPinId(p.id);
                            // Snapshot positions of all selected pins for group-drag
                            const origin = new Map<string, { x: number; y: number }>();
                            const movingNow = (selectedIds.has(p.id) && selectedIds.size > 1)
                              ? selectedIds
                              : new Set([p.id]);
                            pins.forEach((pp) => {
                              if (movingNow.has(pp.id)) origin.set(pp.id, { x: pp.x, y: pp.y });
                            });
                            if (!origin.has(p.id)) origin.set(p.id, { x: p.x, y: p.y });
                            dragStateRef.current = {
                              startX: e.clientX,
                              startY: e.clientY,
                              moved: false,
                              origin,
                            };
                          }}
                        />
                      </PopoverTrigger>
                      <PopoverContent className="w-80" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                        <PinPropertiesForm
                          pin={p}
                          onChange={(patch) => updatePin(p.id, patch)}
                          onDelete={() => deletePin(p.id)}
                        />
                      </PopoverContent>
                    </Popover>
                    <text
                      x={cx + 8}
                      y={cy + 3}
                      fontSize={11}
                      fill="hsl(var(--foreground))"
                      style={{ paintOrder: "stroke", stroke: "hsl(var(--background))", strokeWidth: 3 }}
                    >
                      {p.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          )}

          {/* Marquee rubber-band overlay */}
          {marquee && (
            <div
              className="absolute pointer-events-none border border-primary bg-primary/10"
              style={{
                left: Math.min(marquee.x0, marquee.x1),
                top: Math.min(marquee.y0, marquee.y1),
                width: Math.abs(marquee.x1 - marquee.x0),
                height: Math.abs(marquee.y1 - marquee.y0),
              }}
            />
          )}
        </div>

        {/* HUD */}
        <div className="absolute bottom-2 left-2 text-[10px] text-muted-foreground bg-background/80 backdrop-blur px-2 py-1 rounded">
          {pins.length} pin{pins.length === 1 ? "" : "s"} · drag a pin to move · click to edit · <kbd className="px-1 border rounded bg-muted">Space</kbd>+drag to pan · scroll to zoom
        </div>
      </div>

      {/* Hidden file input for re-upload from the toolbar (Clear+upload flow) */}
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

/* ---------------- Sub-components ---------------- */

function UploadZone({
  onFiles, fileRef, onStartBlank, onConvertedSvg,
}: {
  onFiles: (f: FileList | null) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onStartBlank?: () => void;
  onConvertedSvg?: (svg: string) => void;
}) {
  const [over, setOver] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
      className={
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors " +
        (over ? "border-primary bg-primary/5" : "border-border bg-muted/20")
      }
      style={{ width: CANVAS_W, height: CANVAS_H, maxWidth: "100%" }}
    >
      <Upload className="h-10 w-10 text-muted-foreground" />
      <div className="text-sm font-medium">Drop your SVG file here</div>
      <div className="text-xs text-muted-foreground">.svg — or convert a PNG/JPG below</div>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
        <Button size="sm" onClick={() => fileRef.current?.click()}>
          <Upload className="h-4 w-4 mr-1.5" /> Browse for SVG
        </Button>
        {onConvertedSvg && (
          <Dialog open={showConvert} onOpenChange={setShowConvert}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <ImageIcon className="h-4 w-4 mr-1.5" /> Add SVG / Convert PNG
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Add SVG / Convert PNG</DialogTitle>
              </DialogHeader>
              <PngToSvgConverter
                onSvg={(s) => { onConvertedSvg(s); setShowConvert(false); }}
                onCancel={() => setShowConvert(false)}
              />
            </DialogContent>
          </Dialog>
        )}
        {onStartBlank && (
          <Button size="sm" variant="outline" onClick={onStartBlank}>
            Start with blank canvas
          </Button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".svg,image/svg+xml"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
    </div>
  );
}

function AlignBtn({
  title, disabled, onClick, children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="icon"
      variant="outline"
      className="h-8 w-8"
      title={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ToolButton({
  active, onClick, icon, children,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      className="h-8"
      onClick={onClick}
    >
      <span className="mr-1.5">{icon}</span>
      {children}
    </Button>
  );
}

function PinPropertiesForm({
  pin, onChange, onDelete,
}: {
  pin: VisualPin;
  onChange: (patch: Partial<VisualPin>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Pin properties</h4>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Label">
          <Input value={pin.label} onChange={(e) => onChange({ label: e.target.value })} className="h-8" />
        </Field>
        <Field label="Number">
          <Input
            type="number"
            value={pin.number ?? ""}
            onChange={(e) => onChange({ number: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="h-8"
          />
        </Field>
        <Field label="Type">
          <Select
            value={pin.type}
            onValueChange={(v) => {
              const t = v as VisualPin["type"];
              // If user kept default color, refresh it to match the new type.
              const colorIsDefault = !pin.color || Object.values(TYPE_COLORS).includes(pin.color);
              onChange({ type: t, color: colorIsDefault ? TYPE_COLORS[t] : pin.color });
            }}
          >
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PIN_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Color">
          <Input
            type="color"
            value={pin.color ?? TYPE_COLORS[pin.type]}
            onChange={(e) => onChange({ color: e.target.value })}
            className="h-8 p-1"
          />
        </Field>
        <Field label="X">
          <Input
            type="number" step="0.1"
            value={pin.x}
            onChange={(e) => onChange({ x: Number(e.target.value) })}
            className="h-8"
          />
        </Field>
        <Field label="Y">
          <Input
            type="number" step="0.1"
            value={pin.y}
            onChange={(e) => onChange({ y: Number(e.target.value) })}
            className="h-8"
          />
        </Field>
      </div>
      <PinPropertyPicker
        value={pin.properties ?? []}
        onChange={(next) => onChange({ properties: next })}
      />
      <Field label="Notes">
        <Textarea
          rows={2}
          value={pin.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="text-xs"
        />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function DotGrid({
  fit, vbX, vbY, vbW, vbH, gridSize,
}: {
  fit: { scale: number; offsetX: number; offsetY: number };
  vbX: number; vbY: number; vbW: number; vbH: number;
  gridSize: number;
}) {
  const dots: React.ReactElement[] = [];
  // Step in user-space units, render in canvas space.
  for (let x = 0; x <= vbW; x += gridSize) {
    for (let y = 0; y <= vbH; y += gridSize) {
      const cx = x * fit.scale + fit.offsetX;
      const cy = y * fit.scale + fit.offsetY;
      dots.push(
        <circle
          key={`${x}-${y}`}
          cx={cx} cy={cy} r={0.7}
          fill="hsl(var(--muted-foreground))"
          opacity={0.4}
        />
      );
    }
  }
  // Avoid using vbX/vbY directly (the SVG view origin maps to fit.offset). Reference them so eslint stays happy.
  void vbX; void vbY;
  return <>{dots}</>;
}

/* ---------------- Helpers ---------------- */

interface SvgInfo {
  vbX: number;
  vbY: number;
  vbWidth: number;
  vbHeight: number;
}

function parseSvgInfo(svg?: string): SvgInfo | null {
  if (!svg) return null;
  // Try viewBox first
  const vbMatch = svg.match(/viewBox\s*=\s*"([-\d.\s,]+)"/);
  if (vbMatch) {
    const parts = vbMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { vbX: parts[0], vbY: parts[1], vbWidth: parts[2], vbHeight: parts[3] };
    }
  }
  // Fall back to width/height attributes
  const wMatch = svg.match(/<svg[^>]*\swidth\s*=\s*"(\d+(?:\.\d+)?)/);
  const hMatch = svg.match(/<svg[^>]*\sheight\s*=\s*"(\d+(?:\.\d+)?)/);
  const w = wMatch ? Number(wMatch[1]) : 100;
  const h = hMatch ? Number(hMatch[1]) : 100;
  return { vbX: 0, vbY: 0, vbWidth: w, vbHeight: h };
}

function computeFit(vbW: number, vbH: number) {
  const scale = Math.min(CANVAS_W / vbW, CANVAS_H / vbH);
  const offsetX = (CANVAS_W - vbW * scale) / 2;
  const offsetY = (CANVAS_H - vbH * scale) / 2;
  return { scale, offsetX, offsetY };
}

/** Force the rendered SVG to fill the canvas (object-fit: contain via width/height/preserveAspectRatio). */
function prepareSvg(svg: string): string {
  // Remove any existing width/height to let CSS sizing rule it; ensure preserveAspectRatio.
  let out = svg.replace(/<svg([^>]*)>/, (_match, attrs: string) => {
    let a = attrs;
    a = a.replace(/\swidth\s*=\s*"[^"]*"/i, "");
    a = a.replace(/\sheight\s*=\s*"[^"]*"/i, "");
    if (!/preserveAspectRatio/i.test(a)) a += ' preserveAspectRatio="xMidYMid meet"';
    return `<svg${a} width="${CANVAS_W}" height="${CANVAS_H}">`;
  });
  return out;
}

function snapPoint(p: { x: number; y: number }, grid: number, info: SvgInfo) {
  return {
    x: Math.round((p.x - info.vbX) / grid) * grid + info.vbX,
    y: Math.round((p.y - info.vbY) / grid) * grid + info.vbY,
  };
}

function round1(n: number) { return Math.round(n * 10) / 10; }

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}
