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
} from "./ds3231";
import {
  createSsd1306State,
  SSD1306_ADDRS,
  SSD1306_W,
  SSD1306_H,
  ssd1306HandleI2cRead,
  ssd1306HandleI2cWrite,
  ssd1306Render,
} from "./ssd1306";

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
  | { type: "pin-states"; pins: Record<number, { mode: "INPUT" | "OUTPUT" | "INPUT_PULLUP"; digital: 0 | 1; analog: number }>; ms: number; events?: { pin: number; t: number; d: 0 | 1 }[] }
  | { type: "snapshot"; pc: number; sp: number; cycles: number; sreg: number; sramSlice: Uint8Array; eeprom: Uint8Array }
  | { type: "oled-frame"; addr: number; w: number; h: number; bitmap: Uint8Array; on: boolean; invert: boolean; contrast: number }
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
// Map of I2C address → SSD1306 emulator. We allow both 0x3C and 0x3D so
// sketches using either Adafruit_SSD1306 default work out of the box.
const oleds = new Map<number, ReturnType<typeof createSsd1306State>>();
for (const a of SSD1306_ADDRS) oleds.set(a, createSsd1306State());
const lastOledDirty = new Map<number, number>();
let lastOledEmit = 0;

/** Rolling buffer of pin transitions captured since the last `pin-states`
 *  emission. Populated by AVRIOPort.addListener hooks installed at load time.
 *  `t` is in **virtual milliseconds** (cpu.cycles / F_CPU * 1000) so the
 *  Signal Inspector can render real µs-resolution waveforms. */
const pinEventBuf: { pin: number; t: number; d: 0 | 1 }[] = [];
const lastPinLevel: Record<number, 0 | 1> = {};

