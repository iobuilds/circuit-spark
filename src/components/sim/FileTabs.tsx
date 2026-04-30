import { useState } from "react";
import { useIdeStore, type SourceFileKind } from "@/sim/ideStore";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger, ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const FILE_ICONS: Record<SourceFileKind, string> = {
  ino: "📄",
  h: "📋",
  cpp: "⚙️",
  c: "🔧",
};

export function FileTabs() {
  const files = useIdeStore((s) => s.files);
  const activeFileId = useIdeStore((s) => s.activeFileId);
  const setActiveFile = useIdeStore((s) => s.setActiveFile);
  const deleteFile = useIdeStore((s) => s.deleteFile);
  const duplicateFile = useIdeStore((s) => s.duplicateFile);
  const renameFile = useIdeStore((s) => s.renameFile);
  const addFile = useIdeStore((s) => s.addFile);
  const reorderFiles = useIdeStore((s) => s.reorderFiles);

  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("helpers");
  const [newKind, setNewKind] = useState<SourceFileKind>("h");

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  const [dragIdx, setDragIdx] = useState<number | null>(null);

  function confirmCreate() {
    const safe = newName.trim().replace(/\s+/g, "_") || "untitled";
    const fname = safe.includes(".") ? safe : `${safe}.${newKind}`;
    addFile(fname, newKind, newKind === "ino" ? "void setup() {\n\n}\n\nvoid loop() {\n\n}\n" : "");
    setNewOpen(false);
    setNewName("helpers");
    setNewKind("h");
    toast.success(`Created ${fname}`);
  }

  function startRename(id: string, name: string) {
    setRenameId(id);
    setRenameVal(name);
    setRenameOpen(true);
  }
  function confirmRename() {
    if (renameId && renameVal.trim()) {
      renameFile(renameId, renameVal.trim());
      toast.success("Renamed");
    }
    setRenameOpen(false);
  }

  return (
    <>
      <div className="flex items-stretch border-b border-border bg-muted/30 overflow-x-auto scrollbar-thin">
        {files.map((f, idx) => (
          <ContextMenu key={f.id}>
            <ContextMenuTrigger asChild>
              <button
                draggable
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIdx !== null && dragIdx !== idx) reorderFiles(dragIdx, idx);
                  setDragIdx(null);
                }}
                onClick={() => setActiveFile(f.id)}
                className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs border-r border-border whitespace-nowrap transition-colors ${
                  f.id === activeFileId
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                }`}
              >
                <span className="text-[14px] leading-none">{FILE_ICONS[f.kind]}</span>
                <span className="font-mono">{f.name}</span>
                {files.length > 1 && (
                  <X
                    className="h-3 w-3 opacity-0 group-hover:opacity-60 hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); deleteFile(f.id); }}
                  />
                )}
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => startRename(f.id, f.name)}>Rename</ContextMenuItem>
              <ContextMenuItem onClick={() => duplicateFile(f.id)}>Duplicate</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                disabled={files.length <= 1}
                onClick={() => deleteFile(f.id)}
                className="text-destructive"
              >
                Delete
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-auto rounded-none px-2"
          onClick={() => setNewOpen(true)}
          title="New file"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New source file</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Filename</label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="helpers" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <Select value={newKind} onValueChange={(v) => setNewKind(v as SourceFileKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ino">📄 .ino — Arduino sketch</SelectItem>
                  <SelectItem value="h">📋 .h — C/C++ header</SelectItem>
                  <SelectItem value="cpp">⚙️ .cpp — C++ source</SelectItem>
                  <SelectItem value="c">🔧 .c — C source</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancel</Button>
            <Button onClick={confirmCreate}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
          </DialogHeader>
          <Input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={confirmRename}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
