import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Library, Star, Trash2, Upload } from "lucide-react";
import { LIBRARY_PACKAGES, LIBRARY_TOPICS, type LibraryPackage, type LibraryTopic } from "@/sim/ideCatalog";
import { useIdeStore } from "@/sim/ideStore";
import { uploadZipLibrary } from "@/sim/compileApi";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SortKey = "relevance" | "name" | "stars" | "recent";
type FilterType = "All" | "Recommended" | "Contributed" | "Partner" | "Retired";

export function LibraryManagerDialog({ open, onOpenChange }: Props) {
  const installed = useIdeStore((s) => s.installedLibraries);
  const installLib = useIdeStore((s) => s.installLibrary);
  const removeLib = useIdeStore((s) => s.removeLibrary);
  const hydrate = useIdeStore((s) => s.hydrate);
  const loaded = useIdeStore((s) => s.loaded);

  useEffect(() => { if (!loaded) hydrate(); }, [loaded, hydrate]);

  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<"All" | LibraryTopic>("All");
  const [type, setType] = useState<FilterType>("All");
  const [sort, setSort] = useState<SortKey>("relevance");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr: LibraryPackage[] = LIBRARY_PACKAGES.filter((l) => {
      if (topic !== "All" && l.topic !== topic) return false;
      if (type !== "All" && l.type !== type) return false;
      if (!q) return true;
      return (
        l.name.toLowerCase().includes(q) ||
        l.author.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.headers.some((h) => h.toLowerCase().includes(q))
      );
    });

    if (sort === "name") arr = [...arr].sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "stars") arr = [...arr].sort((a, b) => b.stars - a.stars);
    else if (sort === "recent") arr = [...arr].sort((a, b) => a.id.localeCompare(b.id));
    return arr;
  }, [query, topic, type, sort]);

  function isInstalled(id: string) {
    return installed.some((l) => l.id === id);
  }

  function startInstall(lib: LibraryPackage) {
    setProgress((p) => ({ ...p, [lib.id]: 5 }));
    let pct = 5;
    const tick = setInterval(() => {
      pct += Math.random() * 22;
      if (pct >= 100) {
        clearInterval(tick);
        setProgress((p) => {
          const next = { ...p };
          delete next[lib.id];
          return next;
        });
        installLib({ id: lib.id, version: lib.version, name: lib.name, headers: lib.headers });
        toast.success(`${lib.name} installed`);
      } else {
        setProgress((p) => ({ ...p, [lib.id]: pct }));
      }
    }, 160);
  }

  async function onZipPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.name.toLowerCase().endsWith(".zip")) {
      toast.error("Please select a .zip file");
      return;
    }
    const tmpId = `__zip_${file.name}`;
    setProgress((p) => ({ ...p, [tmpId]: 10 }));
    let pct = 10;
    const tick = setInterval(() => {
      pct = Math.min(85, pct + Math.random() * 15);
      setProgress((p) => ({ ...p, [tmpId]: pct }));
    }, 150);

    try {
      const result = await uploadZipLibrary(file);
      clearInterval(tick);
      setProgress((p) => {
        const next = { ...p };
        delete next[tmpId];
        return next;
      });
      if (!result.success || !result.name) {
        toast.error(result.error ?? "Failed to install ZIP library");
        return;
      }
      installLib({
        id: `zip-${result.name}`,
        version: "1.0.0",
        name: result.name,
        headers: result.headers ?? [],
        custom: true,
      });
      toast.success(`${result.name} installed from ZIP`);
    } catch (err) {
      clearInterval(tick);
      setProgress((p) => {
        const next = { ...p };
        delete next[tmpId];
        return next;
      });
      toast.error((err as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Library Manager
          </DialogTitle>
          <DialogDescription>
            Browse and install Arduino libraries. Library headers become available for autocomplete in the editor.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b grid grid-cols-1 md:grid-cols-12 gap-2">
          <Input
            className="md:col-span-5"
            placeholder="Search by name, author, keyword..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select value={topic} onValueChange={(v) => setTopic(v as typeof topic)}>
            <SelectTrigger className="md:col-span-3"><SelectValue placeholder="Topic" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All topics</SelectItem>
              {LIBRARY_TOPICS.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={(v) => setType(v as FilterType)}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              {(["All", "Recommended", "Contributed", "Partner", "Retired"] as FilterType[]).map((t) =>
                <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="md:col-span-2"><SelectValue placeholder="Sort" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
              <SelectItem value="stars">Most starred</SelectItem>
              <SelectItem value="recent">Recently updated</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="px-6 py-2 border-b flex items-center gap-2 text-xs text-muted-foreground">
          <span>{filtered.length} libraries</span>
          <span className="mx-1">·</span>
          <span>{installed.length} installed</span>
          <div className="flex-1" />
          <input
            ref={fileRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={onZipPicked}
          />
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Add .ZIP Library...
          </Button>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-3 space-y-2">
            {filtered.map((lib) => {
              const installedFlag = isInstalled(lib.id);
              const pct = progress[lib.id];
              const isInstalling = pct !== undefined;
              return (
                <div key={lib.id} className="rounded-md border bg-card p-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{lib.name}</span>
                      <span className="text-xs text-muted-foreground">v{lib.version}</span>
                      <Badge variant="outline" className="text-[10px]">{lib.topic}</Badge>
                      <Badge variant="outline" className="text-[10px]">{lib.type}</Badge>
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                        <Star className="h-3 w-3" />{lib.stars}
                      </span>
                      {installedFlag && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" /> Installed
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">by {lib.author}</p>
                    <p className="text-sm mt-1">{lib.description}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                      {lib.headers.map((h) => `<${h}>`).join("  ")}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {isInstalling ? (
                      <div className="w-28">
                        <div className="text-xs text-muted-foreground mb-1">{Math.round(pct)}%</div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    ) : installedFlag ? (
                      <Button size="sm" variant="outline" onClick={() => { removeLib(lib.id); toast.success(`${lib.name} removed`); }}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => startInstall(lib)}>Install</Button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Show in-progress ZIP uploads */}
            {Object.entries(progress).filter(([k]) => k.startsWith("__zip_")).map(([k, pct]) => (
              <div key={k} className="rounded-md border bg-muted/30 p-3 flex items-center gap-3">
                <Upload className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm">{k.replace("__zip_", "")}</div>
                  <Progress value={pct} className="h-1.5 mt-1" />
                </div>
                <span className="text-xs text-muted-foreground">{Math.round(pct)}%</span>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">No libraries match your filters.</div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
