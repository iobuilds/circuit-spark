import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Loader2, Send, Save, Download, Upload, Trash2, Sparkles, ArrowLeft, Pencil, X, BookOpen, Check, Library, ExternalLink, ImagePlus, MessageSquarePlus, MessagesSquare, Eraser, Code2, Eye } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useServerFn } from "@tanstack/react-start";
import {
  aiBuilderChat,
  saveCustomComponent,
  deleteCustomComponent,
  findArduinoLibraries,
} from "@/server/customComponents.functions";
import {
  useCustomComponentRegistry,
  importedToRow,
} from "@/sim/customComponentRegistry";
import {
  exportComponentZip,
  importComponentZip,
  downloadBlob,
  type CustomComponentRow,
} from "@/sim/componentPack";
import { CustomComponentSvg } from "@/components/sim/CustomComponentSvg";
import { ComponentBehaviorPreview } from "@/components/sim/ComponentBehaviorPreview";

export const Route = createFileRoute("/admin/ai")({
  head: () => ({
    meta: [
      { title: "Admin · AI Component Builder" },
      { name: "description", content: "Build custom components and boards using AI chat. Export and import as ZIP packs." },
    ],
  }),
  component: AdminPage,
});

interface ChatMsg { role: "user" | "assistant"; content: string; images?: string[] }
interface Conversation { id: string; title: string; messages: ChatMsg[]; updatedAt: number }

const CONVO_STORAGE_KEY = "admin-ai-conversations-v1";
const ACTIVE_CONVO_KEY = "admin-ai-active-conversation-v1";

const INITIAL_GREETING: ChatMsg = {
  role: "assistant",
  content: "Hi! Describe a component or board you want to build — for example: *'a small DC motor with speed and direction inputs that burns over 12V'*. You don't need to provide an SVG; I'll draw one for you. Once we agree, say **build it** and I'll emit a final spec with a live behavior simulator.",
};

