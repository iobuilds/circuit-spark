import { createFileRoute, Link } from "@tanstack/react-router";
import { Cpu, Github, Zap, Code2, CircuitBoard } from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About — EmbedSim" },
      { name: "description", content: "EmbedSim is a 100% browser-based simulator for Arduino, ESP32 and other microcontrollers." },
      { property: "og:title", content: "About — EmbedSim" },
      { property: "og:description", content: "Run Arduino sketches in your browser. No installs, no hardware required." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-3 flex items-center gap-4 bg-card">
        <Link to="/" className="flex items-center gap-2 hover:text-primary"><Cpu className="h-5 w-5" /><span className="font-semibold">EmbedSim</span></Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/" className="hover:text-primary">Sim</Link>
          <Link to="/examples" className="hover:text-primary">Examples</Link>
          <Link to="/docs" className="hover:text-primary">Docs</Link>
          <Link to="/about" className="text-primary font-semibold">About</Link>
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-4xl font-bold tracking-tight">EmbedSim</h1>
        <p className="text-xl text-muted-foreground mt-3">A 100% browser-based simulator for embedded systems.</p>

        <div className="grid sm:grid-cols-3 gap-4 mt-10">
          <Feature icon={<Zap className="h-5 w-5" />} title="Instant feedback" body="Live LED glow, pin states, and serial output as you tweak code." />
          <Feature icon={<CircuitBoard className="h-5 w-5" />} title="Real wiring" body="Drag-and-drop canvas with realistic Arduino Uno SVG and clickable pins." />
          <Feature icon={<Code2 className="h-5 w-5" />} title="C/C++ subset" body="Monaco editor with Arduino syntax highlighting and snippet completions." />
        </div>

        <div className="mt-12 rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">How it works</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Your Arduino sketch is translated to JavaScript and executed in a Web Worker. A virtual time loop drives <code>delay()</code> and <code>millis()</code>, while the main thread renders pin states, LED glow, and Serial output. Inputs (buttons, potentiometers) feed back into the worker every frame.
          </p>
        </div>

        <div className="mt-8 flex gap-3">
          <Link to="/" className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90">Open simulator</Link>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent inline-flex items-center gap-2">
            <Github className="h-4 w-4" /> Source
          </a>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="h-8 w-8 rounded bg-accent text-primary flex items-center justify-center">{icon}</div>
      <h3 className="font-semibold mt-3">{title}</h3>
      <p className="text-xs text-muted-foreground mt-1">{body}</p>
    </div>
  );
}
