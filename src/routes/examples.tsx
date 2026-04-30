import { createFileRoute, Link } from "@tanstack/react-router";
import { TEMPLATES } from "@/sim/templates";
import { useSimStore } from "@/sim/store";
import { useNavigate } from "@tanstack/react-router";
import { Cpu, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/examples")({
  head: () => ({
    meta: [
      { title: "Examples — EmbedSim" },
      { name: "description", content: "Browse Arduino example projects: Blink, Button + LED, Potentiometer, PWM Fade and more." },
      { property: "og:title", content: "Examples — EmbedSim" },
      { property: "og:description", content: "Ready-made Arduino simulator example projects you can run in your browser." },
    ],
  }),
  component: ExamplesPage,
});

function ExamplesPage() {
  const loadProject = useSimStore((s) => s.loadProject);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-3 flex items-center gap-4 bg-card">
        <Link to="/" className="flex items-center gap-2 hover:text-primary"><Cpu className="h-5 w-5" /><span className="font-semibold">EmbedSim</span></Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/" className="hover:text-primary">Sim</Link>
          <Link to="/examples" className="text-primary font-semibold">Examples</Link>
          <Link to="/docs" className="hover:text-primary">Docs</Link>
          <Link to="/about" className="hover:text-primary">About</Link>
        </nav>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <Link to="/" className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-4">
          <ArrowLeft className="h-3 w-3" /> back
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Example Projects</h1>
        <p className="text-muted-foreground mt-2">Click any project to load it into the simulator and run it.</p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => { loadProject(t); navigate({ to: "/" }); }}
              className="text-left rounded-lg border border-border bg-card hover:border-primary hover:glow-neon transition-all p-5 group"
            >
              <div className="aspect-video rounded bg-canvas border border-border mb-4 flex items-center justify-center font-mono text-primary text-xs canvas-grid-bg">
                {t.name}
              </div>
              <h3 className="font-semibold group-hover:text-primary">{t.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
              <pre className="mt-3 text-[10px] font-mono text-muted-foreground bg-muted/40 rounded p-2 max-h-24 overflow-hidden">{t.code.split("\n").slice(0, 6).join("\n")}</pre>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
