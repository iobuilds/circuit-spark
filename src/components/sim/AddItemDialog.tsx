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

  // Admin store drives which boards & built-in components are exposed to users.
  // Anything disabled in the Library Manager is filtered out here.
  const adminBoards = useAdminStore((s) => s.boards);
  const enabledBoardIds = useMemo(
    () => new Set(adminBoards.filter((b) => b.enabled).map((b) => b.id)),
    [adminBoards],
  );
  const enabledComponentKinds = useMemo(
    () => new Set(adminComps.filter((c) => c.enabled && c.builtIn).map((c) => c.id)),
    [adminComps],
  );

  const matchedBoards = useMemo(
    () => BOARDS.filter((b) => b.available && enabledBoardIds.has(b.id) && (
      !queryLower || b.name.toLowerCase().includes(queryLower) || b.mcu.toLowerCase().includes(queryLower) || b.id.includes(queryLower)
    )),
    [queryLower, enabledBoardIds],
  );

  const builtInComponents = useMemo(
    () => Object.values(COMPONENT_DEFS)
      .filter((c) => c.available && c.kind !== "board" && c.kind !== "custom" && enabledComponentKinds.has(c.kind))
      .filter((c) => !queryLower || c.label.toLowerCase().includes(queryLower) || c.kind.includes(queryLower) || c.category.toLowerCase().includes(queryLower)),
    [queryLower, enabledComponentKinds],
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

/** Pretty 60x36 silhouettes per board family — gives users a visual cue. */
function BoardIcon({ id }: { id: string }) {
  const fill =
    id === "esp32" || id === "esp8266" ? "oklch(0.50 0.18 25)"
    : id === "stm32" ? "oklch(0.45 0.14 250)"
    : id === "pico"  ? "oklch(0.92 0.02 250)"
    : id === "nano"  ? "oklch(0.55 0.16 165)"
    : id === "mega"  ? "oklch(0.55 0.16 165)"
    : "oklch(0.55 0.16 165)";
  return (
    <svg viewBox="0 0 60 36" className="w-14 h-9">
      <rect x={3} y={5} width={54} height={26} rx={3} fill={fill} />
      {/* header strips (digital + power) */}
      <rect x={8} y={8} width={44} height={3} rx={0.5} fill="oklch(0.10 0.01 250)" />
      <rect x={8} y={25} width={44} height={3} rx={0.5} fill="oklch(0.10 0.01 250)" />
      {/* MCU chip */}
      <rect x={22} y={14} width={16} height={9} rx={1} fill="oklch(0.18 0.02 240)" />
      {/* mounting holes */}
      <circle cx={6} cy={8} r={1.1} fill="oklch(0.18 0.02 240)" />
      <circle cx={6} cy={28} r={1.1} fill="oklch(0.18 0.02 240)" />
      <circle cx={54} cy={8} r={1.1} fill="oklch(0.18 0.02 240)" />
      <circle cx={54} cy={28} r={1.1} fill="oklch(0.18 0.02 240)" />
    </svg>
  );
}

function BoardCard({ board, onPick }: { board: { id: string; name: string; mcu: string }; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="group rounded-md border bg-card p-3 text-left hover:border-primary hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-center h-12 mb-2">
        <BoardIcon id={board.id} />
      </div>
      <div className="text-sm font-medium truncate">{board.name}</div>
      <div className="text-[10px] text-muted-foreground truncate">{board.mcu}</div>
    </button>
  );
}

/** Distinct vector icons per built-in component kind. */
function ComponentIcon({ kind }: { kind: ComponentKind }) {
  const cls = "w-9 h-9";
  switch (kind) {
    case "led":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <ellipse cx={18} cy={14} rx={9} ry={10} fill="oklch(0.7 0.25 25)" />
          <ellipse cx={15} cy={10} rx={3} ry={4} fill="oklch(0.95 0.1 25)" opacity={0.7} />
          <line x1={14} y1={28} x2={14} y2={34} stroke="currentColor" strokeWidth={1.5} />
          <line x1={22} y1={24} x2={22} y2={34} stroke="currentColor" strokeWidth={1.5} />
        </svg>
      );
    case "rgb-led":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <defs>
            <radialGradient id="rgbg" cx="50%" cy="40%" r="60%">
              <stop offset="0%" stopColor="oklch(0.95 0.1 145)" />
              <stop offset="50%" stopColor="oklch(0.7 0.22 25)" />
              <stop offset="100%" stopColor="oklch(0.6 0.2 250)" />
            </radialGradient>
          </defs>
          <ellipse cx={18} cy={14} rx={9} ry={10} fill="url(#rgbg)" />
          {[12, 16, 20, 24].map((x) => (
            <line key={x} x1={x} y1={24} x2={x} y2={34} stroke="currentColor" strokeWidth={1} />
          ))}
        </svg>
      );
    case "resistor":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <line x1={2} y1={18} x2={9} y2={18} stroke="currentColor" strokeWidth={1.5} />
          <rect x={9} y={13} width={18} height={10} rx={2} fill="oklch(0.75 0.05 60)" stroke="currentColor" strokeWidth={0.6} />
          <rect x={12} y={13} width={1.5} height={10} fill="oklch(0.5 0.15 25)" />
          <rect x={16} y={13} width={1.5} height={10} fill="oklch(0.4 0.05 60)" />
          <rect x={20} y={13} width={1.5} height={10} fill="oklch(0.6 0.18 60)" />
          <line x1={27} y1={18} x2={34} y2={18} stroke="currentColor" strokeWidth={1.5} />
        </svg>
      );
    case "button":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={6} y={10} width={24} height={16} rx={2} fill="oklch(0.30 0.02 250)" stroke="currentColor" strokeWidth={0.6} />
          <circle cx={18} cy={18} r={6} fill="oklch(0.55 0.18 25)" stroke="oklch(0.3 0.1 25)" strokeWidth={0.8} />
          <circle cx={18} cy={18} r={3} fill="oklch(0.7 0.2 25)" />
        </svg>
      );
    case "potentiometer":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <circle cx={18} cy={17} r={11} fill="oklch(0.40 0.02 250)" stroke="currentColor" strokeWidth={0.6} />
          <circle cx={18} cy={17} r={6} fill="oklch(0.55 0.04 250)" />
          <line x1={18} y1={17} x2={24} y2={11} stroke="oklch(0.95 0.05 60)" strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      );
    case "buzzer":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <circle cx={18} cy={17} r={11} fill="oklch(0.18 0.01 250)" stroke="currentColor" strokeWidth={0.6} />
          <circle cx={18} cy={17} r={2} fill="oklch(0.55 0.04 250)" />
        </svg>
      );
    case "switch":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={6} y={12} width={24} height={12} rx={2} fill="oklch(0.85 0.01 250)" stroke="currentColor" strokeWidth={0.6} />
          <rect x={18} y={13} width={10} height={10} rx={1} fill="oklch(0.30 0.02 250)" />
        </svg>
      );
    case "lcd1602":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={3} y={9} width={30} height={18} rx={1.5} fill="oklch(0.45 0.10 220)" stroke="currentColor" strokeWidth={0.6} />
          <rect x={5} y={12} width={26} height={5} fill="oklch(0.85 0.13 220)" />
          <rect x={5} y={19} width={26} height={5} fill="oklch(0.85 0.13 220)" />
        </svg>
      );
    case "oled":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={4} y={9} width={28} height={18} rx={1.5} fill="oklch(0.12 0.01 250)" stroke="currentColor" strokeWidth={0.6} />
          <text x={18} y={21} textAnchor="middle" fontSize={6} fill="oklch(0.85 0.13 220)" fontFamily="monospace">OLED</text>
        </svg>
      );
    case "7seg":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={9} y={5} width={18} height={26} rx={2} fill="oklch(0.18 0.01 250)" stroke="currentColor" strokeWidth={0.6} />
          <text x={18} y={25} textAnchor="middle" fontSize={18} fill="oklch(0.7 0.25 25)" fontFamily="monospace" fontWeight={700}>8</text>
        </svg>
      );
    case "servo":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={6} y={12} width={18} height={18} rx={1.5} fill="oklch(0.85 0.01 250)" stroke="currentColor" strokeWidth={0.6} />
          <circle cx={26} cy={14} r={4} fill="oklch(0.75 0.02 250)" stroke="currentColor" strokeWidth={0.6} />
          <line x1={26} y1={14} x2={32} y2={9} stroke="currentColor" strokeWidth={1.5} />
        </svg>
      );
    case "relay":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={4} y={8} width={28} height={20} rx={1.5} fill="oklch(0.55 0.18 25)" stroke="currentColor" strokeWidth={0.6} />
          <rect x={8} y={12} width={10} height={12} rx={1} fill="oklch(0.30 0.02 250)" />
          <text x={26} y={22} textAnchor="middle" fontSize={7} fill="oklch(0.95 0 0)" fontFamily="monospace" fontWeight={700}>R</text>
        </svg>
      );
    case "dht11":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={9} y={4} width={18} height={28} rx={1.5} fill="oklch(0.65 0.12 220)" stroke="currentColor" strokeWidth={0.6} />
          <g fill="oklch(0.18 0.02 250)">
            {[8, 12, 16, 20, 24, 28].map((y) => <rect key={y} x={11} y={y} width={14} height={1.5} />)}
          </g>
        </svg>
      );
    case "ultrasonic":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={3} y={10} width={30} height={16} rx={1.5} fill="oklch(0.30 0.02 250)" stroke="currentColor" strokeWidth={0.6} />
          <circle cx={11} cy={18} r={5} fill="oklch(0.85 0.01 250)" stroke="currentColor" strokeWidth={0.6} />
          <circle cx={25} cy={18} r={5} fill="oklch(0.85 0.01 250)" stroke="currentColor" strokeWidth={0.6} />
        </svg>
      );
    case "pir":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={4} y={4} width={28} height={28} rx={3} fill="oklch(0.30 0.04 130)" stroke="currentColor" strokeWidth={0.6} />
          <circle cx={18} cy={18} r={9} fill="oklch(0.85 0.05 60)" />
          <circle cx={18} cy={18} r={4} fill="oklch(0.55 0.04 60)" />
        </svg>
      );
    case "ldr":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <circle cx={18} cy={18} r={11} fill="oklch(0.85 0.05 60)" stroke="currentColor" strokeWidth={0.6} />
          <path d="M10 14 L26 22 M10 18 L26 14 M10 22 L26 18" stroke="oklch(0.30 0.02 250)" strokeWidth={1} fill="none" />
        </svg>
      );
    case "battery":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={9} y={6} width={18} height={24} rx={2} fill="oklch(0.55 0.18 25)" stroke="currentColor" strokeWidth={0.6} />
          <rect x={12} y={3} width={4} height={3} rx={0.5} fill="oklch(0.18 0.02 250)" />
          <rect x={20} y={3} width={4} height={3} rx={0.5} fill="oklch(0.18 0.02 250)" />
          <text x={18} y={22} textAnchor="middle" fontSize={9} fontWeight={700} fill="oklch(0.98 0 0)" fontFamily="monospace">3.7V</text>
        </svg>
      );
    case "motor":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={11} y={14} width={14} height={16} rx={2} fill="oklch(0.55 0.005 250)" stroke="currentColor" strokeWidth={0.6} />
          <rect x={13} y={28} width={10} height={4} rx={1} fill="oklch(0.55 0.20 25)" />
          <ellipse cx={18} cy={9} rx={11} ry={2.2} fill="oklch(0.7 0.20 240)" stroke="currentColor" strokeWidth={0.5} />
          <line x1={18} y1={11} x2={18} y2={14} stroke="currentColor" strokeWidth={1.2} />
        </svg>
      );
      );
    case "water-level":
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <path d="M14 4 H22 V14 H26 V32 H10 V14 H14 Z" fill="oklch(0.50 0.20 25)" stroke="currentColor" strokeWidth={0.6} />
          <g stroke="oklch(0.92 0.04 25)" strokeWidth={0.7}>
            {[12,15,18,21].map(x => <line key={x} x1={x} y1={18} x2={x} y2={30} />)}
          </g>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 36 36" className={cls}>
          <rect x={6} y={10} width={24} height={16} rx={2} fill="oklch(0.32 0.04 195)" stroke="currentColor" strokeWidth={0.6} />
        </svg>
      );
  }
}

function ComponentCard({ kind, label, category, onPick }: { kind: ComponentKind; label: string; category: string; onPick: () => void }) {
  return (
    <button
      onClick={onPick}
      className="group rounded-md border bg-card p-3 text-left hover:border-primary hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-center h-12 mb-2 text-foreground/70">
        <ComponentIcon kind={kind} />
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
