import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAdminStore, type ComponentEntry } from "@/sim/adminStore";
import { SvgPinEditor } from "@/components/sim/SvgPinEditor";
import { PinAssignmentManager } from "@/components/sim/PinAssignmentManager";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, Check, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/components/$componentId/edit")({
  head: () => ({ meta: [{ title: "Edit Component — EmbedSim Admin" }, { name: "robots", content: "noindex" }] }),
  component: ComponentEditor,
});

const BEHAVIORS: NonNullable<ComponentEntry["behavior"]>[] = [
  "digital-out", "digital-in", "analog-in", "passive",
];

function ComponentEditor() {
  const { componentId } = Route.useParams();
  const navigate = useNavigate();
  const item = useAdminStore((s) => s.components.find((c) => c.id === componentId));
  const update = useAdminStore((s) => s.updateComponent);
  const remove = useAdminStore((s) => s.deleteComponent);

  const [draft, setDraft] = useState<ComponentEntry | null>(item ?? null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);

  useEffect(() => { if (item && !draft) setDraft(item); }, [item, draft]);

  function patch(next: ComponentEntry) {
    setDraft(next);
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      update(next.id, next);
      setSaving(false);
      setSavedAt(Date.now());
    }, 150);
  }

  if (!item || !draft) {
    return (
      <div className="space-y-3">
        <Link to="/admin" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Library Manager
        </Link>
        <p className="text-sm text-muted-foreground">Component not found.</p>
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
          <h1 className="text-2xl font-bold tracking-tight">{draft.label || "Untitled Component"}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {draft.builtIn ? "Built-in component (overrides saved locally)" : "Custom component"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saving ? (
            <span className="inline-flex items-center text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving…
            </span>
          ) : savedAt ? (
            <span className="inline-flex items-center text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 mr-1 text-green-500" /> Saved
            </span>
          ) : null}
          {!draft.builtIn && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this component?</AlertDialogTitle>
                  <AlertDialogDescription>This permanently removes the custom component.</AlertDialogDescription>
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
          <Field label="Label">
            <Input value={draft.label} onChange={(e) => patch({ ...draft, label: e.target.value })} />
          </Field>
          <Field label="Category">
            <Input value={draft.category} onChange={(e) => patch({ ...draft, category: e.target.value })} />
          </Field>
          <Field label="Behavior">
            <Select
              value={draft.behavior ?? "passive"}
              onValueChange={(v) => patch({ ...draft, behavior: v as ComponentEntry["behavior"] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BEHAVIORS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Body color">
            <Input
              type="color"
              value={draft.bodyColor ?? "#888888"}
              onChange={(e) => patch({ ...draft, bodyColor: e.target.value })}
              className="h-9 p-1 w-24"
            />
          </Field>
          <div className="flex items-center gap-2">
            <Switch checked={draft.enabled} onCheckedChange={(v) => patch({ ...draft, enabled: v })} />
            <Label className="text-sm">Show in simulator palette</Label>
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
                Step 1 — place pins. Step 2 — assign properties on the right. All edits save automatically.
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
