/// <reference lib="webworker" />
// Simulation worker. Runs translated Arduino code with a runtime that posts pin/serial events back to the main thread.

import { compileArduino, CompileError } from "./compiler";

type PinMode = "INPUT" | "OUTPUT" | "INPUT_PULLUP";

interface PinState {
  mode: PinMode;
  digital: 0 | 1;
  analog: number;
}

type InMsg =
  | { type: "compile"; code: string }
  | { type: "start"; code: string; speed: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "set-speed"; speed: number }
  | { type: "set-input"; pin: number; digital?: 0 | 1; analog?: number }
  | { type: "serial-in"; text: string };

type OutMsg =
  | { type: "compile-ok"; warnings: string[] }
  | { type: "compile-error"; message: string; line: number }
  | { type: "started" }
  | { type: "stopped"; reason?: string }
  | { type: "serial"; text: string; kind: "out" | "sys" }
  | { type: "pin-states"; pins: Record<number, PinState>; ms: number }
  | { type: "error"; message: string };

const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m);

const pins: Record<number, PinState> = {};
let virtualMs = 0;
let speed = 1;
let running = false;
let paused = false;
let stopRequested = false;
let serialBuffer = "";
let inputBuffer = "";
let lastEmit = 0;

function ensurePin(p: number): PinState {
  if (!pins[p]) pins[p] = { mode: "INPUT", digital: 0, analog: 0 };
  return pins[p];
}

function emitPins(force = false) {
  const now = performance.now();
  if (!force && now - lastEmit < 30) return;
  lastEmit = now;
  post({ type: "pin-states", pins: { ...pins }, ms: virtualMs });
}

function flushSerial() {
  if (!serialBuffer) return;
  post({ type: "serial", text: serialBuffer, kind: "out" });
  serialBuffer = "";
}

const Serial = {
  begin: (_baud: number) => {},
  print: (v: unknown) => {
    serialBuffer += String(v);
    if (serialBuffer.length > 200) flushSerial();
  },
  println: (v?: unknown) => {
    serialBuffer += (v === undefined ? "" : String(v)) + "\n";
    flushSerial();
  },
  available: () => inputBuffer.length,
  read: () => {
    if (!inputBuffer.length) return -1;
    const c = inputBuffer.charCodeAt(0);
    inputBuffer = inputBuffer.slice(1);
    return c;
  },
  readString: () => { const s = inputBuffer; inputBuffer = ""; return s; },
  write: (v: unknown) => Serial.print(v),
  flush: () => flushSerial(),
};

let bound: { setup: (() => Promise<unknown>) | null; loop: (() => Promise<unknown>) | null } = { setup: null, loop: null };

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, Math.max(0, ms)));
}

const __rt = {
  __bind(fns: typeof bound) { bound = fns; },
  pinMode: (pin: number, mode: PinMode | string) => { ensurePin(pin).mode = mode as PinMode; emitPins(); },
  digitalWrite: (pin: number, val: number) => {
    const p = ensurePin(pin);
    p.digital = val ? 1 : 0;
    p.analog = val ? 255 : 0;
    emitPins();
  },
  digitalRead: (pin: number): number => {
    const p = ensurePin(pin);
    if (p.mode === "INPUT_PULLUP" && p.digital === 0 && p.analog === 0) return 1;
    return p.digital;
  },
  analogWrite: (pin: number, val: number) => {
    const p = ensurePin(pin);
    const v = Math.max(0, Math.min(255, Math.floor(val)));
    p.analog = v;
    p.digital = v > 127 ? 1 : 0;
    emitPins();
  },
  analogRead: (pin: number): number => {
    const p = ensurePin(pin);
    return Math.max(0, Math.min(1023, Math.floor(p.analog)));
  },
  millis: () => Math.floor(virtualMs),
  micros: () => Math.floor(virtualMs * 1000),
  tone: () => {},
  noTone: () => {},
  map: (x: number, a: number, b: number, c: number, d: number) => ((x - a) * (d - c)) / (b - a) + c,
  constrain: (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x)),
  random: (a: number, b?: number) => {
    if (b === undefined) return Math.floor(Math.random() * a);
    return Math.floor(Math.random() * (b - a)) + a;
  },
  delay: async (ms: number) => {
    if (ms <= 0) return;
    const target = virtualMs + ms;
    while (virtualMs < target) {
      if (stopRequested) throw new Error("__STOP__");
      while (paused) {
        await sleep(20);
        if (stopRequested) throw new Error("__STOP__");
      }
      const step = Math.min(20, target - virtualMs);
      await sleep(step / Math.max(0.1, speed));
      virtualMs += step;
      emitPins();
      flushSerial();
    }
  },
  delayMicroseconds: async (us: number) => {
    if (us < 1000) { virtualMs += us / 1000; return; }
    return __rt.delay(us / 1000);
  },
};

async function runProgram(code: string) {
  let js: string;
  try {
    js = compileArduino(code).js;
  } catch (e) {
    const ce = e as CompileError;
    post({ type: "compile-error", message: ce.message ?? String(e), line: ce.line ?? 1 });
    return;
  }
  post({ type: "compile-ok", warnings: [] });

  // Bind setup/loop by executing translated source.
  let executor: ((rt: typeof __rt, Ser: typeof Serial) => Promise<void>) | null = null;
  try {
    executor = new Function("__rt", "Serial", `return (async () => { ${js} })();`) as never;
  } catch (e) {
    post({ type: "error", message: "Translation error: " + (e as Error).message });
    return;
  }

  try {
    await executor!(__rt, Serial);
  } catch (e) {
    post({ type: "error", message: (e as Error).message });
    return;
  }

  if (!bound.setup || !bound.loop) {
    post({ type: "error", message: "Program must define setup() and loop()." });
    return;
  }

  virtualMs = 0;
  running = true;
  paused = false;
  stopRequested = false;
  post({ type: "started" });

  try {
    await bound.setup();
    while (!stopRequested) {
      while (paused) {
        await sleep(30);
        if (stopRequested) break;
      }
      if (stopRequested) break;
      await bound.loop();
      virtualMs += 0.1;
      await sleep(0);
    }
  } catch (e) {
    if ((e as Error).message !== "__STOP__") {
      post({ type: "error", message: (e as Error).message });
    }
  } finally {
    flushSerial();
    emitPins(true);
    running = false;
    post({ type: "stopped" });
  }
}

self.addEventListener("message", (ev: MessageEvent<InMsg>) => {
  const msg = ev.data;
  switch (msg.type) {
    case "compile":
      try {
        compileArduino(msg.code);
        post({ type: "compile-ok", warnings: [] });
      } catch (e) {
        const ce = e as CompileError;
        post({ type: "compile-error", message: ce.message ?? String(e), line: ce.line ?? 1 });
      }
      break;
    case "start":
      if (running) { stopRequested = true; return; }
      for (const k of Object.keys(pins)) delete pins[Number(k)];
      virtualMs = 0;
      speed = msg.speed;
      runProgram(msg.code);
      break;
    case "pause": paused = true; break;
    case "resume": paused = false; break;
    case "stop": stopRequested = true; break;
    case "set-speed": speed = msg.speed; break;
    case "set-input": {
      const p = ensurePin(msg.pin);
      if (msg.digital !== undefined) p.digital = msg.digital;
      if (msg.analog !== undefined) p.analog = msg.analog;
      break;
    }
    case "serial-in": inputBuffer += msg.text; break;
  }
});
