import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAdminStore, type BoardEntry, type ComponentEntry, exportSnapshot } from "@/sim/adminStore";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { GripVertical, Download, Upload, RotateCcw, Search, Pencil, PlusCircle } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: LibraryManager,
});

function LibraryManager() {
  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Library Manager</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enable, disable and reorder the boards and components shown in the simulator. Changes take effect immediately and are saved to your browser.
        </p>
      </div>

      <Tabs defaultValue="boards" className="w-full">
        <TabsList>
          <TabsTrigger value="boards">Boards</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
        </TabsList>
        <TabsContent value="boards" className="mt-4">
          <BoardsTab />
        </TabsContent>
        <TabsContent value="components" className="mt-4">
          <ComponentsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Boards ---------------- */

function BoardsTab() {
  const navigate = useNavigate();
  const boards = useAdminStore((s) => s.boards);
  const setEnabled = useAdminStore((s) => s.setBoardEnabled);
  const bulk = useAdminStore((s) => s.bulkSetBoards);
  const reorder = useAdminStore((s) => s.reorderBoards);
  const reset = useAdminStore((s) => s.resetBoards);
  const importItems = useAdminStore((s) => s.importBoards);
  const createCustom = useAdminStore((s) => s.createCustomBoard);

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filtered = useMemo(
    () => boards.filter((b) => b.name.toLowerCase().includes(q.toLowerCase()) || b.mcu.toLowerCase().includes(q.toLowerCase())),
    [boards, q]
  );

  const fileRef = useRef<HTMLInputElement>(null);

  function toggleSel(id: string) {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  }
  function selectAllVisible(check: boolean) {
    setSelected(check ? new Set(filtered.map((b) => b.id)) : new Set());
  }

  function exportJSON() {
    const data = { _version: 1, boards: exportSnapshot().boards };
    download("embedsim-boards.json", JSON.stringify(data, null, 2));
    toast.success("Exported boards");
  }
  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        const j = JSON.parse(t);
        const items = (j.boards ?? j.items ?? j) as BoardEntry[];
        if (!Array.isArray(items)) throw new Error("Invalid file");
        importItems(items);
        toast.success(`Imported ${items.length} boards`);
      } catch (err) {
        toast.error("Failed to import: " + (err as Error).message);
      }
    });
    e.target.value = "";
  }

  return (
    <Card>
      <Toolbar
        q={q} setQ={setQ}
        selectedCount={selected.size}
        onBulkEnable={() => { bulk([...selected], true); toast.success(`Enabled ${selected.size}`); setSelected(new Set()); }}
        onBulkDisable={() => { bulk([...selected], false); toast.success(`Disabled ${selected.size}`); setSelected(new Set()); }}
        onExport={exportJSON}
        onImport={() => fileRef.current?.click()}
        onReset={() => { reset(); toast.success("Boards reset to defaults"); setSelected(new Set()); }}
        resetLabel="Reset boards to defaults"
      />
      <input ref={fileRef} type="file" accept=".json,application/json" onChange={onImportFile} className="hidden" />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2 w-8">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((b) => selected.has(b.id))}
                  onCheckedChange={(c) => selectAllVisible(Boolean(c))}
                />
              </th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">MCU</th>
              <th className="px-3 py-2">Pins</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2 text-right">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const realIdx = boards.findIndex((x) => x.id === b.id);
              return (
                <tr key={b.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <DragHandle index={realIdx} onReorder={reorder} />
                  </td>
                  <td className="px-3 py-2">
                    <Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggleSel(b.id)} />
                  </td>
                  <td className="px-3 py-2 font-medium">{b.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{b.mcu}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">D{b.digitalPins} / A{b.analogPins}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={b.builtIn ? "text-muted-foreground" : "text-primary"}>
                      {b.builtIn ? "Built-in" : "Custom"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Switch checked={b.enabled} onCheckedChange={(v) => setEnabled(b.id, v)} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No boards match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------- Components ---------------- */

function ComponentsTab() {
  const items = useAdminStore((s) => s.components);
  const setEnabled = useAdminStore((s) => s.setComponentEnabled);
  const bulk = useAdminStore((s) => s.bulkSetComponents);
  const reorder = useAdminStore((s) => s.reorderComponents);
  const reset = useAdminStore((s) => s.resetComponents);
  const importItems = useAdminStore((s) => s.importComponents);

  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filtered = useMemo(
    () => items.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()) || c.category.toLowerCase().includes(q.toLowerCase())),
    [items, q]
  );

  const fileRef = useRef<HTMLInputElement>(null);

  function toggleSel(id: string) {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  }
  function selectAllVisible(check: boolean) {
    setSelected(check ? new Set(filtered.map((b) => b.id)) : new Set());
  }
  function exportJSON() {
    const data = { _version: 1, components: exportSnapshot().components };
    download("embedsim-components.json", JSON.stringify(data, null, 2));
    toast.success("Exported components");
  }
  function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    f.text().then((t) => {
      try {
        const j = JSON.parse(t);
        const arr = (j.components ?? j.items ?? j) as ComponentEntry[];
        if (!Array.isArray(arr)) throw new Error("Invalid file");
        importItems(arr);
        toast.success(`Imported ${arr.length} components`);
      } catch (err) {
        toast.error("Failed to import: " + (err as Error).message);
      }
    });
    e.target.value = "";
  }

  return (
    <Card>
      <Toolbar
        q={q} setQ={setQ}
        selectedCount={selected.size}
        onBulkEnable={() => { bulk([...selected], true); toast.success(`Enabled ${selected.size}`); setSelected(new Set()); }}
        onBulkDisable={() => { bulk([...selected], false); toast.success(`Disabled ${selected.size}`); setSelected(new Set()); }}
        onExport={exportJSON}
        onImport={() => fileRef.current?.click()}
        onReset={() => { reset(); toast.success("Components reset to defaults"); setSelected(new Set()); }}
        resetLabel="Reset components to defaults"
      />
      <input ref={fileRef} type="file" accept=".json,application/json" onChange={onImportFile} className="hidden" />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2 w-8">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every((c) => selected.has(c.id))}
                  onCheckedChange={(c) => selectAllVisible(Boolean(c))}
                />
              </th>
              <th className="px-3 py-2">Label</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2 text-right">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const realIdx = items.findIndex((x) => x.id === c.id);
              return (
                <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <DragHandle index={realIdx} onReorder={reorder} />
                  </td>
                  <td className="px-3 py-2">
                    <Checkbox checked={selected.has(c.id)} onCheckedChange={() => toggleSel(c.id)} />
                  </td>
                  <td className="px-3 py-2 font-medium">{c.label}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{c.category}</td>
                  <td className="px-3 py-2 text-xs">
                    <span className={c.builtIn ? "text-muted-foreground" : "text-primary"}>
                      {c.builtIn ? "Built-in" : "Custom"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Switch checked={c.enabled} onCheckedChange={(v) => setEnabled(c.id, v)} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No components match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------- Shared UI ---------------- */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card overflow-hidden">{children}</div>;
}

interface ToolbarProps {
  q: string; setQ: (v: string) => void;
  selectedCount: number;
  onBulkEnable: () => void;
  onBulkDisable: () => void;
  onExport: () => void;
  onImport: () => void;
  onReset: () => void;
  onCreate?: () => void;
  createLabel?: string;
  resetLabel: string;
}
function Toolbar(p: ToolbarProps) {
  return (
    <div className="flex items-center gap-2 p-3 border-b border-border bg-muted/30">
      <div className="relative w-64 max-w-full">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={p.q} onChange={(e) => p.setQ(e.target.value)} placeholder="Search..." className="pl-7 h-8" />
      </div>
      {p.selectedCount > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{p.selectedCount} selected</span>
          <Button size="sm" variant="outline" className="h-7" onClick={p.onBulkEnable}>Enable</Button>
          <Button size="sm" variant="outline" className="h-7" onClick={p.onBulkDisable}>Disable</Button>
        </div>
      )}
      <div className="flex-1" />
      {p.onCreate && (
        <Button size="sm" className="h-8" onClick={p.onCreate}>
          <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> {p.createLabel ?? "New"}
        </Button>
      )}
      <Button size="sm" variant="outline" className="h-8" onClick={p.onImport}>
        <Upload className="h-3.5 w-3.5 mr-1.5" /> Import
      </Button>
      <Button size="sm" variant="outline" className="h-8" onClick={p.onExport}>
        <Download className="h-3.5 w-3.5 mr-1.5" /> Export
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" className="h-8">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{p.resetLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores the built-in list and removes any custom items and ordering changes. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={p.onReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DragHandle({ index, onReorder }: { index: number; onReorder: (from: number, to: number) => void }) {
  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData("text/plain", String(index)); e.dataTransfer.effectAllowed = "move"; }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("text/plain"));
        if (!Number.isNaN(from) && from !== index) onReorder(from, index);
      }}
      className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      title="Drag to reorder"
    >
      <GripVertical className="h-4 w-4" />
    </div>
  );
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
