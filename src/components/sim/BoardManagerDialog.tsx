import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Package, CheckCircle2, Trash2, Wifi, WifiOff, ExternalLink, PackageCheck,
} from "lucide-react";
import { BOARD_PACKAGES } from "@/sim/ideCatalog";
import { useIdeStore, type InstalledBoard } from "@/sim/ideStore";
import {
  BOARD_CATEGORIES,
  formatBytes,
  searchArduinoBoards,
  type ArduinoBoardEntry,
} from "@/sim/arduinoBoardsApi";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function curatedAsLive(): ArduinoBoardEntry[] {
  return BOARD_PACKAGES.map((p) => ({
    id: p.id,
    package: p.id.split(":")[0] ?? p.id,
    architecture: p.id.split(":")[1] ?? "",
    name: p.name,
    maintainer: p.author,
    website: "",
    latestVersion: p.version,
    versions: [p.version],
    category: p.author === "Arduino" ? "Arduino" : "Contributed",
    boards: p.boards,
    downloadUrl: "",
    archiveFileName: "",
    size: 0,
  }));
}

export function BoardManagerDialog({ open, onOpenChange }: Props) {
  const installed = useIdeStore((s) => s.installedBoards);
  const installBoard = useIdeStore((s) => s.installBoard);
  const removeBoard = useIdeStore((s) => s.removeBoard);
  const hydrate = useIdeStore((s) => s.hydrate);
  const loaded = useIdeStore((s) => s.loaded);

  useEffect(() => { if (!loaded) hydrate(); }, [loaded, hydrate]);

  const [tab, setTab] = useState<"browse" | "installed">("browse");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [results, setResults] = useState<ArduinoBoardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [versionPick, setVersionPick] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  // Live search (debounced).
  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchArduinoBoards({ q: query, category, limit: 60, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (r.ok) {
        setOnline(true);
        setResults(r.results);
      } else {
        setOnline(false);
        // Fallback to curated list when API unreachable.
        const curated = curatedAsLive();
        const q = query.trim().toLowerCase();
        setResults(
          curated
            .filter((c) =>
              (!q || c.name.toLowerCase().includes(q) || c.boards.some((b) => b.toLowerCase().includes(q))) &&
              (category === "All" || c.category === category)
            )
        );
      }
      setLoading(false);
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [open, query, category]);

  const installedMap = useMemo(() => new Map(installed.map((b) => [b.id, b])), [installed]);

  function startInstall(entry: ArduinoBoardEntry) {
    const version = versionPick[entry.id] ?? entry.latestVersion;
    setProgress((p) => ({ ...p, [entry.id]: 5 }));
    let pct = 5;
    const tick = setInterval(() => {
      pct += Math.random() * 18;
      if (pct >= 100) {
        clearInterval(tick);
        setProgress((p) => { const n = { ...p }; delete n[entry.id]; return n; });
        const inst: InstalledBoard = {
          id: entry.id,
          version,
          name: entry.name,
          live: true,
          boards: entry.boards,
        };
        installBoard(inst);
        toast.success(`${entry.name} v${version} installed`);
      } else {
        setProgress((p) => ({ ...p, [entry.id]: pct }));
      }
    }, 180);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Boards Manager
            {online !== null && (
              <Badge variant="outline" className="ml-2 gap-1 text-[10px]">
                {online ? <Wifi className="h-3 w-3 text-success" /> : <WifiOff className="h-3 w-3 text-warning" />}
                {online ? "Live (Arduino package_index)" : "Offline (curated)"}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Install board support packages — live from the official Arduino, ESP32, ESP8266, RP2040 and STM32 indexes.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "browse" | "installed")} className="flex-1 min-h-0 flex flex-col">
          <div className="px-6 pt-3 border-b">
            <TabsList>
              <TabsTrigger value="browse">Browse</TabsTrigger>
              <TabsTrigger value="installed" className="gap-1.5">
                <PackageCheck className="h-3.5 w-3.5" />
                Installed
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{installed.length}</Badge>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="browse" className="flex-1 min-h-0 m-0 flex flex-col">
            <div className="px-6 py-3 border-b flex gap-2">
              <Input
                placeholder="Search boards (e.g. ESP32, Pico, Nano)..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BOARD_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="flex-1 min-h-0">
              <div className="px-6 py-3 space-y-3">
                {loading && results.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                    Loading Arduino board index...
                  </div>
                )}
                {results.map((entry) => {
                  const inst = installedMap.get(entry.id);
                  const pct = progress[entry.id];
                  const installing = pct !== undefined;
                  const pickedVersion = versionPick[entry.id] ?? inst?.version ?? entry.latestVersion;
                  const upToDate = inst && inst.version === entry.latestVersion;
                  return (
                    <div key={entry.id} className="rounded-lg border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">{entry.name}</h3>
                            <span className="text-xs text-muted-foreground">v{entry.latestVersion}</span>
                            {inst && (
                              <Badge variant={upToDate ? "secondary" : "outline"} className="gap-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {upToDate ? "Installed" : `Installed v${inst.version}`}
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px]">{entry.category}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            by {entry.maintainer || "—"} · {formatBytes(entry.size)} · {entry.id}
                            {entry.website && (
                              <a href={entry.website} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-0.5 ml-2 text-primary hover:underline">
                                website <ExternalLink className="h-2.5 w-2.5" />
                              </a>
                            )}
                          </p>
                          {entry.boards.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {entry.boards.slice(0, 12).map((b) => (
                                <Badge key={b} variant="outline" className="text-[10px]">{b}</Badge>
                              ))}
                              {entry.boards.length > 12 && (
                                <span className="text-[10px] text-muted-foreground">+{entry.boards.length - 12} more</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-2 w-44">
                          {installing ? (
                            <div className="w-full">
                              <div className="text-xs text-muted-foreground mb-1">Installing... {Math.round(pct)}%</div>
                              <Progress value={pct} className="h-1.5" />
                            </div>
                          ) : (
                            <>
                              {entry.versions.length > 1 && (
                                <Select
                                  value={pickedVersion}
                                  onValueChange={(v) => setVersionPick((s) => ({ ...s, [entry.id]: v }))}
                                >
                                  <SelectTrigger className="h-7 text-xs w-full"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {entry.versions.slice().reverse().map((v) => (
                                      <SelectItem key={v} value={v} className="text-xs">
                                        v{v} {v === entry.latestVersion ? "(latest)" : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              <div className="flex gap-1.5 w-full justify-end">
                                {inst && (
                                  <Button size="sm" variant="outline"
                                    onClick={() => { removeBoard(entry.id); toast.success(`${entry.name} removed`); }}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button size="sm"
                                  disabled={!!inst && inst.version === pickedVersion}
                                  onClick={() => startInstall(entry)}>
                                  {inst && inst.version !== pickedVersion ? "Switch" : inst ? "Reinstall" : "Install"}
                                </Button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!loading && results.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No board packages match your search.
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="installed" className="flex-1 min-h-0 m-0">
            <ScrollArea className="h-full">
              <div className="px-6 py-3 space-y-2">
                {installed.length === 0 && (
                  <div className="py-12 text-center text-muted-foreground text-sm">
                    No boards installed yet. Switch to the Browse tab to add board support.
                  </div>
                )}
                {installed.map((b) => (
                  <div key={b.id} className="rounded-lg border bg-card p-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{b.name ?? b.id}</span>
                        <Badge variant="secondary" className="text-[10px]">v{b.version}</Badge>
                        {b.live && <Badge variant="outline" className="text-[10px] gap-1"><Wifi className="h-2.5 w-2.5" />live</Badge>}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{b.id}</div>
                      {b.boards && b.boards.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {b.boards.slice(0, 8).map((nm) => (
                            <Badge key={nm} variant="outline" className="text-[10px]">{nm}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="outline"
                      onClick={() => { removeBoard(b.id); toast.success(`${b.name ?? b.id} removed`); }}>
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
