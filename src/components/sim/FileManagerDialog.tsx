import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Upload, FolderPlus, FileText, Package } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listProjects, createProject, deleteProject,
  listProjectFiles, upsertProjectFile, deleteProjectFile,
  listProjectLibraries, addProjectLibrary, removeProjectLibrary,
} from "@/server/projects.functions";

interface Project { id: string; name: string; description: string | null; board: string | null; updated_at: string; }
interface PFile { id: string; path: string; kind: string; size: number; mime: string | null; storage_path: string | null; }
interface PLib { id: string; name: string; source: string; installed: boolean; }

const SOURCE_RE = /\.(ino|h|hpp|c|cpp)$/i;
const INCLUDE_RE = /^\s*#include\s*[<"]([^>"]+)\.h[>"]/gm;

export function FileManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void; }) {
  const fnList = useServerFn(listProjects);
  const fnCreate = useServerFn(createProject);
  const fnDelP = useServerFn(deleteProject);
  const fnFiles = useServerFn(listProjectFiles);
  const fnUpsert = useServerFn(upsertProjectFile);
  const fnDelF = useServerFn(deleteProjectFile);
  const fnLibs = useServerFn(listProjectLibraries);
  const fnAddLib = useServerFn(addProjectLibrary);
  const fnDelLib = useServerFn(removeProjectLibrary);

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [files, setFiles] = useState<PFile[]>([]);
  const [libs, setLibs] = useState<PLib[]>([]);
  const [newName, setNewName] = useState("");
  const [newLib, setNewLib] = useState("");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthed(!!data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setAuthed(!!s?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  const refreshProjects = async () => {
    const r = await fnList();
    setProjects(r.items as Project[]);
    if (!activeId && r.items[0]) setActiveId((r.items[0] as Project).id);
  };

  const refreshActive = async (id: string) => {
    const [f, l] = await Promise.all([fnFiles({ data: { projectId: id } }), fnLibs({ data: { projectId: id } })]);
    setFiles(f.items as PFile[]);
    setLibs(l.items as PLib[]);
  };

  useEffect(() => { if (open && authed) refreshProjects(); }, [open, authed]);
  useEffect(() => { if (activeId) refreshActive(activeId); }, [activeId]);

  // Auto-detect libs from #include directives in source files
  const detected = useMemo(() => {
    const set = new Set<string>();
    for (const f of files) {
      if (!f.id || !SOURCE_RE.test(f.path)) continue;
    }
    return Array.from(set);
  }, [files]);

  async function onCreateProject() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const p = await fnCreate({ data: { name: newName.trim() } });
      setNewName("");
      await refreshProjects();
      setActiveId((p as Project).id);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function onDeleteProject(id: string) {
    if (!confirm("Delete this project and all its files?")) return;
    await fnDelP({ data: { id } });
    if (activeId === id) setActiveId(null);
    await refreshProjects();
  }

  async function onUpload(filesIn: FileList | null) {
    if (!filesIn || !activeId) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setBusy(true);
    try {
      for (const file of Array.from(filesIn)) {
        const isSource = SOURCE_RE.test(file.name);
        if (isSource) {
          const content = await file.text();
          await fnUpsert({ data: { projectId: activeId, path: file.name, kind: "source", content, size: file.size, mime: file.type } });
          // auto-detect libs
          const found = new Set<string>();
          for (const m of content.matchAll(INCLUDE_RE)) found.add(m[1]);
          for (const name of found) {
            try { await fnAddLib({ data: { projectId: activeId, name, source: "auto" } }); } catch {}
          }
        } else {
          const kind = file.name.toLowerCase().endsWith(".zip") ? "lib_zip" : "asset";
          const path = `${u.user.id}/${activeId}/${Date.now()}-${file.name}`;
          const up = await supabase.storage.from("project-files").upload(path, file, { upsert: true });
          if (up.error) throw up.error;
          await fnUpsert({ data: { projectId: activeId, path: file.name, kind, size: file.size, mime: file.type, storagePath: path } });
        }
      }
      await refreshActive(activeId);
      toast.success("Uploaded");
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  async function onAddLib() {
    if (!newLib.trim() || !activeId) return;
    await fnAddLib({ data: { projectId: activeId, name: newLib.trim(), source: "manual" } });
    setNewLib("");
    await refreshActive(activeId);
  }

  if (authed === false) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sign in required</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Sign in to create projects and upload files.</p>
          <DialogFooter>
            <Button onClick={() => { onOpenChange(false); window.location.href = "/auth"; }}>Sign in</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>File Manager</DialogTitle></DialogHeader>
        <div className="grid grid-cols-[260px_1fr] gap-4 h-[520px]">
          {/* Projects sidebar */}
          <div className="border rounded-md flex flex-col">
            <div className="p-2 border-b flex gap-1">
              <Input placeholder="New project name" value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onCreateProject()} />
              <Button size="icon" onClick={onCreateProject} disabled={busy}><FolderPlus className="h-4 w-4" /></Button>
            </div>
            <ScrollArea className="flex-1">
              {projects.map((p) => (
                <div key={p.id}
                  className={`flex items-center justify-between px-2 py-2 text-sm cursor-pointer hover:bg-muted ${activeId === p.id ? "bg-muted" : ""}`}
                  onClick={() => setActiveId(p.id)}>
                  <span className="truncate">{p.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                    className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              {projects.length === 0 && <div className="p-3 text-xs text-muted-foreground">No projects yet.</div>}
            </ScrollArea>
          </div>

          {/* Detail tabs */}
          <div className="border rounded-md flex flex-col">
            {!activeId ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select or create a project.
              </div>
            ) : (
              <Tabs defaultValue="files" className="flex flex-col flex-1">
                <TabsList className="m-2">
                  <TabsTrigger value="files"><FileText className="h-4 w-4 mr-1" />Files</TabsTrigger>
                  <TabsTrigger value="libs"><Package className="h-4 w-4 mr-1" />Libraries</TabsTrigger>
                </TabsList>

                <TabsContent value="files" className="flex-1 flex flex-col px-2 pb-2 mt-0">
                  <div className="flex gap-2 mb-2">
                    <label className="inline-flex">
                      <input type="file" multiple className="hidden"
                        onChange={(e) => onUpload(e.target.files)}
                        accept=".ino,.h,.hpp,.c,.cpp,.zip,image/*,.csv,.json,.txt,.bin,.hex" />
                      <Button asChild variant="outline" size="sm"><span><Upload className="h-4 w-4 mr-1" />Upload</span></Button>
                    </label>
                    <span className="text-xs text-muted-foreground self-center">
                      .ino/.h/.cpp · images · .zip libs · data
                    </span>
                  </div>
                  <ScrollArea className="flex-1 border rounded">
                    {files.map((f) => (
                      <div key={f.id} className="flex items-center justify-between px-3 py-2 text-sm border-b last:border-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="text-xs">{f.kind}</Badge>
                          <span className="truncate">{f.path}</span>
                          <span className="text-xs text-muted-foreground">{Math.ceil(f.size / 1024)} KB</span>
                        </div>
                        <button onClick={() => fnDelF({ data: { id: f.id } }).then(() => refreshActive(activeId!))}
                          className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {files.length === 0 && <div className="p-3 text-xs text-muted-foreground">No files. Upload to get started.</div>}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="libs" className="flex-1 flex flex-col px-2 pb-2 mt-0">
                  <div className="flex gap-2 mb-2">
                    <Input placeholder="Library name (e.g. Servo)" value={newLib}
                      onChange={(e) => setNewLib(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && onAddLib()} />
                    <Button size="sm" onClick={onAddLib}><Plus className="h-4 w-4 mr-1" />Add</Button>
                  </div>
                  <ScrollArea className="flex-1 border rounded">
                    {libs.map((l) => (
                      <div key={l.id} className="flex items-center justify-between px-3 py-2 text-sm border-b last:border-0">
                        <div className="flex items-center gap-2">
                          <span>{l.name}</span>
                          <Badge variant={l.source === "auto" ? "secondary" : "outline"} className="text-xs">{l.source}</Badge>
                          {l.installed && <Badge className="text-xs">installed</Badge>}
                        </div>
                        <button onClick={() => fnDelLib({ data: { id: l.id } }).then(() => refreshActive(activeId!))}
                          className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {libs.length === 0 && <div className="p-3 text-xs text-muted-foreground">No libraries. Auto-detected from <code>#include</code> on upload, or add manually.</div>}
                  </ScrollArea>
                  {detected.length > 0 && <div className="text-xs text-muted-foreground mt-1">Detected: {detected.join(", ")}</div>}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
