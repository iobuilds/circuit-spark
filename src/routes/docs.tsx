import { createFileRoute, Link } from "@tanstack/react-router";
import { Cpu } from "lucide-react";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "Docs — EmbedSim" },
      { name: "description", content: "Quick start guide and Arduino API reference for the EmbedSim browser simulator." },
      { property: "og:title", content: "Docs — EmbedSim" },
      { property: "og:description", content: "Learn how to use EmbedSim and which Arduino APIs are supported." },
    ],
  }),
  component: DocsPage,
});

function DocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-3 flex items-center gap-4 bg-card">
        <Link to="/" className="flex items-center gap-2 hover:text-primary"><Cpu className="h-5 w-5" /><span className="font-semibold">EmbedSim</span></Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/" className="hover:text-primary">Sim</Link>
          <Link to="/examples" className="hover:text-primary">Examples</Link>
          <Link to="/docs" className="text-primary font-semibold">Docs</Link>
          <Link to="/about" className="hover:text-primary">About</Link>
        </nav>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10 prose-style">
        <h1 className="text-3xl font-bold tracking-tight">Documentation</h1>

        <h2 className="text-xl font-semibold mt-8 mb-3">Quick start</h2>
        <ol className="list-decimal pl-6 space-y-1.5 text-sm text-foreground/90">
          <li>Drag a component from the left palette onto the canvas.</li>
          <li>Click a pin on a component, then click another pin to draw a wire. Click an existing wire to remove it.</li>
          <li>Write Arduino C/C++ code in the editor, then press <kbd className="kbd">Run</kbd> (or <kbd className="kbd">Ctrl+Enter</kbd>).</li>
          <li>Watch LEDs light up, drag the potentiometer knob, and view <code>Serial.print</code> output in the monitor.</li>
        </ol>

        <h2 className="text-xl font-semibold mt-8 mb-3">Supported Arduino API</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          {[
            ["pinMode(pin, mode)", "OUTPUT, INPUT, INPUT_PULLUP"],
            ["digitalWrite(pin, val)", "HIGH or LOW"],
            ["digitalRead(pin)", "returns 0/1"],
            ["analogWrite(pin, val)", "0–255 PWM"],
            ["analogRead(pin)", "returns 0–1023"],
            ["delay(ms)", "blocks the loop"],
            ["delayMicroseconds(us)", "fine-grained delay"],
            ["millis() / micros()", "elapsed virtual time"],
            ["Serial.begin / print / println", "writes to monitor"],
            ["Serial.read / available", "reads user input"],
            ["map / constrain / random", "math helpers"],
          ].map(([k, v]) => (
            <div key={k} className="rounded border border-border bg-card p-2">
              <div className="font-mono text-primary text-xs">{k}</div>
              <div className="text-xs text-muted-foreground">{v}</div>
            </div>
          ))}
        </div>

        <h2 className="text-xl font-semibold mt-8 mb-3">Boards</h2>
        <p className="text-sm text-muted-foreground">Arduino Uno is fully supported in this version. Mega, Nano, ESP32, ESP8266, STM32 Blue Pill, MSP430 and Raspberry Pi Pico are scaffolded and coming soon.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">Components</h2>
        <p className="text-sm text-muted-foreground">LED, resistor, push button and potentiometer are fully simulated. The rest of the palette is scaffolded for the next release.</p>

        <h2 className="text-xl font-semibold mt-8 mb-3">Keyboard shortcuts</h2>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li><kbd className="kbd">Ctrl/Cmd + Enter</kbd> — Run simulation</li>
          <li><kbd className="kbd">Ctrl/Cmd + .</kbd> — Stop simulation</li>
          <li><kbd className="kbd">Ctrl/Cmd + S</kbd> — Save project locally</li>
          <li><kbd className="kbd">Alt + Drag canvas</kbd> — Pan</li>
          <li><kbd className="kbd">Mouse wheel</kbd> — Zoom canvas</li>
        </ul>
      </main>
      <style>{`.kbd { font-family: ui-monospace, monospace; font-size: 11px; padding: 1px 6px; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-muted); }`}</style>
    </div>
  );
}
