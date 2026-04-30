import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, ExternalLink, Library, Loader2, Trash2, Upload, Wifi, WifiOff } from "lucide-react";
import { LIBRARY_PACKAGES } from "@/sim/ideCatalog";
import { useIdeStore } from "@/sim/ideStore";
import { uploadZipLibrary } from "@/sim/compileApi";
import {
  ARDUINO_CATEGORIES,
  ARDUINO_TYPES,
  searchArduinoLibraries,
  type ArduinoLibraryEntry,
} from "@/sim/arduinoLibraryApi";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Convert curated catalog entries into the same shape we use for live results,
// so we can show both lists with one renderer when the API is unreachable.
function curatedAsArduinoEntries(): ArduinoLibraryEntry[] {
  return LIBRARY_PACKAGES.map((l) => ({
    id: l.id,
    name: l.name,
    author: l.author,
    maintainer: l.author,
    latestVersion: l.version,
    versions: [l.version],
    sentence: l.description,
    paragraph: "",
    website: "",
    category: l.topic,
    architectures: ["*"],
    types: [l.type],
    headers: l.headers,
    downloadUrl: "",
    archiveFileName: "",
    size: 0,
  }));
}

export function LibraryManagerDialog({ open, onOpenChange }: Props) {
  const installed = useIdeStore((s) => s.installedLibraries);
  const installLib = useIdeStore((s) => s.installLibrary);
  const removeLib = useIdeStore((s) => s.removeLibrary);
  const hydrate = useIdeStore((s) => s.hydrate);
  const loaded = useIdeStore((s) => s.loaded);

  useEffect(() => { if (!loaded) hydrate(); }, [loaded, hydrate]);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [type, setType] = useState<string>("All");
  const [results, setResults] = useState<ArduinoLibraryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null); // null = unknown, true = live, false = fallback
  const [total, setTotal] = useState<number | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const fileRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced live search against the Arduino index.
  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const handle = setTimeout(async () => {
      setLoading(true);
      const res = await searchArduinoLibraries({
        q: query,
        category,
        type,
        limit: 80,
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;

      if (res.ok) {
        setOnline(true);
        setResults(res.results);
        setTotal(res.total ?? res.results.length);
      } else if (res.error !== "aborted") {
        // Fall back to curated catalog so search still works offline / on first load.
        setOnline(false);
        const q = query.trim().toLowerCase();
        const curated = curatedAsArduinoEntries().filter((e) => {
          if (category !== "All" && e.category !== category) return false;
          if (type !== "All" && !e.types.includes(type)) return false;
          if (!q) return true;
          return (
            e.name.toLowerCase().includes(q) ||
            e.author.toLowerCase().includes(q) ||
            e.sentence.toLowerCase().includes(q) ||
            e.headers.some((h) => h.toLowerCase().includes(q))
          );
        });
        setResults(curated);
        setTotal(curated.length);
      }
      setLoading(false);
    }, query ? 300 : 0);

    return () => {
      clearTimeout(handle);
      ctrl.abort();
    };
  }, [open, query, category, type]);

  function isInstalled(id: string, name: string) {
    return installed.some((l) => l.id === id || l.name === name);
  }

  function startInstall(lib: ArduinoLibraryEntry) {
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
        installLib({
          id: lib.id,
          version: lib.latestVersion,
          name: lib.name,
          headers: lib.headers,
        });
        toast.success(`${lib.name} installed`);
      } else {
        setProgress((p) => ({ ...p, [lib.id]: pct }));
      }
    }, 140);
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

  const statusLabel = useMemo(() => {
    if (online === null) return "Connecting to Arduino library index…";
    if (online) return "Live · Arduino library index";
    return "Offline · curated catalog";
  }, [online]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Library className="h-5 w-5" />
            Library Manager
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            {online === true ? (
              <Wifi className="h-3.5 w-3.5 text-green-500" />
            ) : online === false ? (
              <WifiOff className="h-3.5 w-3.5 text-amber-500" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            )}
            <span>{statusLabel} — same index used by the Arduino IDE.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b grid grid-cols-1 md:grid-cols-12 gap-2">
          <Input
            className="md:col-span-6"
            placeholder="Search Arduino libraries (e.g. BNO055, Adafruit, DHT, Servo)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="md:col-span-3"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              {ARDUINO_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="md:col-span-3"><SelectValue placeholder="Topic" /></SelectTrigger>
            <SelectContent>
              {ARDUINO_CATEGORIES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="px-6 py-2 border-b flex items-center gap-2 text-xs text-muted-foreground">
          {loading ? (
            <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Searching…</span>
          ) : (
            <span>
              {results.length} shown
              {total !== null && total > results.length ? <> · {total.toLocaleString()} total</> : null}
            </span>
          )}
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
            {results.map((lib) => {
              const installedFlag = isInstalled(lib.id, lib.name);
              const pct = progress[lib.id];
              const isInstalling = pct !== undefined;
              return (
                <div key={lib.id} className="rounded-md border bg-card p-3 flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{lib.name}</span>
                      <span className="text-xs text-muted-foreground">v{lib.latestVersion}</span>
                      {lib.category && <Badge variant="outline" className="text-[10px]">{lib.category}</Badge>}
                      {lib.types?.[0] && <Badge variant="outline" className="text-[10px]">{lib.types[0]}</Badge>}
                      {installedFlag && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" /> Installed
                        </Badge>
                      )}
                    </div>
                    {(lib.author || lib.maintainer) && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        by {lib.author || lib.maintainer}
                      </p>
                    )}
                    {lib.sentence && <p className="text-sm mt-1">{lib.sentence}</p>}
                    {lib.paragraph && lib.paragraph !== lib.sentence && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{lib.paragraph}</p>
                    )}
                    {lib.headers.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1 font-mono">
                        {lib.headers.slice(0, 4).map((h) => `<${h}>`).join("  ")}
                      </p>
                    )}
                    {lib.website && (
                      <a
                        href={lib.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-primary mt-1 hover:underline"
                      >
                        More info <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="shrink-0">
                    {isInstalling ? (
                      <div className="w-28">
                        <div className="text-xs text-muted-foreground mb-1">{Math.round(pct)}%</div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    ) : installedFlag ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // remove by id OR name match (live entries may have different ids)
                          const match = installed.find((l) => l.id === lib.id || l.name === lib.name);
                          if (match) removeLib(match.id);
                          toast.success(`${lib.name} removed`);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => startInstall(lib)}>Install</Button>
                    )}
                  </div>
                </div>
              );
            })}

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

            {!loading && results.length === 0 && (
              <div className="py-12 text-center text-muted-foreground text-sm">
                {query
                  ? `No libraries match “${query}”.`
                  : "Type a library name to search the Arduino index."}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