function loadHex(hex: string) {
  try {
    pinEventBuf.length = 0;
    for (const k of Object.keys(lastPinLevel)) delete lastPinLevel[Number(k)];
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

    // Capture per-bit edges on every port change so the Signal Inspector
    // can render real I2C / SPI / GPIO waveforms with µs precision (instead
    // of being aliased away by the 30 ms `pin-states` snapshot interval).
    const installPortLogger = (port: AVRIOPort, portName: "B" | "C" | "D") => {
      port.addListener((value, oldValue) => {
        if (!cpu) return;
        const tMs = (cpu.cycles / F_CPU) * 1000;
        const diff = value ^ oldValue;
        if (diff === 0) return;
        for (const [pinStr, m] of Object.entries(ARDUINO_TO_AVR)) {
          if (m.port !== portName) continue;
          const mask = 1 << m.bit;
          if ((diff & mask) === 0) continue;
          const pinNum = Number(pinStr);
          const ps = port.pinState(m.bit);
          let level: 0 | 1 = 0;
          if (ps === AvrPinState.High) level = 1;
          else if (ps === AvrPinState.InputPullUp) level = 1;
          if (lastPinLevel[pinNum] === level) continue;
          lastPinLevel[pinNum] = level;
          pinEventBuf.push({ pin: pinNum, t: tMs, d: level });
          // Cap in-worker backlog so a runaway program can't OOM us.
          if (pinEventBuf.length > 8192) pinEventBuf.splice(0, pinEventBuf.length - 8192);
        }
      });
    };
    installPortLogger(portB, "B");
    installPortLogger(portC, "C");
    installPortLogger(portD, "D");

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
    //
    // The avr8js TWI peripheral handles I2C entirely through the TWCR/TWDR
    // registers — it does NOT toggle PC4/PC5 (A4/A5 = SDA/SCL) via AVRIOPort.
    // That means our port-level edge logger never sees any I2C activity, and
    // the Signal Inspector shows a flat HIGH line. To make the logic-analyzer
    // useful we synthesize realistic I2C waveforms here: each TWI event
    // (START / STOP / connect / write / read) emits the corresponding
    // sequence of SDA + SCL bit transitions at standard-mode timing
    // (100 kHz → 10 µs per bit). The events are pushed straight into
    // pinEventBuf so the inspector renders true bit-banged waveforms.
    const SDA_PIN = 18; // PC4 / A4
    const SCL_PIN = 19; // PC5 / A5
    const I2C_BIT_US = 10; // 100 kHz standard mode (10 µs / bit)
    /** Cursor in virtual µs for the next I2C bit edge. Always advanced past
     *  cpu.cycles so successive transactions don't overlap. */
    let i2cCursorUs = 0;
    /** Last emitted level on each line (start both HIGH = bus idle). */
    let sdaLast: 0 | 1 = 1;
    let sclLast: 0 | 1 = 1;
    lastPinLevel[SDA_PIN] = 1;
    lastPinLevel[SCL_PIN] = 1;
    const nowUs = () => (cpu ? (cpu.cycles / F_CPU) * 1e6 : 0);
    const emitI2c = (pin: number, tUs: number, d: 0 | 1) => {
      const tMs = tUs / 1000;
      pinEventBuf.push({ pin, t: tMs, d });
      lastPinLevel[pin] = d;
      if (pinEventBuf.length > 8192) pinEventBuf.splice(0, pinEventBuf.length - 8192);
    };
    const setSda = (d: 0 | 1, tUs: number) => {
      if (sdaLast === d) return;
      sdaLast = d;
      emitI2c(SDA_PIN, tUs, d);
    };
    const setScl = (d: 0 | 1, tUs: number) => {
      if (sclLast === d) return;
      sclLast = d;
      emitI2c(SCL_PIN, tUs, d);
    };
    const advance = () => {
      i2cCursorUs = Math.max(i2cCursorUs + I2C_BIT_US, nowUs());
    };
    const startCursor = () => {
      i2cCursorUs = Math.max(i2cCursorUs, nowUs());
    };
    /** Emit a single I2C byte (8 data bits MSB-first + 1 ACK bit). SCL pulses
     *  for each bit; SDA is set during the SCL-low half then sampled on rise. */
    const emitByte = (value: number, ack: boolean) => {
      for (let i = 7; i >= 0; i--) {
        const bit = ((value >> i) & 1) as 0 | 1;
        // SCL low → set SDA
        setScl(0, i2cCursorUs);
        setSda(bit, i2cCursorUs + 1);
        advance();
        // SCL high (data sampled by slave)
        setScl(1, i2cCursorUs);
        advance();
      }
      // ACK / NACK bit (master or slave drives SDA low for ACK).
      setScl(0, i2cCursorUs);
      setSda(ack ? 0 : 1, i2cCursorUs + 1);
      advance();
      setScl(1, i2cCursorUs);
      advance();
    };
    const emitStart = (repeated: boolean) => {
      startCursor();
      if (repeated) {
        // Repeated START: SCL high, SDA falls.
        setScl(1, i2cCursorUs); advance();
        setSda(1, i2cCursorUs); advance();
        setSda(0, i2cCursorUs); advance();
      } else {
        // Bus idle (both high), then SDA falls while SCL high.
        setSda(1, i2cCursorUs); setScl(1, i2cCursorUs); advance();
        setSda(0, i2cCursorUs); advance();
      }
      setScl(0, i2cCursorUs); advance();
    };
    const emitStop = () => {
      startCursor();
      setScl(0, i2cCursorUs); setSda(0, i2cCursorUs + 1); advance();
      setScl(1, i2cCursorUs); advance();
      setSda(1, i2cCursorUs); advance(); // STOP: SDA rises while SCL high
    };

    const twi = new AVRTWI(cpu, twiConfig, F_CPU);
    let twiSlaveAddr = -1;
    let twiSlaveWrite = false;
    /** Bytes written by the master in the current transaction.
     *  First byte is interpreted as the DS3231 register pointer; subsequent
     *  bytes are register writes (auto-incrementing pointer). */
    let twiTxBuf: number[] = [];
    const isKnownSlave = (addr: number) =>
      addr === DS3231_ADDR || oleds.has(addr);
    twi.eventHandler = {
      start: (repeated) => {
        twiTxBuf = [];
        emitStart(repeated);
        twi.completeStart();
      },
      stop: () => {
        if (twiSlaveWrite && twiTxBuf.length) {
          if (twiSlaveAddr === DS3231_ADDR) {
            handleI2cWrite(ds3231, twiTxBuf);
          } else if (oleds.has(twiSlaveAddr)) {
            ssd1306HandleI2cWrite(oleds.get(twiSlaveAddr)!, twiTxBuf);
          }
        }
        emitStop();
        twiSlaveAddr = -1;
        twiTxBuf = [];
        twi.completeStop();
      },
      connectToSlave: (addr, write) => {
        twiSlaveAddr = addr;
        twiSlaveWrite = write;
        twiTxBuf = [];
        const ack = isKnownSlave(addr);
        const addrByte = ((addr & 0x7f) << 1) | (write ? 0 : 1);
        emitByte(addrByte, ack);
        twi.completeConnect(ack);
      },
      writeByte: (value) => {
        const ack = isKnownSlave(twiSlaveAddr);
        if (ack) twiTxBuf.push(value & 0xff);
        emitByte(value & 0xff, ack);
        twi.completeWrite(ack);
      },
      readByte: (ack) => {
        let b = 0xff;
        if (twiSlaveAddr === DS3231_ADDR) {
          [b] = handleI2cRead(ds3231, 1);
        } else if (oleds.has(twiSlaveAddr)) {
          [b] = ssd1306HandleI2cRead(oleds.get(twiSlaveAddr)!, 1);
        }
        emitByte(b, ack);
        twi.completeRead(b);
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
      const events = pinEventBuf.splice(0, pinEventBuf.length);
      post({ type: "pin-states", pins: snapshotPins(), ms, events });
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
    // OLED framebuffer: emit at ~30 Hz, only for displays that have changed.
    if (now - lastOledEmit > 33) {
      lastOledEmit = now;
      for (const [addr, st] of oleds) {
        if (st.dirty === lastOledDirty.get(addr)) continue;
        lastOledDirty.set(addr, st.dirty);
        const bitmap = ssd1306Render(st);
        post({
          type: "oled-frame", addr, w: SSD1306_W, h: SSD1306_H,
          bitmap, on: st.on, invert: st.invert, contrast: st.contrast,
        }, [bitmap.buffer]);
      }
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
