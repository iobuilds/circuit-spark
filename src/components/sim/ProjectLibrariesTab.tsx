import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Download, FolderOpen, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listProjects,
  listProjectLibraries,
  addProjectLibrary,
  removeProjectLibrary,
  setProjectLibraryInstalled,
} from "@/server/projects.functions";
import { installLibrariesStream, type InstallProgressEvent } from "@/services/compilerService";

interface Project { id: string; name: string; }
interface PLib { id: string; name: string; source: string; installed: boolean; }

const ACTIVE_KEY = "ide_active_project_id";

export function ProjectLibrariesTab({ visible }: { visible: boolean }) {
  const fnList = useServerFn(listProjects);
  const fnLibs = useServerFn(listProjectLibraries);
  const fnAdd = useServerFn(addProjectLibrary);
  const fnDel = useServerFn(removeProjectLibrary);
  const fnSet = useServerFn(setProjectLibraryInstalled);

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(
    typeof window !== "undefined" ? localStorage.getItem(ACTIVE_KEY) : null,
  );
  const [libs, setLibs] = useState<PLib[]>([]);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [batchLog, setBatchLog] = useState<string[]>([]);
  const [batching, setBatching] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!visible || !authed) return;
    fnList().then((r) => {
      const items = r.items as Project[];
      setProjects(items);
      if (!activeId && items[0]) {
        setActiveId(items[0].id);
        localStorage.setItem(ACTIVE_KEY, items[0].id);
      }
    }).catch((e) => toast.error((e as Error).message));
  }, [visible, authed]);

  const refresh = async (id: string) => {
    const r = await fnLibs({ data: { projectId: id } });
    setLibs(r.items as PLib[]);
  };

  useEffect(() => {
    if (activeId) refresh(activeId).catch(() => {});
  }, [activeId]);

  const missing = useMemo(() => libs.filter((l) => !l.installed), [libs]);

  async function onAdd() {
    const name = newName.trim();
    if (!name || !activeId) return;
    try {
      await fnAdd({ data: { projectId: activeId, name, source: "manual" } });
      setNewName("");
      await refresh(activeId);
    } catch (e) { toast.error((e as Error).message); }
  }

  async function onRemove(lib: PLib) {
    if (!activeId) return;
    await fnDel({ data: { id: lib.id } });
    await refresh(activeId);
  }

  async function onInstallOne(lib: PLib) {
    if (!activeId) return;
    setBusy((b) => ({ ...b, [lib.id]: true }));
    try {
      await installLibrariesStream([lib.name], (e: InstallProgressEvent) => {
        if (e.type === "install_done") {
          toast.success(`${lib.name} installed${e.message?.includes("cache") ? " (cached)" : ""}`);
        }
        if (e.type === "install_error") toast.error(`${lib.name}: ${e.error}`);
      });
      await fnSet({ data: { projectId: activeId, name: lib.name, installed: true } });
      await refresh(activeId);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy((b) => { const n = { ...b }; delete n[lib.id]; return n; });
    }
  }

  async function onInstallAllMissing() {
    if (!activeId || missing.length === 0) return;
    setBatching(true);
    setBatchLog([`▶ Installing ${missing.length} librar${missing.length === 1 ? "y" : "ies"}…`]);
    try {
      await installLibrariesStream(missing.map((l) => l.name), (e: InstallProgressEvent) => {
        if (e.type === "install_start") setBatchLog((L) => [...L, `… ${e.name} (${e.index}/${e.total})`]);
        if (e.type === "install_done")  setBatchLog((L) => [...L, `✓ ${e.name} ${e.message ?? ""}`]);
        if (e.type === "install_error") setBatchLog((L) => [...L, `✗ ${e.name}: ${e.error}`]);
      });
      // Mark all as installed in DB
      await Promise.all(missing.map((l) =>
        fnSet({ data: { projectId: activeId, name: l.name, installed: true } }).catch(() => null),
      ));
      setBatchLog((L) => [...L, "✓ Done"]);
      await refresh(activeId);
      toast.success("Project libraries installed");
    } catch (e) {
      setBatchLog((L) => [...L, `✗ ${(e as Error).message}`]);
      toast.error((e as Error).message);
    } finally {
      setBatching(false);
    }
  }

  if (authed === false) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground p-8 text-center">
        <div>
          Sign in to manage per-project libraries.<br />
          <Button size="sm" className="mt-3" onClick={() => (window.location.href = "/auth")}>Sign in</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-6 py-3 border-b flex items-center gap-2">
        <FolderOpen className="h-4 w-4 text-muted-foreground" />
        <Select
          value={activeId ?? ""}
          onValueChange={(v) => { setActiveId(v); localStorage.setItem(ACTIVE_KEY, v); }}
        >
          <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select a project" /></SelectTrigger>
          <SelectContent>
            {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Badge variant="secondary">{libs.length} libs</Badge>
        {missing.length > 0 && (
          <Button size="sm" onClick={onInstallAllMissing} disabled={batching}>
            {batching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5 mr-1.5" />}
            Install {missing.length} missing
          </Button>
        )}
      </div>

      {!activeId ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          {projects.length === 0
            ? "No projects yet. Create one in File Manager first."
            : "Pick a project to manage its libraries."}
        </div>
      ) : (
        <>
          <div className="px-6 py-2 border-b flex gap-2">
            <Input
              placeholder="Library name (e.g. Adafruit SSD1306)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAdd()}
            />
            <Button size="sm" onClick={onAdd}><Plus className="h-3.5 w-3.5 mr-1" /> Add</Button>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-3 space-y-2">
              {libs.map((l) => (
                <div key={l.id} className="rounded-md border bg-card p-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{l.name}</span>
                      <Badge variant={l.source === "auto" ? "secondary" : "outline"} className="text-[10px]">
                        {l.source === "auto" ? "auto-detected" : "manual"}
                      </Badge>
                      {l.installed ? (
                        <Badge className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> installed</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px]">not installed</Badge>
                      )}
                    </div>
                  </div>
                  {!l.installed && (
                    <Button size="sm" onClick={() => onInstallOne(l)} disabled={!!busy[l.id]}>
                      {busy[l.id] ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                      Install
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => onRemove(l)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              {libs.length === 0 && (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  No libraries tracked for this project. Add one above, or upload a sketch in File Manager
                  to auto-detect <code>#include</code> directives.
                </div>
              )}
            </div>
          </ScrollArea>

          {batchLog.length > 0 && (
            <div className="border-t bg-muted/30 px-6 py-2 max-h-32 overflow-y-auto font-mono text-[11px] space-y-0.5">
              {batching && <Progress value={undefined} className="h-1 mb-1" />}
              {batchLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
