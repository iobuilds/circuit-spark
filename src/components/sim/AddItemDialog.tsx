import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Cpu, Puzzle } from "lucide-react";
import { COMPONENT_DEFS } from "@/sim/components";
import { BOARDS, type BoardId, type ComponentKind } from "@/sim/types";
import { useAdminStore, type ComponentEntry } from "@/sim/adminStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Add a built-in component by kind. */
  onPickComponent: (kind: ComponentKind) => void;
  /** Add a custom (admin-defined) component by id. */
  onPickCustom: (entry: ComponentEntry) => void;
  /** Add a board instance to the workspace. */
  onPickBoard: (boardId: BoardId) => void;
}

export function AddItemDialog({ open, onOpenChange, onPickComponent, onPickCustom, onPickBoard }: Props) {
  const adminLoaded = useAdminStore((s) => s.loaded);
  const adminComps = useAdminStore((s) => s.components);
  const hydrate = useAdminStore((s) => s.hydrate);
  useEffect(() => { if (!adminLoaded) hydrate(); }, [adminLoaded, hydrate]);

  const [tab, setTab] = useState<"all" | "boards" | "components" | "custom">("all");
  const [q, setQ] = useState("");

  // Reset search when dialog re-opens.
  useEffect(() => { if (open) setQ(""); }, [open]);

  const queryLower = q.trim().toLowerCase();

  const matchedBoards = useMemo(
    () => BOARDS.filter((b) => b.available && (
      !queryLower || b.name.toLowerCase().includes(queryLower) || b.mcu.toLowerCase().includes(queryLower) || b.id.includes(queryLower)
    )),
    [queryLower],
  );

  const builtInComponents = useMemo(
    () => Object.values(COMPONENT_DEFS)
      .filter((c) => c.available && c.kind !== "board" && c.kind !== "custom")
      .filter((c) => !queryLower || c.label.toLowerCase().includes(queryLower) || c.kind.includes(queryLower) || c.category.toLowerCase().includes(queryLower)),
    [queryLower],
  );

  const customs = useMemo(
    () => adminComps
      .filter((a) => a.enabled && !a.builtIn)
      .filter((a) => !queryLower || a.label.toLowerCase().includes(queryLower) || (a.category ?? "").toLowerCase().includes(queryLower)),
    [adminComps, queryLower],
  );

  function pickAndClose(fn: () => void) { fn(); onOpenChange(false); }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Add to workspace</DialogTitle>
          <DialogDescription>Search boards, components, or your custom parts.</DialogDescription>
        </DialogHeader>
        <div className="px-6 py-3 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search (e.g. led, uno, esp32, dht11)..."
              className="pl-8"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 min-h-0 flex flex-col">
          <div className="px-6 pt-3 border-b">
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="boards" className="gap-1.5"><Cpu className="h-3.5 w-3.5" />Boards</TabsTrigger>
              <TabsTrigger value="components">Components</TabsTrigger>
              <TabsTrigger value="custom" className="gap-1.5"><Puzzle className="h-3.5 w-3.5" />Custom</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <TabsContent value="all" className="m-0 p-4 space-y-5">
              {matchedBoards.length > 0 && (
                <Section title="Boards" icon={<Cpu className="h-3.5 w-3.5" />}>
                  {matchedBoards.map((b) => (
                    <BoardCard key={b.id} board={b} onPick={() => pickAndClose(() => onPickBoard(b.id as BoardId))} />
                  ))}
                </Section>
              )}
              {builtInComponents.length > 0 && (
                <Section title="Components">
                  {builtInComponents.map((c) => (
                    <ComponentCard key={c.kind} kind={c.kind} label={c.label} category={c.category}
                      onPick={() => pickAndClose(() => onPickComponent(c.kind))} />
                  ))}
                </Section>
              )}
              {customs.length > 0 && (
                <Section title="Custom" icon={<Puzzle className="h-3.5 w-3.5" />}>
                  {customs.map((a) => (
                    <CustomCard key={a.id} entry={a} onPick={() => pickAndClose(() => onPickCustom(a))} />
                  ))}
                </Section>
              )}
              {matchedBoards.length === 0 && builtInComponents.length === 0 && customs.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">No matches.</div>
              )}
            </TabsContent>

            <TabsContent value="boards" className="m-0 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {matchedBoards.map((b) => (
                  <BoardCard key={b.id} board={b} onPick={() => pickAndClose(() => onPickBoard(b.id as BoardId))} />
                ))}
              </div>
              {matchedBoards.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No boards.</div>}
            </TabsContent>

            <TabsContent value="components" className="m-0 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {builtInComponents.map((c) => (
                  <ComponentCard key={c.kind} kind={c.kind} label={c.label} category={c.category}
                    onPick={() => pickAndClose(() => onPickComponent(c.kind))} />
                ))}
              </div>
              {builtInComponents.length === 0 && <div className="py-12 text-center text-sm text-muted-foreground">No components.</div>}
            </TabsContent>

            <TabsContent value="custom" className="m-0 p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {customs.map((a) => (
                  <CustomCard key={a.id} entry={a} onPick={() => pickAndClose(() => onPickCustom(a))} />
                ))}
              </div>
              {customs.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No custom components yet. Create them in the admin panel.
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        {icon}{title}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function BoardCard({ board, onPick }: { board: { id: string; name: string; mcu: string }; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="group rounded-md border bg-card p-3 text-left hover:border-primary hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-center h-12 mb-2">
        <svg viewBox="0 0 60 36" className="w-14 h-9">
          <rect x={3} y={5} width={54} height={26} rx={3} fill="oklch(0.55 0.16 165)" />
          <rect x={22} y={13} width={16} height={10} rx={1} fill="oklch(0.18 0.02 240)" />
          <circle cx={8} cy={10} r={1.5} fill="oklch(0.85 0.15 90)" />
          <circle cx={8} cy={26} r={1.5} fill="oklch(0.85 0.15 90)" />
          <circle cx={52} cy={10} r={1.5} fill="oklch(0.85 0.15 90)" />
          <circle cx={52} cy={26} r={1.5} fill="oklch(0.85 0.15 90)" />
        </svg>
      </div>
      <div className="text-sm font-medium truncate">{board.name}</div>
      <div className="text-[10px] text-muted-foreground truncate">{board.mcu}</div>
    </button>
  );
}

function ComponentCard({ kind, label, category, onPick }: { kind: ComponentKind; label: string; category: string; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="group rounded-md border bg-card p-3 text-left hover:border-primary hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-center h-12 mb-2 text-foreground">
        <svg viewBox="0 0 24 24" className="w-7 h-7">
          <rect x={3} y={6} width={18} height={12} rx={2} fill="oklch(0.32 0.04 195)" stroke="currentColor" strokeWidth={0.5} />
        </svg>
      </div>
      <div className="text-sm font-medium truncate">{label}</div>
      <div className="text-[10px] text-muted-foreground truncate">{category} · {kind}</div>
    </button>
  );
}

function CustomCard({ entry, onPick }: { entry: ComponentEntry; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="group rounded-md border bg-card p-3 text-left hover:border-primary hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-center h-12 mb-2 [&>div>svg]:max-w-full [&>div>svg]:max-h-full">
        {entry.svg ? (
          <div className="w-full h-full flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: entry.svg }} />
        ) : (
          <svg viewBox="0 0 24 24" className="w-7 h-7">
            <rect x={3} y={6} width={18} height={12} rx={2}
              fill={entry.bodyColor ?? "oklch(0.32 0.02 250)"} stroke="currentColor" strokeWidth={0.6} />
          </svg>
        )}
      </div>
      <div className="text-sm font-medium truncate">{entry.label}</div>
      <div className="text-[10px] text-muted-foreground truncate">{entry.category ?? "Custom"}</div>
    </button>
  );
}
