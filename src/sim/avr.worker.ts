/// <reference lib="webworker" />
// avr8js-powered execution worker. Runs the actual compiled .hex binary
// instruction-by-instruction on a virtual ATmega328P, exposing live pin
// states + USART output + periodic SRAM/EEPROM/CPU snapshots to the main
// thread. Replaces the JS-translation runtime when a real compiled binary
// is available.

import {
  CPU,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  AVRSPI,
  AVRTWI,
  AVRADC,
  AVREEPROM,
  EEPROMMemoryBackend,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
  spiConfig,
  twiConfig,
  adcConfig,
  eepromConfig,
  PinState as AvrPinState,
  avrInstruction,
} from "avr8js";
import { parseIntelHex } from "./intelHex";
import { ARDUINO_TO_AVR } from "./atmega328p";
import {
  createDs3231State,
  DS3231_ADDR,
  handleI2cRead,
  handleI2cWrite,
  readSnapshot as ds3231Snapshot,
} from "./ds3231";

type InMsg =
  | { type: "load-hex"; hex: string }
  | { type: "start"; speed: number }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "stop" }
  | { type: "set-speed"; speed: number }
  | { type: "set-input"; pin: number; digital?: 0 | 1; analog?: number }
  | { type: "serial-in"; text: string };

type OutMsg =
  | { type: "loaded"; flashSize: number }
  | { type: "started" }
  | { type: "stopped"; reason?: string }
  | { type: "serial"; text: string; kind: "out" | "sys" }
  | { type: "pin-states"; pins: Record<number, { mode: "INPUT" | "OUTPUT" | "INPUT_PULLUP"; digital: 0 | 1; analog: number }>; ms: number }
  | { type: "snapshot"; pc: number; sp: number; cycles: number; sreg: number; sramSlice: Uint8Array; eeprom: Uint8Array }
  | { type: "error"; message: string };

const post = (m: OutMsg, transfer?: Transferable[]) =>
  (self as unknown as Worker).postMessage(m, transfer ?? []);

const F_CPU = 16_000_000;

// ------------ State ------------
let cpu: CPU | null = null;
let portB: AVRIOPort | null = null;
let portC: AVRIOPort | null = null;
let portD: AVRIOPort | null = null;
let usart: AVRUSART | null = null;
let eepromBackend: EEPROMMemoryBackend | null = null;
let running = false;
let paused = false;
let stopRequested = false;
let speed = 1;
let lastPinEmit = 0;
let lastSnapshot = 0;
let serialBuf = "";
let lastSerialFlush = 0;
const ds3231 = createDs3231State();

function loadHex(hex: string) {
  try {
    const parsed = parseIntelHex(hex);
    // CPU expects a Uint16Array of program memory. Ensure even byte length.
    const bytes = parsed.data.length % 2 === 0
      ? parsed.data
      : (() => { const b = new Uint8Array(parsed.data.length + 1); b.set(parsed.data); return b; })();
    const program = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
    // Pad to 32KB (16384 words) so flash reads beyond program don't fail.
    const flash = new Uint16Array(0x4000);
    flash.set(program.slice(0, 0x4000));
    cpu = new CPU(flash);

    portB = new AVRIOPort(cpu, portBConfig);
    portC = new AVRIOPort(cpu, portCConfig);
    portD = new AVRIOPort(cpu, portDConfig);

    new AVRTimer(cpu, timer0Config);
    new AVRTimer(cpu, timer1Config);
    new AVRTimer(cpu, timer2Config);

    usart = new AVRUSART(cpu, usart0Config, F_CPU);
    usart.onByteTransmit = (b: number) => {
      // Buffer characters and flush on newline or short idle so the Serial
      // Monitor renders whole lines instead of one-char-per-line.
      serialBuf += String.fromCharCode(b);
      if (b === 0x0a /* \n */) {
        post({ type: "serial", text: serialBuf, kind: "out" });
        serialBuf = "";
      } else if (serialBuf.length >= 256) {
        post({ type: "serial", text: serialBuf, kind: "out" });
        serialBuf = "";
      }
      lastSerialFlush = performance.now();
    };

    new AVRSPI(cpu, spiConfig, F_CPU);

    // I2C / TWI: bridge the AVR TWI peripheral to our DS3231 emulator so
    // sketches reading 0x68 see real BCD time fields instead of 0xFF garbage.
    const twi = new AVRTWI(cpu, twiConfig, F_CPU);
    let twiSlaveAddr = -1;
    let twiSlaveWrite = false;
    /** Bytes written by the master in the current transaction.
     *  First byte is interpreted as the DS3231 register pointer; subsequent
     *  bytes are register writes (auto-incrementing pointer). */
    let twiTxBuf: number[] = [];
    twi.eventHandler = {
      start: () => { twiTxBuf = []; },
      stop: () => {
        // Master STOP after a write transaction: commit the buffered bytes.
        if (twiSlaveAddr === DS3231_ADDR && twiSlaveWrite && twiTxBuf.length) {
          handleI2cWrite(ds3231, twiTxBuf);
        }
        twiSlaveAddr = -1;
        twiTxBuf = [];
      },
      connectToSlave: (addr, write) => {
        twiSlaveAddr = addr;
        twiSlaveWrite = write;
        twiTxBuf = [];
        // Always ACK addressing for our virtual slave.
        twi.completeConnect(addr === DS3231_ADDR);
      },
      writeByte: (value) => {
        if (twiSlaveAddr === DS3231_ADDR) twiTxBuf.push(value & 0xff);
        twi.completeWrite(twiSlaveAddr === DS3231_ADDR);
      },
      readByte: (ack) => {
        if (twiSlaveAddr === DS3231_ADDR) {
          const [b] = handleI2cRead(ds3231, 1);
          twi.completeRead(b ?? 0xff);
        } else {
          twi.completeRead(0xff);
        }
        // ack is just an indication the master will ACK or NACK; nothing to do.
        void ack;
      },
    };

    new AVRADC(cpu, adcConfig);

    eepromBackend = new EEPROMMemoryBackend(1024);
    new AVREEPROM(cpu, eepromBackend, eepromConfig);

    post({ type: "loaded", flashSize: parsed.size });
  } catch (e) {
    post({ type: "error", message: `Hex load failed: ${(e as Error).message}` });
  }
}