function newConversation(): Conversation {
  return {
    id: `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: "New conversation",
    messages: [INITIAL_GREETING],
    updatedAt: Date.now(),
  };
}

function loadConversations(): { list: Conversation[]; activeId: string } {
  if (typeof window === "undefined") {
    const c = newConversation();
    return { list: [c], activeId: c.id };
  }
  try {
    const raw = localStorage.getItem(CONVO_STORAGE_KEY);
    const list: Conversation[] = raw ? JSON.parse(raw) : [];
    const activeId = localStorage.getItem(ACTIVE_CONVO_KEY) ?? "";
    if (list.length === 0) {
      const c = newConversation();
      return { list: [c], activeId: c.id };
    }
    return { list, activeId: list.find((c) => c.id === activeId)?.id ?? list[0].id };
  } catch {
    const c = newConversation();
    return { list: [c], activeId: c.id };
  }
}

function deriveTitle(messages: ChatMsg[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "New conversation";
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  return t.length > 40 ? t.slice(0, 40) + "…" : t || "New conversation";
}

interface ArduinoLibMatch {
  name: string;
  version: string;
  author: string;
  sentence: string;
  paragraph?: string;
  website?: string;
  repository?: string;
  category?: string;
  architectures: string[];
  score: number;
  matchedTerms: string[];
}

interface PendingSpec {
  name: string;
  slug: string;
  kind: "component" | "board";
  description: string;
  svg: string;
  width: number;
  height: number;
  pins: { id: string; label: string; x: number; y: number; role?: string }[];
  behaviorNotes?: string;
  behavior?: {
    params?: Array<{
      id: string;
      label: string;
      type: "number" | "boolean" | "enum";
      min?: number;
      max?: number;
      step?: number;
      default?: number | boolean | string;
      options?: string[];
      unit?: string;
    }>;
    states?: Array<{
      id: string;
      label: string;
      when?: string;
      visual?: {
        filter?: string;
        spinSelector?: string;
        glowSelector?: string;
        flickerSelector?: string;
        overlay?: "smoke" | "spark" | "flame" | null;
      };
    }>;
    failures?: Array<{ when: string; state: string; reason: string }>;
    notes?: string;
  };
  defaults?: Record<string, string | number | boolean>;
}

function AdminPage() {
  const items = useCustomComponentRegistry((s) => s.items);
  const load = useCustomComponentRegistry((s) => s.load);
  const upsertLocal = useCustomComponentRegistry((s) => s.upsertLocal);
  const removeLocal = useCustomComponentRegistry((s) => s.removeLocal);

  const chatFn = useServerFn(aiBuilderChat);
  const saveFn = useServerFn(saveCustomComponent);
  const deleteFn = useServerFn(deleteCustomComponent);
  const libsFn = useServerFn(findArduinoLibraries);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [input, setInput] = useState("");

  // Hydrate conversations on mount (client-only).
  useEffect(() => {
    const { list, activeId } = loadConversations();
    setConversations(list);
    setActiveId(activeId);
  }, []);

  const activeConvo = conversations.find((c) => c.id === activeId);
  const messages = activeConvo?.messages ?? [INITIAL_GREETING];

  // Persist whenever conversations change.
  useEffect(() => {
    if (conversations.length === 0) return;
    try {
      localStorage.setItem(CONVO_STORAGE_KEY, JSON.stringify(conversations));
      if (activeId) localStorage.setItem(ACTIVE_CONVO_KEY, activeId);
    } catch { /* ignore quota */ }
  }, [conversations, activeId]);

  function setMessages(updater: ChatMsg[] | ((prev: ChatMsg[]) => ChatMsg[])) {
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeId) return c;
        const next = typeof updater === "function" ? (updater as (p: ChatMsg[]) => ChatMsg[])(c.messages) : updater;
        return { ...c, messages: next, title: deriveTitle(next), updatedAt: Date.now() };
      }),
    );
  }

  function startNewConversation() {
    const c = newConversation();
    setConversations((prev) => [c, ...prev]);
    setActiveId(c.id);
    setPending(null);
    setSavedId(null);
    setInput("");
    setPendingImages([]);
  }

  function clearActiveConversation() {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeId ? { ...c, messages: [INITIAL_GREETING], title: "New conversation", updatedAt: Date.now() } : c,
      ),
    );
    setPending(null);
    setSavedId(null);
  }

  function deleteConversation(id: string) {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (next.length === 0) {
        const c = newConversation();
        setActiveId(c.id);
        return [c];
      }
      if (id === activeId) setActiveId(next[0].id);
      return next;
    });
  }

  function switchConversation(id: string) {
    setActiveId(id);
    setPending(null);
    setSavedId(null);
    setInput("");
    setPendingImages([]);
  }

  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSpec | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [libs, setLibs] = useState<ArduinoLibMatch[]>([]);
  const [libsLoading, setLibsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [load]);

  // Auto-fetch compatible Arduino libraries whenever a spec is set/changed.
  useEffect(() => {
    if (!pending) {
      setLibs([]);
      return;
    }
    let cancelled = false;
    setLibsLoading(true);
    libsFn({
      data: {
        name: pending.name,
        slug: pending.slug,
        description: pending.description,
        keywords: pending.pins.map((p) => p.label).slice(0, 6),
        limit: 8,
      },
    })
      .then((r) => {
        if (!cancelled) setLibs((r.matches as ArduinoLibMatch[]) ?? []);
      })
      .catch(() => { if (!cancelled) setLibs([]); })
      .finally(() => { if (!cancelled) setLibsLoading(false); });
    return () => { cancelled = true; };
  }, [pending?.slug, pending?.name, pending?.description, libsFn]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addChatImages(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const room = Math.max(0, 4 - pendingImages.length);
    const slice = arr.slice(0, room);
    if (arr.length > room) toast.warning("Max 4 images per message");
    const dataUrls = await Promise.all(
      slice.map(
        (f) =>
          new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(r.error);
            r.readAsDataURL(f);
          }),
      ),
    );
    setPendingImages((prev) => [...prev, ...dataUrls]);
  }

  async function send() {
    const text = input.trim();
    const imgs = pendingImages;
    if ((!text && imgs.length === 0) || busy) return;
    setInput("");
    setPendingImages([]);
    const userMsg: ChatMsg = { role: "user", content: text || "(image)", images: imgs };
    const next = [...messages, userMsg];
    setMessages(next);
    setBusy(true);
    try {
      const res = await chatFn({
        data: {
          history: next.map(({ role, content }) => ({ role, content })),
          message: text || "Use the attached reference image(s) to design this component.",
          images: imgs,
          // Send the live working spec so the model can MUTATE it instead of
          // regenerating from scratch on every follow-up.
          currentSpec: pending ?? undefined,
        },
      });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      if (res.spec) {
        setPending(res.spec as PendingSpec);
        setSavedId(null);
      }
    } catch (e) {
      toast.error(`AI error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    if (!pending) return;
    try {
      const row = await saveFn({ data: { spec: pending as never } });
      upsertLocal(row as unknown as CustomComponentRow);
      toast.success(`Saved ${pending.name} to library`);
      setSavedId((row as unknown as CustomComponentRow).id);
      // Keep `pending` visible — user explicitly clears it.
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  function clearPending() {
    setPending(null);
    setSavedId(null);
  }

  function editComponent(c: CustomComponentRow) {
    const spec = (c.spec ?? {}) as Partial<PendingSpec>;
    setPending({
      name: c.name,
      slug: c.slug,
      kind: (c.kind as "component" | "board") ?? "component",
      description: c.description ?? "",
      svg: c.svg ?? "",
      width: spec.width ?? 160,
      height: spec.height ?? 120,
      pins: spec.pins ?? [],
      behaviorNotes: spec.behaviorNotes ?? c.behavior ?? "",
      behavior: spec.behavior,
      defaults: spec.defaults,
    });
    setSavedId(c.id);
    setMessages((m) => [
      ...m,
      { role: "assistant", content: `Loaded **${c.name}** for editing. Tell me what to change (e.g. "add a 3rd pin", "make the screen larger", "lower burn voltage to 8V"), then say **build it** to re-emit. Saving will bump the version.` },
    ]);
  }

  async function handleExport(c: CustomComponentRow) {
    const blob = await exportComponentZip(c);
    downloadBlob(blob, `${c.slug}-v${c.version}.zip`);
  }

  async function handleImportFile(file: File) {
    try {
      const imp = await importComponentZip(file);
      // Load into the live preview so the user can verify before saving.
      setPending({
        name: imp.name,
        slug: imp.slug,
        kind: imp.kind,
        description: imp.description,
        svg: imp.svg,
        width: imp.width,
        height: imp.height,
        pins: imp.pins,
        behaviorNotes: imp.behaviorNotes,
        behavior: imp.behavior as PendingSpec["behavior"],
        defaults: imp.defaults,
      });
      setSavedId(null);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Imported **${imp.name}** from ZIP. Preview below — click *Save to library* to persist, or keep editing in chat.` },
      ]);
      // Best-effort: also try to upsert immediately to the shared library.
      try {
        const row = await saveFn({ data: { spec: { ...imp, behaviorNotes: imp.behaviorNotes ?? "" } as never } });
        upsertLocal(row as unknown as CustomComponentRow);
        setSavedId((row as unknown as CustomComponentRow).id);
        toast.success(`Imported & saved ${imp.name}`);
      } catch (e) {
        upsertLocal(importedToRow(imp));
        toast.warning(`Imported locally (save failed: ${(e as Error).message})`);
      }
    } catch (e) {
      toast.error(`Import failed: ${(e as Error).message}`);
    }
  }

  async function handleDelete(c: CustomComponentRow) {
    if (!confirm(`Delete ${c.name}?`)) return;
    try {
      await deleteFn({ data: { id: c.id } });
      removeLocal(c.id);
      toast.success("Deleted");
    } catch (e) {
      toast.error(`Delete failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <header className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <Sparkles className="h-4 w-4 text-primary" />
        <h1 className="font-semibold">AI Component Builder</h1>
        <span className="text-xs text-muted-foreground">/admin · no auth</span>
        <div className="flex-1" />
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
            e.currentTarget.value = "";
          }}
        />
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5 mr-1.5" /> Import ZIP
        </Button>
      </header>

      <div className="flex-1 min-h-0 grid grid-cols-[1fr_1fr_320px]">
        {/* Chat panel */}
        <section className="flex flex-col border-r border-border min-h-0 min-w-0">
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-muted/30">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 max-w-[60%] justify-start">
                  <MessagesSquare className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{activeConvo?.title ?? "Conversation"}</span>
                  <span className="text-muted-foreground text-[10px] shrink-0">({conversations.length})</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-auto">
                <DropdownMenuLabel className="text-xs">Conversations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {[...conversations].sort((a, b) => b.updatedAt - a.updatedAt).map((c) => (
                  <DropdownMenuItem
                    key={c.id}
                    onSelect={(e) => { e.preventDefault(); switchConversation(c.id); }}
                    className="flex items-center gap-2 group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate">{c.title}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {c.messages.length} msg{c.id === activeId ? " · active" : ""}
                      </div>
                    </div>
                    {conversations.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteConversation(c.id); }}
                        className="opacity-0 group-hover:opacity-100 text-destructive p-1"
                        aria-label="Delete conversation"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={startNewConversation} title="New conversation">
              <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clearActiveConversation} title="Clear messages in this conversation">
              <Eraser className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`text-sm min-w-0 ${m.role === "user" ? "text-foreground" : "text-foreground/90"}`}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                  {m.role === "user" ? "You" : "AI"}
                </div>
                {m.images && m.images.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {m.images.map((src, j) => (
                      <img key={j} src={src} alt="" className="h-20 w-20 object-cover rounded border border-border" />
                    ))}
                  </div>
                )}
                <div className="whitespace-pre-wrap break-words leading-relaxed">{m.content}</div>
              </div>
            ))}
            {busy && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking...
              </div>
            )}
          </div>
          <div className="border-t border-border p-2 space-y-2">
            {pendingImages.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {pendingImages.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt="" className="h-14 w-14 object-cover rounded border border-border" />
                    <button
                      type="button"
                      onClick={() => setPendingImages((p) => p.filter((_, j) => j !== i))}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5"
                      aria-label="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                ref={chatImageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addChatImages(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => chatImageInputRef.current?.click()}
                disabled={busy || pendingImages.length >= 4}
                title="Attach reference image"
              >
                <ImagePlus className="h-4 w-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
                  if (files.length) {
                    e.preventDefault();
                    addChatImages(files);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Describe the component, paste an image, or say 'build it'..."
                className="min-h-[60px] max-h-32 resize-none text-sm flex-1"
              />
              <Button onClick={send} disabled={busy || (!input.trim() && pendingImages.length === 0)}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>

        {/* Live preview */}
        <section className="flex flex-col border-r border-border bg-muted/20">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide">Live Preview</span>
            {savedId && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                <Check className="h-3 w-3" /> saved
              </span>
            )}
            <div className="flex-1" />
            {pending && (
              <>
                <Button size="sm" onClick={saveCurrent}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {savedId ? "Save new version" : "Save to library"}
                </Button>
                <Button size="sm" variant="ghost" onClick={clearPending} title="Clear preview">
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-6 space-y-4">
            {pending ? (
              <>
                <Card className="p-4 max-w-md mx-auto">
                  <ComponentBehaviorPreview
                    spec={{
                      name: pending.name,
                      width: pending.width,
                      height: pending.height,
                      svg: pending.svg,
                      pins: pending.pins,
                      behavior: pending.behavior,
                    }}
                  />
                  <div className="space-y-2 text-sm mt-4 pt-3 border-t border-border">
                    <div className="flex items-center justify-between">
                      <strong>{pending.name}</strong>
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {pending.kind}
                      </span>
                    </div>
                    <div className="text-muted-foreground text-xs">{pending.description}</div>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <Input
                        value={pending.name}
                        onChange={(e) => setPending({ ...pending, name: e.target.value })}
                        placeholder="Name"
                      />
                      <Input
                        value={pending.slug}
                        onChange={(e) => setPending({ ...pending, slug: e.target.value })}
                        placeholder="Slug"
                      />
                    </div>
                  </div>
                </Card>

                {/* Documentation / Usage */}
                <Card className="p-4 max-w-md mx-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Documentation &amp; Usage</h3>
                  </div>

                  {pending.behaviorNotes && (
                    <p className="text-xs text-muted-foreground mb-3">{pending.behaviorNotes}</p>
                  )}

                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Pinout</div>
                  <table className="w-full text-xs mb-3 border-collapse">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="py-1 pr-2 font-medium">Pin</th>
                        <th className="py-1 pr-2 font-medium">Role</th>
                        <th className="py-1 pr-2 font-medium">Position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.pins.map((p) => (
                        <tr key={p.id} className="border-b border-border/50">
                          <td className="py-1 pr-2 font-mono">{p.label}</td>
                          <td className="py-1 pr-2 text-muted-foreground">{p.role ?? "—"}</td>
                          <td className="py-1 pr-2 text-muted-foreground font-mono">{p.x},{p.y}</td>
                        </tr>
                      ))}
                      {pending.pins.length === 0 && (
                        <tr><td colSpan={3} className="py-2 text-muted-foreground italic">No pins.</td></tr>
                      )}
                    </tbody>
                  </table>

                  {pending.behavior?.params && pending.behavior.params.length > 0 && (
                    <>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Parameters</div>
                      <ul className="text-xs space-y-1 mb-3">
                        {pending.behavior.params.map((p) => (
                          <li key={p.id} className="flex justify-between gap-2">
                            <span><span className="font-mono">{p.id}</span> <span className="text-muted-foreground">— {p.label}</span></span>
                            <span className="text-muted-foreground font-mono text-[10px]">
                              {p.type}{p.type === "number" && p.min !== undefined ? ` ${p.min}..${p.max ?? "?"}${p.unit ? p.unit : ""}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {pending.behavior?.failures && pending.behavior.failures.length > 0 && (
                    <>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Failure modes</div>
                      <ul className="text-xs space-y-1 mb-3">
                        {pending.behavior.failures.map((f, i) => (
                          <li key={i} className="text-destructive/90">
                            <span className="font-mono">{f.when}</span> → {f.reason}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Wiring example</div>
                  <pre className="text-[11px] font-mono bg-muted/50 rounded p-2 overflow-x-auto leading-relaxed">{buildWiringExample(pending)}</pre>
                </Card>

                {/* Compatible Arduino libraries (live from Arduino library index) */}
                <Card className="p-4 max-w-md mx-auto">
                  <div className="flex items-center gap-2 mb-2">
                    <Library className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Compatible Arduino libraries</h3>
                    {libsLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Pulled live from the official Arduino library registry, ranked by relevance.
                  </p>
                  {!libsLoading && libs.length === 0 && (
                    <div className="text-xs text-muted-foreground italic">No matches found in the Arduino library index.</div>
                  )}
                  <ul className="space-y-2">
                    {libs.map((l) => (
                      <li key={`${l.name}@${l.version}`} className="text-xs border border-border rounded p-2 bg-muted/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-foreground truncate">{l.name}</div>
                            <div className="text-[10px] text-muted-foreground truncate">
                              v{l.version} · by {l.author}{l.category ? ` · ${l.category}` : ""}
                            </div>
                          </div>
                          {(l.website || l.repository) && (
                            <a
                              href={l.website || l.repository}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary shrink-0 hover:underline inline-flex items-center gap-0.5"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                        {l.sentence && (
                          <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{l.sentence}</div>
                        )}
                        <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                          #include &lt;{libIncludeName(l.name)}.h&gt;
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-sm text-muted-foreground text-center max-w-sm">
                  Chat with the AI to design a component. The live behavior simulator (with sliders, state badges, and failure modes like &quot;burned&quot;) appears here when a spec is ready. Saved components can be re-edited from the library on the right.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Library */}
        <aside className="flex flex-col bg-card">
          <div className="px-3 py-2 border-b border-border flex items-center">
            <span className="text-xs font-medium uppercase tracking-wide">Library</span>
            <span className="ml-2 text-xs text-muted-foreground">{items.length}</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-2 space-y-2">
            {items.length === 0 && (
              <div className="text-xs text-muted-foreground p-3 text-center space-y-2">
                <div>No saved components yet.</div>
                <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1.5" /> Import a ZIP pack
                </Button>
              </div>
            )}
            {items.map((c) => (
              <Card key={c.id} className={`p-2 space-y-2 ${savedId === c.id ? "ring-1 ring-primary/50" : ""}`}>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-12 flex items-center justify-center bg-muted rounded shrink-0 overflow-hidden">
                    <div className="scale-50 origin-center">
                      <CustomComponentSvg comp={c} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">
                      {c.kind} · v{c.version} · {c.spec?.pins?.length ?? 0} pins
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" className="flex-1 h-7 text-xs" onClick={() => editComponent(c)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleExport(c)} title="Export ZIP">
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDelete(c)} title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </aside>
      </div>

      <Toaster />
    </div>
  );
}

function buildWiringExample(spec: PendingSpec): string {
  const lines: string[] = [];
  lines.push(`// ${spec.name}`);
  for (const p of spec.pins) {
    const role = (p.role ?? "").toLowerCase();
    let target = "→ Arduino pin";
    if (role === "power" || /vcc|vdd|5v|3v3|3\.3v/i.test(p.label)) target = "→ 5V (or 3.3V)";
    else if (role === "ground" || /gnd|vss/i.test(p.label)) target = "→ GND";
    else if (/sda/i.test(p.label)) target = "→ A4 (SDA)";
    else if (/scl/i.test(p.label)) target = "→ A5 (SCL)";
    else if (/rx/i.test(p.label)) target = "→ TX (Arduino pin 1)";
    else if (/tx/i.test(p.label)) target = "→ RX (Arduino pin 0)";
    else if (/mosi/i.test(p.label)) target = "→ D11 (MOSI)";
    else if (/miso/i.test(p.label)) target = "→ D12 (MISO)";
    else if (/sck|sclk/i.test(p.label)) target = "→ D13 (SCK)";
    else if (role === "analog") target = "→ A0 (analog)";
    else if (role === "digital" || role === "io" || role === "signal") target = "→ digital pin (e.g. D2)";
    lines.push(`${p.label.padEnd(8)} ${target}`);
  }
  return lines.join("\n");
}

/** Convert an Arduino library name into its likely #include header name. */
function libIncludeName(name: string): string {
  // Most libraries map: "Adafruit SSD1306" -> "Adafruit_SSD1306"
  return name.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
