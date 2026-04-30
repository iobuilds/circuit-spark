import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAdminStore, type BoardEntry } from "@/sim/adminStore";
import { SvgPinEditor } from "@/components/sim/SvgPinEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, Save, Trash2 } from "lucide-react";
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

  // Local draft state — committed via Save.
  const [draft, setDraft] = useState<BoardEntry | null>(board ?? null);
  useEffect(() => { if (board && !draft) setDraft(board); }, [board, draft]);

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

  function save() {
    if (!draft) return;
    update(draft.id, draft);
    toast.success("Board saved");
  }

  return (
    <div className="space-y-4 max-w-5xl">
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
          <Button size="sm" onClick={save}>
            <Save className="h-4 w-4 mr-1.5" /> Save
          </Button>
        </div>
      </div>

      <Tabs defaultValue="svg" className="w-full">
        <TabsList>
          <TabsTrigger value="properties">Properties</TabsTrigger>
          <TabsTrigger value="svg">SVG & Pins</TabsTrigger>
        </TabsList>

        <TabsContent value="properties" className="mt-4 space-y-4 max-w-xl">
          <Field label="Name">
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </Field>
          <Field label="MCU">
            <Input value={draft.mcu} onChange={(e) => setDraft({ ...draft, mcu: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Digital pins">
              <Input
                type="number"
                value={draft.digitalPins}
                onChange={(e) => setDraft({ ...draft, digitalPins: Number(e.target.value) })}
              />
            </Field>
            <Field label="Analog pins">
              <Input
                type="number"
                value={draft.analogPins}
                onChange={(e) => setDraft({ ...draft, analogPins: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
            <Label className="text-sm">Show in simulator</Label>
          </div>
        </TabsContent>

        <TabsContent value="svg" className="mt-4">
          <SvgPinEditor
            svg={draft.svg}
            pins={draft.pins ?? []}
            onChange={(next) => setDraft({ ...draft, svg: next.svg, pins: next.pins })}
          />
          <p className="text-xs text-muted-foreground mt-2">
            Tip: changes here are kept in your draft until you press <strong>Save</strong>.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
