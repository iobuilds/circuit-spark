/// <reference lib="webworker" />
// Simulation worker. Acts like a (functional, not cycle-accurate) Arduino MCU:
// digital + analog I/O with proper modes, PWM, hardware Serial (UART0..3),
// I2C (Wire), SPI, EEPROM, attachInterrupt with rising/falling/change edges,
// pulseIn, tone/noTone, shiftIn/shiftOut, math helpers, random seeding,
// micros/millis. The runtime is JS — code is translated by ./compiler.ts.

import { compileArduino, CompileError } from "./compiler";
import { createDs3231State, DS3231_ADDR, handleI2cRead, handleI2cWrite } from "./ds3231";

type PinMode = "INPUT" | "OUTPUT" | "INPUT_PULLUP";

interface PinState {
  mode: PinMode;
  digital: 0 | 1;
  analog: number;
}

type InterruptMode = "RISING" | "FALLING" | "CHANGE" | "LOW" | "HIGH";
interface IsrEntry { fn: () => unknown | Promise<unknown>; mode: InterruptMode }

type InMsg =
  | { type: "compile"; code: string }
  | { type: "start"; code: string; speed: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "set-speed"; speed: number }
  | { type: "set-input"; pin: number; digital?: 0 | 1; analog?: number }
  | { type: "serial-in"; text: string; port?: number }
  | { type: "bus-rx"; bus: "i2c" | "spi"; from: string; payload: number[] };

type OutMsg =
  | { type: "compile-ok"; warnings: string[] }
  | { type: "compile-error"; message: string; line: number }
  | { type: "started" }
  | { type: "stopped"; reason?: string }
  | { type: "serial"; text: string; kind: "out" | "sys"; port?: number }
  | { type: "pin-states"; pins: Record<number, PinState>; ms: number; events?: { pin: number; t: number; d: 0 | 1 }[] }
  | { type: "tone"; pin: number; frequency: number; duration?: number }
  | { type: "bus-tx"; bus: "i2c" | "spi"; address?: number; payload: number[] }
  | { type: "error"; message: string };

const post = (m: OutMsg) => (self as unknown as Worker).postMessage(m);

const pins: Record<number, PinState> = {};
let virtualMs = 0;
let speed = 1;
let running = false;
let paused = false;
let stopRequested = false;
let lastEmit = 0;
/** Per-pin transition log filled by digitalWrite/analogWrite/setInput so the
 *  Signal Inspector can render real waveforms with virtual-time precision. */
const pinEventBuf: { pin: number; t: number; d: 0 | 1 }[] = [];
function pushPinEvent(pin: number, level: 0 | 1) {
  pinEventBuf.push({ pin, t: virtualMs, d: level });
  if (pinEventBuf.length > 8192) pinEventBuf.splice(0, pinEventBuf.length - 8192);
}

// ---------------- Pin helpers ----------------
function ensurePin(p: number): PinState {
  if (!pins[p]) pins[p] = { mode: "INPUT", digital: 0, analog: 0 };
  return pins[p];
}

function emitPins(force = false) {
  const now = performance.now();
  if (!force && now - lastEmit < 30) return;
  lastEmit = now;
  const events = pinEventBuf.splice(0, pinEventBuf.length);
  post({ type: "pin-states", pins: { ...pins }, ms: virtualMs, events });
}

// ---------------- Interrupt subsystem ----------------
const isrs: Record<number, IsrEntry> = {};
let interruptsEnabled = true;
const pendingIsr: { pin: number }[] = [];

function maybeFireInterrupt(pin: number, prev: 0 | 1, next: 0 | 1) {
  const e = isrs[pin];
  if (!e) return;
  let fire = false;
  if (e.mode === "CHANGE") fire = prev !== next;
  else if (e.mode === "RISING") fire = prev === 0 && next === 1;
  else if (e.mode === "FALLING") fire = prev === 1 && next === 0;
  else if (e.mode === "HIGH") fire = next === 1;
  else if (e.mode === "LOW") fire = next === 0;
  if (fire) pendingIsr.push({ pin });
}

async function drainIsrs() {
  if (!interruptsEnabled) return;
  while (pendingIsr.length > 0) {
    const it = pendingIsr.shift()!;
    const e = isrs[it.pin];
    if (!e) continue;
    try { await e.fn(); } catch (err) {
      post({ type: "error", message: `ISR(pin ${it.pin}): ${(err as Error).message}` });
    }
  }
}

