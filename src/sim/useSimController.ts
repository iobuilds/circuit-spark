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
  | { type: "error"; message: string };

export function useSimController() {
  const workerRef = useRef<Worker | null>(null);

  const setStatus = useSimStore((s) => s.setStatus);
  const appendSerial = useSimStore((s) => s.appendSerial);
  const setPinStates = useSimStore((s) => s.setPinStates);
  const setSimTime = useSimStore((s) => s.setSimTime);
  const setCompileLog = useSimStore((s) => s.setCompileLog);

  useEffect(() => {
    const w = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      switch (m.type) {
        case "compile-ok":
          setCompileLog([{ kind: "info", text: "Compilation successful." }, ...m.warnings.map((w) => ({ kind: "warn" as const, text: w }))]);
          break;
        case "compile-error":
          setCompileLog([{ kind: "error", text: `Line ${m.line}: ${m.message}` }]);
          setStatus("error");
          appendSerial({ ts: Date.now(), text: `Compile error: ${m.message}`, kind: "sys" });
          break;
        case "started":
          setStatus("running");
          appendSerial({ ts: Date.now(), text: "── Simulation started ──", kind: "sys" });
          break;
        case "stopped":
          setStatus("idle");
          appendSerial({ ts: Date.now(), text: "── Simulation stopped ──", kind: "sys" });
          break;
        case "serial":
          appendSerial({ ts: Date.now(), text: m.text, kind: m.kind });
          break;
        case "pin-states":
          setPinStates(m.pins);
          setSimTime(m.ms);
          break;
        case "error":
          setStatus("error");
          appendSerial({ ts: Date.now(), text: `Runtime error: ${m.message}`, kind: "sys" });
          break;
      }
    };
    return () => { w.terminate(); workerRef.current = null; };
  }, [setStatus, appendSerial, setPinStates, setSimTime, setCompileLog]);

  return {
    compile: (code: string) => workerRef.current?.postMessage({ type: "compile", code }),
    start: (code: string, speed: number) => workerRef.current?.postMessage({ type: "start", code, speed }),
    pause: () => workerRef.current?.postMessage({ type: "pause" }),
    resume: () => workerRef.current?.postMessage({ type: "resume" }),
    stop: () => workerRef.current?.postMessage({ type: "stop" }),
    setSpeed: (speed: number) => workerRef.current?.postMessage({ type: "set-speed", speed }),
    setInput: (pin: number, value: { digital?: 0 | 1; analog?: number }) =>
      workerRef.current?.postMessage({ type: "set-input", pin, ...value }),
    serialIn: (text: string) => workerRef.current?.postMessage({ type: "serial-in", text }),
  };
}
