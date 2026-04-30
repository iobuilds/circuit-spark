import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAdminStore, type BoardEntry } from "@/sim/adminStore";
import { SvgPinEditor } from "@/components/sim/SvgPinEditor";
import { PinAssignmentManager } from "@/components/sim/PinAssignmentManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/boards/$boardId/edit")({
  head: () => ({ meta: [{ title: "Edit Board — EmbedSim Admin" }, { name: "robots", content: "noindex" }] }),
  component: BoardEditor,
});

function BoardEditor() {
  const { boardId } = Route.useParams();
  const navigate = useNavigate();
  const board = useAdminStore((s) => s.boards.find((b) => b.id === boardId));
  const update = useAdminStore((s) => s.updateBoard);
  const remove = useAdminStore((s) => s.deleteBoard);

  // Auto-save: every change is immediately persisted to the store via `update()`.
  // We keep a local mirror so React re-renders cleanly between commits.
  const [draft, setDraft] = useState<BoardEntry | null>(board ?? null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  useEffect(() => { if (board && !draft) setDraft(board); }, [board, draft]);

  // Debounced auto-save: persist to store ~150ms after the last edit.
  function patch(next: BoardEntry) {
    setDraft(next);
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      update(next.id, next);
      setSaving(false);
      setSavedAt(Date.now());
    }, 150);
  }

  if (!board || !draft) {
    return (
      <div className="space-y-3">
        <Link to="/admin" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Library Manager
        </Link>
        <p className="text-sm text-muted-foreground">Board not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-[1400px]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Link to="/admin" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-1">
            <ChevronLeft className="h-3 w-3 mr-1" /> Library Manager
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{draft.name || "Untitled Board"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {draft.builtIn ? "Built-in board (overrides saved locally)" : "Custom board"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SaveStatus saving={saving} savedAt={savedAt} />
          {!draft.builtIn && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this board?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently removes the custom board.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => { remove(draft.id); navigate({ to: "/admin" }); }}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Tabs defaultValue="svg" className="w-full">
        <TabsList>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="svg">SVG & Pins</TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="mt-4 space-y-4 max-w-xl">
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => patch({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="MCU">
            <Input value={draft.mcu} onChange={(e) => patch({ ...draft, mcu: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Digital pins">
              <Input
                type="number"
                value={draft.digitalPins}
                onChange={(e) => patch({ ...draft, digitalPins: Number(e.target.value) })}
              />
            </Field>
            <Field label="Analog pins">
              <Input
                type="number"
                value={draft.analogPins}
                onChange={(e) => patch({ ...draft, analogPins: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={draft.enabled} onCheckedChange={(v) => patch({ ...draft, enabled: v })} />
            <Label className="text-sm">Show in simulator</Label>
          </div>
        </TabsContent>

        <TabsContent value="svg" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-4">
            <div className="min-w-0">
              <SvgPinEditor
                svg={draft.svg}
                pins={draft.pins ?? []}
                onChange={(next) => patch({ ...draft, svg: next.svg, pins: next.pins })}
              />
              <p className="text-xs text-muted-foreground mt-2">
                Step 1 — place pins on the board. Step 2 — assign properties in the panel on the right.
                All edits save automatically.
              </p>
            </div>
            <div className="lg:h-[640px]">
              <PinAssignmentManager
                pins={draft.pins ?? []}
                onChange={(next) => patch({ ...draft, pins: next })}
                selectedId={selectedPinId}
                onSelect={setSelectedPinId}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SaveStatus({ saving, savedAt }: { saving: boolean; savedAt: number | null }) {
  if (saving) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving…
      </span>
    );
  }
  if (savedAt) {
    return (
      <span className="inline-flex items-center text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 mr-1 text-green-500" /> Saved
      </span>
    );
  }
  return null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
