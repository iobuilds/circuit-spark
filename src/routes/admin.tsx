import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Loader2, Send, Save, Download, Upload, Trash2, Sparkles, ArrowLeft } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  aiBuilderChat,
  saveCustomComponent,
  deleteCustomComponent,
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

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin · AI Component Builder" },
      { name: "description", content: "Build custom components and boards using AI chat. Export and import as ZIP packs." },
    ],
  }),
  component: AdminPage,
});

interface ChatMsg { role: "user" | "assistant"; content: string }

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

  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hi! Describe a component or board you want to build. You can paste reference SVG markup, list pins, and we'll iterate together. When ready, say **build it** and I'll emit a final spec you can save to the library." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSpec | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, [load]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setBusy(true);
    try {
      const res = await chatFn({ data: { history: next, message: text } });
      setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
      if (res.spec) setPending(res.spec as PendingSpec);
    } catch (e) {
      toast.error(`AI error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveCurrent() {
    if (!pending) return;
    try {
      const row = await saveFn({ data: { spec: pending } });
      upsertLocal(row as unknown as CustomComponentRow);
      toast.success(`Saved ${pending.name} to library`);
      setPending(null);
    } catch (e) {
      toast.error(`Save failed: ${(e as Error).message}`);
    }
  }

  async function handleExport(c: CustomComponentRow) {
    const blob = await exportComponentZip(c);
    downloadBlob(blob, `${c.slug}-v${c.version}.zip`);
  }

  async function handleImportFile(file: File) {
    try {
      const imp = await importComponentZip(file);
      const row = await saveFn({ data: { spec: { ...imp } } });
      upsertLocal(row as unknown as CustomComponentRow);
      toast.success(`Imported ${imp.name}`);
    } catch (e) {
      // Try local-only import if save fails
      try {
        const imp = await importComponentZip(file);
        upsertLocal(importedToRow(imp));
        toast.warning(`Imported locally (save failed: ${(e as Error).message})`);
      } catch (e2) {
        toast.error(`Import failed: ${(e2 as Error).message}`);
      }
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
        <section className="flex flex-col border-r border-border">
          <div className="flex-1 min-h-0 overflow-auto p-4 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "user" ? "text-foreground" : "text-foreground/90"}`}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">
                  {m.role === "user" ? "You" : "AI"}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
              </div>
            ))}
            {busy && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> thinking...
              </div>
            )}
          </div>
          <div className="border-t border-border p-2 flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Describe the component, paste SVG, or say 'build it'..."
              className="min-h-[60px] max-h-32 resize-none text-sm"
            />
            <Button onClick={send} disabled={busy || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* Live preview */}
        <section className="flex flex-col border-r border-border bg-muted/20">
          <div className="px-3 py-2 border-b border-border flex items-center">
            <span className="text-xs font-medium uppercase tracking-wide">Live Preview</span>
            <div className="flex-1" />
            {pending && (
              <Button size="sm" onClick={saveCurrent}>
                <Save className="h-3.5 w-3.5 mr-1.5" /> Save to library
              </Button>
            )}
          </div>
          <div className="flex-1 min-h-0 overflow-auto p-6 flex flex-col items-center justify-center">
            {pending ? (
              <Card className="p-6 max-w-md">
                <div className="flex items-center justify-center mb-4 bg-card rounded border border-border p-4">
                  <CustomComponentSvg
                    comp={{
                      id: "preview",
                      name: pending.name,
                      slug: pending.slug,
                      kind: pending.kind,
                      description: pending.description,
                      svg: pending.svg,
                      spec: { width: pending.width, height: pending.height, pins: pending.pins },
                      behavior: pending.behaviorNotes ?? "",
                      version: 1,
                    }}
                  />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <strong>{pending.name}</strong>
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      {pending.kind}
                    </span>
                  </div>
                  <div className="text-muted-foreground text-xs">{pending.description}</div>
                  <div className="text-xs">
                    <strong>Pins ({pending.pins.length}):</strong>{" "}
                    {pending.pins.map((p) => p.label).join(", ")}
                  </div>
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
            ) : (
              <div className="text-sm text-muted-foreground text-center max-w-sm">
                Chat with the AI to design a component. The live preview appears here when a spec is ready, with a Save button to add it to your library.
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
              <div className="text-xs text-muted-foreground p-3 text-center">
                No saved components yet.
              </div>
            )}
            {items.map((c) => (
              <Card key={c.id} className="p-2 space-y-2">
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
                  <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs" onClick={() => handleExport(c)}>
                    <Download className="h-3 w-3 mr-1" /> ZIP
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => handleDelete(c)}>
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