function snapshotPins(): Record<number, { mode: "INPUT" | "OUTPUT" | "INPUT_PULLUP"; digital: 0 | 1; analog: number }> {
  const out: Record<number, { mode: "INPUT" | "OUTPUT" | "INPUT_PULLUP"; digital: 0 | 1; analog: number }> = {};
  if (!portB || !portC || !portD) return out;
  for (const [pinStr, m] of Object.entries(ARDUINO_TO_AVR)) {
    const port = m.port === "B" ? portB : m.port === "C" ? portC : portD;
    const ps = port.pinState(m.bit);
    let mode: "INPUT" | "OUTPUT" | "INPUT_PULLUP" = "INPUT";
    let digital: 0 | 1 = 0;
    if (ps === AvrPinState.High) { mode = "OUTPUT"; digital = 1; }
    else if (ps === AvrPinState.Low) { mode = "OUTPUT"; digital = 0; }
    else if (ps === AvrPinState.InputPullUp) { mode = "INPUT_PULLUP"; digital = 1; }
    else { mode = "INPUT"; digital = 0; }
    out[Number(pinStr)] = { mode, digital, analog: digital ? 1023 : 0 };
  }
  return out;
}

function snapshotEeprom(): Uint8Array {
  const out = new Uint8Array(1024);
  if (!eepromBackend) return out;
  // EEPROMMemoryBackend exposes readMemory/writeMemory; we copy via readMemory.
  // Some versions store in a `memory` property — try both.
  const anyBackend = eepromBackend as unknown as { memory?: Uint8Array; readMemory?: (a: number) => number };
  if (anyBackend.memory) return anyBackend.memory.slice(0);
  if (anyBackend.readMemory) {
    for (let i = 0; i < 1024; i++) out[i] = anyBackend.readMemory(i);
  }
  return out;
}

// ------------ Run loop ------------
async function runLoop() {
  if (!cpu) return;
  running = true;
  paused = false;
  stopRequested = false;
  post({ type: "started" });

  // Run a chunk of cycles per RAF-equivalent tick. 16e6 / 60 ≈ 266k cycles
  // per frame at full speed — with `speed` scaling.
  while (!stopRequested) {
    if (paused) {
      await new Promise((r) => setTimeout(r, 30));
      continue;
    }
    const chunk = Math.max(1000, Math.floor((F_CPU / 60) * speed));
    const target = cpu.cycles + chunk;
    try {
      while (cpu.cycles < target && !stopRequested && !paused) {
        avrInstruction(cpu);
        cpu.tick();
      }
    } catch (e) {
      post({ type: "error", message: (e as Error).message });
      break;
    }

    const ms = (cpu.cycles / F_CPU) * 1000;
    const now = performance.now();
    if (now - lastPinEmit > 30) {
      lastPinEmit = now;
      post({ type: "pin-states", pins: snapshotPins(), ms });
    }
    if (now - lastSnapshot > 100) {
      lastSnapshot = now;
      const sram = cpu.data.slice(0, 0x900);
      const ee = snapshotEeprom();
      post({
        type: "snapshot",
        pc: cpu.pc,
        sp: cpu.dataView.getUint16(0x5D, true),
        cycles: cpu.cycles,
        sreg: cpu.data[0x5F],
        sramSlice: sram,
        eeprom: ee,
      });
    }

    // Note: we deliberately do NOT idle-flush partial lines. Sketches that
    // print without trailing newlines still get their data delivered when
    // the buffer reaches 256 chars (handled in onByteTransmit), or when the
    // simulation stops (final flush below). Idle-flushing fragments lines
    // because AVR-sim time is slower than wall-clock time.

    // Yield so the worker stays responsive to messages.
    await new Promise((r) => setTimeout(r, 0));
  }

  running = false;
  // Final flush of any leftover partial line on stop.
  if (serialBuf) { post({ type: "serial", text: serialBuf, kind: "out" }); serialBuf = ""; }
  post({ type: "stopped" });
}

// ------------ Message router ------------
self.addEventListener("message", (ev: MessageEvent<InMsg>) => {
  const m = ev.data;
  switch (m.type) {
    case "load-hex":
      loadHex(m.hex);
      break;
    case "start":
      speed = m.speed ?? 1;
      if (!running) runLoop();
      break;
    case "pause":
      paused = true;
      break;
    case "resume":
      paused = false;
      break;
    case "stop":
      stopRequested = true;
      paused = false;
      break;
    case "set-speed":
      speed = m.speed;
      break;
    case "set-input":
      // Drive an Arduino pin (e.g. button or sensor) into the matching AVR port.
      if (cpu && m.digital !== undefined) {
        const map = ARDUINO_TO_AVR[m.pin];
        if (map) {
          const port = map.port === "B" ? portB : map.port === "C" ? portC : portD;
          port?.setPin(map.bit, m.digital === 1);
        }
      }
      break;
    case "serial-in":
      // Push each character into UDR0 by simulating a byte-received event.
      if (usart) {
        const anyUsart = usart as unknown as { writeByte?: (b: number) => void };
        for (const ch of m.text) {
          if (anyUsart.writeByte) anyUsart.writeByte(ch.charCodeAt(0));
        }
      }
      break;
  }
});
