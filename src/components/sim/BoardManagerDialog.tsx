import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Package, CheckCircle2, Trash2 } from "lucide-react";
import { BOARD_PACKAGES } from "@/sim/ideCatalog";
import { useIdeStore } from "@/sim/ideStore";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BoardManagerDialog({ open, onOpenChange }: Props) {
  const installed = useIdeStore((s) => s.installedBoards);
  const installBoard = useIdeStore((s) => s.installBoard);
  const removeBoard = useIdeStore((s) => s.removeBoard);
  const hydrate = useIdeStore((s) => s.hydrate);
  const loaded = useIdeStore((s) => s.loaded);

  useEffect(() => { if (!loaded) hydrate(); }, [loaded, hydrate]);

  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BOARD_PACKAGES;
    return BOARD_PACKAGES.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q) ||
      p.boards.some((b) => b.toLowerCase().includes(q)) ||
      p.description.toLowerCase().includes(q)
    );
  }, [query]);

  function isInstalled(id: string) {
    return installed.some((b) => b.id === id);
  }

  function startInstall(id: string, version: string, name: string) {
    setProgress((p) => ({ ...p, [id]: 5 }));
    let pct = 5;
    const tick = setInterval(() => {
      pct += Math.random() * 18;
      if (pct >= 100) {
        clearInterval(tick);
        setProgress((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
        installBoard(id, version);
        toast.success(`${name} installed`);
      } else {
        setProgress((p) => ({ ...p, [id]: pct }));
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
          </DialogTitle>
          <DialogDescription>
            Install board support packages. Installed boards appear in the simulator's board selector when supported.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b">
          <Input
            placeholder="Search packages by name, author, or board..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-3 space-y-3">
            {filtered.map((pkg) => {
              const installedFlag = isInstalled(pkg.id);
              const pct = progress[pkg.id];
              const isInstalling = pct !== undefined;
              return (
                <div key={pkg.id} className="rounded-lg border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold">{pkg.name}</h3>
                        <span className="text-xs text-muted-foreground">v{pkg.version}</span>
                        {installedFlag && (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Installed
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">by {pkg.author} · {pkg.size}</p>
                      <p className="text-sm mt-2">{pkg.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {pkg.boards.map((b) => (
                          <Badge key={b} variant="outline" className="text-[10px]">{b}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {isInstalling ? (
                        <div className="w-32">
                          <div className="text-xs text-muted-foreground mb-1">Installing... {Math.round(pct)}%</div>
                          <Progress value={pct} className="h-1.5" />
                        </div>
                      ) : installedFlag ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { removeBoard(pkg.id); toast.success(`${pkg.name} removed`); }}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Remove
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => startInstall(pkg.id, pkg.version, pkg.name)}>
                          Install
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 mx-auto mb-2 opacity-50" />
                No packages match your search.
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
