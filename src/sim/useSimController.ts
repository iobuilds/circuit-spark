import { useEffect, useRef } from "react";
import { useSimStore } from "./store";
import type { PinState } from "./types";

type WorkerOut =
  | { type: "compile-ok"; warnings: string[] }
  | { type: "compile-error"; message: string; line: number }
  | { type: "started" }
  | { type: "stopped"; reason?: string }
  | { type: "serial"; text: string; kind: "out" | "sys" }
  | { type: "pin-states"; pins: Record<number, PinState>; ms: number }
  | { type: "loaded"; flashSize: number }
  | {
      type: "snapshot";
      pc: number;
      sp: number;
      cycles: number;
      sreg: number;
      sramSlice: Uint8Array;
      eeprom: Uint8Array;
    }
  | { type: "error"; message: string };

/**
 * Multi-board simulation controller. Each board placed on the canvas owns its
 * own Web Worker — they run in parallel so multi-board projects (e.g. master
 * + slave Uno) can be simulated together. All public methods take an optional
 * `boardId` (the canvas component id of the board); when omitted, they target
 * the active board (or all boards for `stop`).
 */
export function useSimController() {
  /** Map of boardComponentId → worker. */
  const workersRef = useRef<Map<string, Worker>>(new Map());
  /** Boards whose active worker is the avr8js emulator (i.e. real .hex). */
  const avrBoardsRef = useRef<Set<string>>(new Set());
  const setStatus = useSimStore((s) => s.setStatus);
  const setBoardStatus = useSimStore((s) => s.setBoardStatus);
  const appendSerial = useSimStore((s) => s.appendSerial);
  const setPinStates = useSimStore((s) => s.setPinStates);
  const appendPinEvents = useSimStore((s) => s.appendPinEvents);
  const setSimTime = useSimStore((s) => s.setSimTime);
  const setCompileLog = useSimStore((s) => s.setCompileLog);
  const setBoardEeprom = useSimStore((s) => s.setBoardEeprom);
  const setBoardSram = useSimStore((s) => s.setBoardSram);
  const setBoardCpu = useSimStore((s) => s.setBoardCpu);
  const setBoardAvrMode = useSimStore((s) => s.setBoardAvrMode);

  // Cleanup all workers on unmount.
  useEffect(() => {
    const map = workersRef.current;
    return () => {
      map.forEach((w) => w.terminate());
      map.clear();
    };
  }, []);

  function attachHandlers(boardId: string, w: Worker) {
    w.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      switch (m.type) {
        case "compile-ok":
          setCompileLog([{ kind: "info", text: "Compilation successful." }, ...m.warnings.map((wn) => ({ kind: "warn" as const, text: wn }))]);
          break;
        case "compile-error":
          setCompileLog([{ kind: "error", text: `Line ${m.line}: ${m.message}` }]);
          setBoardStatus(boardId, "error");
          appendSerial({ ts: Date.now(), text: `Compile error: ${m.message}`, kind: "sys" }, boardId);
          break;
        case "started":
          setBoardStatus(boardId, "running");
          appendSerial({ ts: Date.now(), text: "── Simulation started ──", kind: "sys" }, boardId);
          break;
        case "stopped":
          setBoardStatus(boardId, "idle");
          appendSerial({ ts: Date.now(), text: "── Simulation stopped ──", kind: "sys" }, boardId);
          break;
        case "serial":
          appendSerial({ ts: Date.now(), text: m.text, kind: m.kind }, boardId);
          break;
        case "pin-states":
          setPinStates(m.pins, boardId);
          setSimTime(m.ms);
          break;
        case "loaded":
          appendSerial({ ts: Date.now(), text: `── avr8js loaded ${m.flashSize} bytes ──`, kind: "sys" }, boardId);
          break;
        case "snapshot":
          setBoardSram(boardId, m.sramSlice);
          setBoardEeprom(boardId, m.eeprom);
          setBoardCpu(boardId, { pc: m.pc, sp: m.sp, cycles: m.cycles, sreg: m.sreg });
          break;
        case "error":
          setBoardStatus(boardId, "error");
          appendSerial({ ts: Date.now(), text: `Runtime error: ${m.message}`, kind: "sys" }, boardId);
          break;
      }
    };
  }

  function getOrCreate(boardId: string): Worker {
    const existing = workersRef.current.get(boardId);
    if (existing) return existing;
    const w = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    attachHandlers(boardId, w);
    workersRef.current.set(boardId, w);
    avrBoardsRef.current.delete(boardId);
    setBoardAvrMode(boardId, false);
    return w;
  }

  function createAvrWorker(boardId: string): Worker {
    const existing = workersRef.current.get(boardId);
    if (existing) { existing.terminate(); workersRef.current.delete(boardId); }
    const w = new Worker(new URL("./avr.worker.ts", import.meta.url), { type: "module" });
    attachHandlers(boardId, w);
    workersRef.current.set(boardId, w);
    avrBoardsRef.current.add(boardId);
    setBoardAvrMode(boardId, true);
    return w;
  }

  function resolveBoardId(boardId?: string): string {
    if (boardId) return boardId;
    const active = useSimStore.getState().activeSimBoardId;
    if (active) return active;
    // Fall back to first placed board on the canvas.
    const first = useSimStore.getState().components.find((c) => c.kind === "board");
    return first?.id ?? "default";
  }

  function broadcastBoardIds(): string[] {
    const ids = Array.from(workersRef.current.keys());
    return ids.length ? ids : [resolveBoardId()];
  }

  return {
    compile: (code: string, boardId?: string) =>
      getOrCreate(resolveBoardId(boardId)).postMessage({ type: "compile", code }),
    start: (code: string, speed: number, boardId?: string) => {
      const id = resolveBoardId(boardId);
      const flash = useSimStore.getState().flashByBoard[id];
      // If we have a compiled .hex for this board, run avr8js cycle-accurate
      // emulation against the real binary. Otherwise fall back to the
      // JS-translation runtime in sim.worker.ts.
      if (flash && flash.length > 0) {
        const w = createAvrWorker(id);
        useSimStore.getState().setPinStates({}, id);
        // Convert flash bytes back to a HEX-like base64 string is overkill —
        // the worker accepts raw HEX OR base64 of HEX. We send the bytes via
        // a special message and the worker rebuilds an in-memory image.
        // Easiest: pass the bytes directly through the existing parser path
        // by constructing a minimal HEX string in the worker. We instead
        // forward the original base64 .hex stashed alongside flash.
        const hex = useSimStore.getState().flashByBoard[id];
        // Convert Uint8Array → ":" Intel HEX string in 16-byte rows.
        let hexStr = "";
        for (let a = 0; a < hex.length; a += 16) {
          const len = Math.min(16, hex.length - a);
          let sum = len + ((a >> 8) & 0xff) + (a & 0xff) + 0x00;
          let line = `:${len.toString(16).padStart(2, "0").toUpperCase()}${a.toString(16).padStart(4, "0").toUpperCase()}00`;
          for (let i = 0; i < len; i++) {
            const b = hex[a + i];
            line += b.toString(16).padStart(2, "0").toUpperCase();
            sum += b;
          }
          const cs = ((-sum) & 0xff).toString(16).padStart(2, "0").toUpperCase();
          hexStr += line + cs + "\n";
        }
        hexStr += ":00000001FF\n";
        w.postMessage({ type: "load-hex", hex: hexStr });
        w.postMessage({ type: "start", speed });
        void code;
        return;
      }
      // Replace the worker on every start so a re-run picks up new code even
      // if the previous program is still in its loop. Otherwise sim.worker
      // sees `running=true` and only sets stopRequested without restarting.
      const existing = workersRef.current.get(id);
      if (existing) { existing.terminate(); workersRef.current.delete(id); }
      useSimStore.getState().setPinStates({}, id);
      getOrCreate(id).postMessage({ type: "start", code, speed });
    },
    pause: (boardId?: string) => {
      if (boardId) workersRef.current.get(boardId)?.postMessage({ type: "pause" });
      else workersRef.current.forEach((w) => w.postMessage({ type: "pause" }));
      // Status updated locally so UI reflects paused even before worker echoes.
      const ids = boardId ? [boardId] : broadcastBoardIds();
      ids.forEach((id) => setBoardStatus(id, "paused"));
    },
    resume: (boardId?: string) => {
      if (boardId) workersRef.current.get(boardId)?.postMessage({ type: "resume" });
      else workersRef.current.forEach((w) => w.postMessage({ type: "resume" }));
      const ids = boardId ? [boardId] : broadcastBoardIds();
      ids.forEach((id) => setBoardStatus(id, "running"));
    },
    stop: (boardId?: string) => {
      if (boardId) workersRef.current.get(boardId)?.postMessage({ type: "stop" });
      else workersRef.current.forEach((w) => w.postMessage({ type: "stop" }));
    },
    setSpeed: (speed: number, boardId?: string) => {
      if (boardId) workersRef.current.get(boardId)?.postMessage({ type: "set-speed", speed });
      else workersRef.current.forEach((w) => w.postMessage({ type: "set-speed", speed }));
    },
    setInput: (pin: number, value: { digital?: 0 | 1; analog?: number }, boardId?: string) => {
      const target = boardId ? [workersRef.current.get(boardId)] : Array.from(workersRef.current.values());
      target.forEach((w) => w?.postMessage({ type: "set-input", pin, ...value }));
    },
    serialIn: (text: string, boardId?: string) => {
      const id = resolveBoardId(boardId);
      workersRef.current.get(id)?.postMessage({ type: "serial-in", text });
    },
    /** Internal: explicitly remove a board's worker (e.g. when board is deleted). */
    disposeBoard: (boardId: string) => {
      const w = workersRef.current.get(boardId);
      if (w) { w.terminate(); workersRef.current.delete(boardId); }
    },
    // Back-compat aliases (some places still call setStatus directly via the store).
    _setStatus: setStatus,
  };
}