// ---------------- UART (Serial0..3) ----------------
function makeSerial(port: number) {
  let buf = "";
  let inBuf = "";
  return {
    _setIn(text: string) { inBuf += text; },
    begin: (_baud: number) => {},
    end: () => {},
    print: (v: unknown) => {
      buf += String(v);
      if (buf.length > 200) {
        post({ type: "serial", text: buf, kind: "out", port });
        buf = "";
      }
    },
    println: (v?: unknown) => {
      buf += (v === undefined ? "" : String(v)) + "\n";
      post({ type: "serial", text: buf, kind: "out", port });
      buf = "";
    },
    write: function (this: unknown, v: unknown) {
      if (typeof v === "number") buf += String.fromCharCode(v & 0xff);
      else buf += String(v);
      if (buf.length > 200) {
        post({ type: "serial", text: buf, kind: "out", port });
        buf = "";
      }
    },
    available: () => inBuf.length,
    peek: () => (inBuf.length ? inBuf.charCodeAt(0) : -1),
    read: () => {
      if (!inBuf.length) return -1;
      const c = inBuf.charCodeAt(0);
      inBuf = inBuf.slice(1);
      return c;
    },
    readString: () => { const s = inBuf; inBuf = ""; return s; },
    readStringUntil: (term: string | number) => {
      const t = typeof term === "number" ? String.fromCharCode(term) : term;
      const idx = inBuf.indexOf(t);
      if (idx < 0) { const s = inBuf; inBuf = ""; return s; }
      const s = inBuf.slice(0, idx);
      inBuf = inBuf.slice(idx + t.length);
      return s;
    },
    flush: () => {
      if (buf) { post({ type: "serial", text: buf, kind: "out", port }); buf = ""; }
    },
  };
}

const Serial = makeSerial(0);
const Serial1 = makeSerial(1);
const Serial2 = makeSerial(2);
const Serial3 = makeSerial(3);

// ---------------- I2C (Wire) ----------------
const wireRxQueue: number[] = [];
let wireTxBuffer: number[] = [];
let wireTxAddress: number | undefined;
let wireOnReceive: ((n: number) => void) | null = null;
let wireOnRequest: (() => void) | null = null;

// Built-in DS3231 RTC instance — answers requests addressed to 0x68.
const ds3231 = createDs3231State();

const Wire = {
  begin: (_addr?: number) => {},
  end: () => {},
  setClock: (_hz: number) => {},
  beginTransmission: (addr: number) => { wireTxAddress = addr; wireTxBuffer = []; },
  write: (v: unknown) => {
    if (typeof v === "number") { wireTxBuffer.push(v & 0xff); return 1; }
    const s = String(v);
    for (let i = 0; i < s.length; i++) wireTxBuffer.push(s.charCodeAt(i) & 0xff);
    return s.length;
  },
  endTransmission: () => {
    // Built-in DS3231 emulation: short-circuit the bus when addressed at 0x68.
    if (wireTxAddress === DS3231_ADDR) {
      handleI2cWrite(ds3231, [...wireTxBuffer]);
      post({ type: "bus-tx", bus: "i2c", address: wireTxAddress, payload: [...wireTxBuffer] });
      wireTxBuffer = [];
      return 0;
    }
    post({ type: "bus-tx", bus: "i2c", address: wireTxAddress, payload: [...wireTxBuffer] });
    wireTxBuffer = [];
    return 0;
  },
  requestFrom: (addr: number, n: number) => {
    if (addr === DS3231_ADDR) {
      const bytes = handleI2cRead(ds3231, n);
      for (const b of bytes) wireRxQueue.push(b & 0xff);
      return bytes.length;
    }
    return Math.min(n, wireRxQueue.length);
  },
  available: () => wireRxQueue.length,
  read: () => (wireRxQueue.length ? wireRxQueue.shift()! : -1),
  onReceive: (cb: (n: number) => void) => { wireOnReceive = cb; },
  onRequest: (cb: () => void) => { wireOnRequest = cb; },
};

// ---------------- SPI ----------------
const spiRx: number[] = [];
const SPI = {
  begin: () => {},
  end: () => {},
  beginTransaction: (_s: unknown) => {},
  endTransaction: () => {},
  setBitOrder: (_o: unknown) => {},
  setDataMode: (_m: unknown) => {},
  setClockDivider: (_d: unknown) => {},
  transfer: (v: number) => {
    post({ type: "bus-tx", bus: "spi", payload: [v & 0xff] });
    return spiRx.length ? (spiRx.shift()! & 0xff) : 0;
  },
  transfer16: (v: number) => {
    const hi = (v >> 8) & 0xff, lo = v & 0xff;
    post({ type: "bus-tx", bus: "spi", payload: [hi, lo] });
    return ((spiRx.shift() ?? 0) << 8) | (spiRx.shift() ?? 0);
  },
};

// ---------------- EEPROM (1KB) ----------------
const eepromBytes = new Uint8Array(1024);
const EEPROM = {
  read: (addr: number) => eepromBytes[addr & 0x3ff] ?? 0,
  write: (addr: number, val: number) => { eepromBytes[addr & 0x3ff] = val & 0xff; },
  update: (addr: number, val: number) => { eepromBytes[addr & 0x3ff] = val & 0xff; },
  length: () => eepromBytes.length,
  get: (addr: number) => eepromBytes[addr & 0x3ff],
  put: (addr: number, val: number) => { eepromBytes[addr & 0x3ff] = val & 0xff; },
};

