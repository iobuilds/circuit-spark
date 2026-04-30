import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { Loader2, Send, Save, Download, Upload, Trash2, Sparkles, ArrowLeft, Pencil, X, BookOpen, Check, Library, ExternalLink } from "lucide-react";
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

  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hi! Describe a component or board you want to build — for example: *'a small DC motor with speed and direction inputs that burns over 12V'*. You don't need to provide an SVG; I'll draw one for you. Once we agree, say **build it** and I'll emit a final spec with a live behavior simulator." },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingSpec | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [libs, setLibs] = useState<ArduinoLibMatch[]>([]);
  const [libsLoading, setLibsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const row = await saveFn({ data: { spec: { ...imp } as never } });
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
              <div className="text-xs text-muted-foreground p-3 text-center">
                No saved components yet.
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