let bound: { setup: (() => Promise<unknown>) | null; loop: (() => Promise<unknown>) | null } = { setup: null, loop: null };

function sleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, Math.max(0, ms)));
}

// ---------------- Arduino runtime (__rt) ----------------
const __rt = {
  __bind(fns: typeof bound) { bound = fns; },

  // Digital / analog I/O ----------------------------------------------------
  pinMode: (pin: number, mode: PinMode | string) => {
    const p = ensurePin(pin);
    p.mode = mode as PinMode;
    // INPUT_PULLUP without external drive reads HIGH.
    if (mode === "INPUT_PULLUP") { p.digital = 1; p.analog = 1023; }
    emitPins();
  },
  digitalWrite: (pin: number, val: number) => {
    const p = ensurePin(pin);
    if (p.mode !== "OUTPUT") return; // hardware-accurate: writes only take effect when pin is OUTPUT
    const next: 0 | 1 = val ? 1 : 0;
    const prev = p.digital;
    p.digital = next;
    p.analog = next ? 1023 : 0;
    if (prev !== next) {
      pushPinEvent(pin, next);
      maybeFireInterrupt(pin, prev, next);
    }
    emitPins();
  },
  digitalRead: (pin: number): number => {
    const p = ensurePin(pin);
    return p.digital;
  },
  analogWrite: (pin: number, val: number) => {
    const p = ensurePin(pin);
    const v = Math.max(0, Math.min(255, Math.floor(val)));
    p.analog = Math.round((v / 255) * 1023);
    const next: 0 | 1 = v > 0 ? 1 : 0;
    const prev = p.digital;
    p.digital = next;
    if (prev !== next) {
      pushPinEvent(pin, next);
      maybeFireInterrupt(pin, prev, next);
    }
    emitPins();
  },
  analogRead: (pin: number): number => {
    const p = ensurePin(pin);
    return Math.max(0, Math.min(1023, Math.floor(p.analog)));
  },
  analogReference: (_ref: unknown) => {},

  // Time -------------------------------------------------------------------
  millis: () => Math.floor(virtualMs),
  micros: () => Math.floor(virtualMs * 1000),

  // Tone -------------------------------------------------------------------
  tone: (pin: number, frequency: number, duration?: number) => {
    post({ type: "tone", pin, frequency, duration });
  },
  noTone: (pin: number) => { post({ type: "tone", pin, frequency: 0 }); },

  // Math -------------------------------------------------------------------
  map: (x: number, a: number, b: number, c: number, d: number) =>
    ((x - a) * (d - c)) / (b - a) + c,
  constrain: (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x)),
  abs: (x: number) => Math.abs(x),
  min: (a: number, b: number) => Math.min(a, b),
  max: (a: number, b: number) => Math.max(a, b),
  sq: (x: number) => x * x,
  sqrt: (x: number) => Math.sqrt(x),
  pow: (b: number, e: number) => Math.pow(b, e),
  sin: (x: number) => Math.sin(x),
  cos: (x: number) => Math.cos(x),
  tan: (x: number) => Math.tan(x),

  // Random -----------------------------------------------------------------
  random: (a: number, b?: number) => {
    if (b === undefined) return Math.floor(Math.random() * a);
    return Math.floor(Math.random() * (b - a)) + a;
  },
  randomSeed: (_s: number) => {},

  // Bit operations ---------------------------------------------------------
  bitRead: (v: number, b: number) => (v >> b) & 1,
  bitWrite: (v: number, b: number, x: number) =>
    x ? (v | (1 << b)) : (v & ~(1 << b)),
  bitSet: (v: number, b: number) => v | (1 << b),
  bitClear: (v: number, b: number) => v & ~(1 << b),
  bit: (b: number) => 1 << b,
  lowByte: (v: number) => v & 0xff,
  highByte: (v: number) => (v >> 8) & 0xff,

  // Interrupts -------------------------------------------------------------
  attachInterrupt: (intNum: number, fn: () => unknown, mode: string) => {
    // intNum is digitalPinToInterrupt-like; we accept the pin directly too.
    // On Uno, INT0=pin2, INT1=pin3. Heuristic: if intNum < 2, map to pin 2/3; else use as pin.
    const pin = intNum <= 1 ? (intNum === 0 ? 2 : 3) : intNum;
    isrs[pin] = { fn, mode: (mode as InterruptMode) ?? "CHANGE" };
  },
  detachInterrupt: (intNum: number) => {
    const pin = intNum <= 1 ? (intNum === 0 ? 2 : 3) : intNum;
    delete isrs[pin];
  },
  digitalPinToInterrupt: (pin: number) => pin,
  interrupts: () => { interruptsEnabled = true; },
  noInterrupts: () => { interruptsEnabled = false; },

  // pulseIn — measure pulse width on a pin. Without true cycle-accurate sim,
  // we implement a best-effort: poll the pin while the program advances time.
  pulseIn: async (pin: number, value: number, timeout = 1000000) => {
    const p = ensurePin(pin);
    const target: 0 | 1 = value ? 1 : 0;
    const tStart = virtualMs;
    // Wait for pin to leave target
    while (p.digital === target) {
      if ((virtualMs - tStart) * 1000 > timeout) return 0;
      await __rt.delayMicroseconds(2);
    }
    // Wait for pin to go to target
    while (p.digital !== target) {
      if ((virtualMs - tStart) * 1000 > timeout) return 0;
      await __rt.delayMicroseconds(2);
    }
    const t0 = virtualMs * 1000;
    while (p.digital === target) {
      if ((virtualMs - tStart) * 1000 > timeout) return 0;
      await __rt.delayMicroseconds(2);
    }
    return Math.floor(virtualMs * 1000 - t0);
  },

  // shiftOut / shiftIn -----------------------------------------------------
  shiftOut: (dataPin: number, clockPin: number, bitOrder: string | number, val: number) => {
    const msbFirst = bitOrder === "MSBFIRST" || bitOrder === 1;
    for (let i = 0; i < 8; i++) {
      const bit = msbFirst ? (val >> (7 - i)) & 1 : (val >> i) & 1;
      __rt.digitalWrite(dataPin, bit);
      __rt.digitalWrite(clockPin, 1);
      __rt.digitalWrite(clockPin, 0);
    }
  },
  shiftIn: (dataPin: number, clockPin: number, bitOrder: string | number) => {
    const msbFirst = bitOrder === "MSBFIRST" || bitOrder === 1;
    let v = 0;
    for (let i = 0; i < 8; i++) {
      __rt.digitalWrite(clockPin, 1);
      const b = __rt.digitalRead(dataPin) & 1;
      v = msbFirst ? ((v << 1) | b) : (v | (b << i));
      __rt.digitalWrite(clockPin, 0);
    }
    return v & 0xff;
  },

  // Delays -----------------------------------------------------------------
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
      [Serial, Serial1, Serial2, Serial3].forEach((s) => s.flush());
      await drainIsrs();
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

  let executor: (
    rt: typeof __rt, S0: typeof Serial, S1: typeof Serial1, S2: typeof Serial2, S3: typeof Serial3,
    W: typeof Wire, SP: typeof SPI, EE: typeof EEPROM,
  ) => Promise<void>;
  try {
    executor = new Function(
      "__rt", "Serial", "Serial1", "Serial2", "Serial3", "Wire", "SPI", "EEPROM",
      `return (async () => { ${js} })();`
    ) as (
      rt: typeof __rt, S0: typeof Serial, S1: typeof Serial1, S2: typeof Serial2, S3: typeof Serial3,
      W: typeof Wire, SP: typeof SPI, EE: typeof EEPROM,
    ) => Promise<void>;
  } catch (e) {
    post({ type: "error", message: "Translation error: " + (e as Error).message });
    return;
  }

  try {
    await executor(__rt, Serial, Serial1, Serial2, Serial3, Wire, SPI, EEPROM);
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
      await drainIsrs();
      await sleep(0);
    }
  } catch (e) {
    if ((e as Error).message !== "__STOP__") {
      post({ type: "error", message: (e as Error).message });
    }
  } finally {
    [Serial, Serial1, Serial2, Serial3].forEach((s) => s.flush());
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
      for (const k of Object.keys(isrs)) delete isrs[Number(k)];
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
      const prev = p.digital;
      if (msg.digital !== undefined) p.digital = msg.digital;
      if (msg.analog !== undefined) p.analog = msg.analog;
      // Reads only mean something on input pins; but ISRs fire on edges.
      if (msg.digital !== undefined && prev !== msg.digital) {
        pushPinEvent(msg.pin, msg.digital);
        maybeFireInterrupt(msg.pin, prev, msg.digital);
      }
      break;
    }
    case "serial-in": {
      const port = msg.port ?? 0;
      const s = port === 1 ? Serial1 : port === 2 ? Serial2 : port === 3 ? Serial3 : Serial;
      s._setIn(msg.text);
      break;
    }
    case "bus-rx": {
      if (msg.bus === "i2c") {
        for (const b of msg.payload) wireRxQueue.push(b & 0xff);
        if (wireOnReceive) try { wireOnReceive(msg.payload.length); } catch { /* noop */ }
      } else {
        for (const b of msg.payload) spiRx.push(b & 0xff);
      }
      break;
    }
  }
});
