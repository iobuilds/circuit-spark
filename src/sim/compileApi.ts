// Compile API client. Wraps the real-time compilerService (Socket.IO + HTTP)
// so the IDE has a single, simple Promise-based call site, while still exposing
// progress events for the UI.
//
// NO MOCKING. If the backend is unreachable, the returned result has success=false
// and an explanatory error — the caller should surface it to the user.

import type { SourceFile } from "./ideStore";
import {
  compileSketch as streamCompile,
  type CompileProgress,
  type CompileResult as StreamResult,
  type CompileError as StreamError,
} from "@/services/compilerService";
import { validatePins } from "./pinValidator";

export interface CompileError {
  file: string;
  line: number;
  col?: number;
  message: string;
  severity?: "error" | "warning";
}

export interface CompileResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  errors: CompileError[];
  warnings: CompileError[];
  binary?: string;        // base64
  binarySize?: number;
  flashUsed?: number;
  flashTotal?: number;
  flashPercent?: number;
  ramUsed?: number;
  ramTotal?: number;
  ramPercent?: number;
  duration?: number;
  fromCache?: boolean;
  compiledAt: string;
}

export interface CompileRequest {
  board: string;
  files: { name: string; content: string }[];
  libraries: string[];
  options?: { optimize?: "size" | "speed"; warnings?: "default" | "more" | "all" };
}

export type { CompileProgress };

export const API_BASE: string =
  ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_URL) ?? "";

export const HAS_BACKEND = Boolean(API_BASE);

function adaptError(e: StreamError): CompileError {
  return { file: e.file, line: e.line, col: e.col, message: e.message, severity: e.severity };
}

function adaptResult(r: StreamResult): CompileResult {
  return {
    success: r.success,
    stdout: r.stdout,
    stderr: r.stderr,
    errors: (r.errors ?? []).map(adaptError),
    warnings: (r.warnings ?? []).map(adaptError),
    binary: r.binary ?? undefined,
    binarySize: r.binarySize,
    flashUsed: r.flashUsed,
    flashTotal: r.flashTotal,
    flashPercent: r.flashPercent,
    ramUsed: r.ramUsed,
    ramTotal: r.ramTotal,
    ramPercent: r.ramPercent,
    duration: r.duration,
    fromCache: r.fromCache,
    compiledAt: new Date().toISOString(),
  };
}

/**
 * Compile a sketch via the real backend. Resolves with the final CompileResult.
 * Progress events are delivered via onProgress (live percent + step + last log line).
 */
export function compileSketch(
  req: CompileRequest,
  onProgress?: (p: CompileProgress) => void,
): Promise<CompileResult> {
  if (!HAS_BACKEND) {
    return Promise.resolve({
      success: false,
      errors: [{
        file: "config",
        line: 0,
        message: "VITE_API_URL is not configured. Start the backend (cd backend && npm run dev) and set VITE_API_URL.",
        severity: "error",
      }],
      warnings: [],
      compiledAt: new Date().toISOString(),
    });
  }

  // Client-side pin-range validation — runs before any backend call so a
  // stale compile cache (or an un-restarted worker) cannot let invalid pins
  // like digitalWrite(60, …) slip through on an Uno.
  const backendBoard = mapBoardIdToBackend(req.board);
  const pinErrors = validatePins(req.files, backendBoard);
  if (pinErrors.length > 0) {
    onProgress?.({ step: "validate", percent: 100, message: `Invalid pin reference (${pinErrors.length}) ✗` } as CompileProgress);
    return Promise.resolve({
      success: false,
      stdout: "",
      stderr: pinErrors.map(e => `${e.file}:${e.line}:${e.col}: error: ${e.message}`).join("\n"),
      errors: pinErrors.map(e => ({ file: e.file, line: e.line, col: e.col, message: e.message, severity: "error" as const })),
      warnings: [],
      compiledAt: new Date().toISOString(),
    });
  }

  return new Promise((resolve) => {
    streamCompile(backendBoard, req.files, req.libraries, {
      onProgress: (p) => onProgress?.(p),
      onComplete: (r) => resolve(adaptResult(r)),
      onError: (msg, errs) => resolve({
        success: false,
        stderr: msg,
        errors: (errs ?? []).map(adaptError).concat(errs && errs.length ? [] : [{
          file: "compile",
          line: 0,
          message: msg,
          severity: "error",
        }]),
        warnings: [],
        compiledAt: new Date().toISOString(),
      }),
    }).catch((e) => {
      resolve({
        success: false,
        errors: [{ file: "network", line: 0, message: `Backend error: ${(e as Error).message}`, severity: "error" }],
        warnings: [],
        compiledAt: new Date().toISOString(),
      });
    });
  });
}

export async function uploadZipLibrary(file: File): Promise<{ success: boolean; name?: string; headers?: string[]; error?: string }> {
  if (!HAS_BACKEND) {
    return { success: false, error: "VITE_API_URL not configured" };
  }
  try {
    const fd = new FormData();
    fd.append("zipfile", file);
    const res = await fetch(`${API_BASE}/api/libraries/upload`, { method: "POST", body: fd });
    const json = await res.json();
    return {
      success: !!json.success,
      name: json.name,
      headers: json.headers,
      error: json.error,
    };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

export function fileSliceForCompile(files: SourceFile[]) {
  return files.map((f) => ({ name: f.name, content: f.content }));
}

/**
 * Map the simulator's internal BoardId (e.g. "uno", "mega") to the backend's
 * board-config key (e.g. "arduino-uno", "arduino-mega"). Backend keys come from
 * backend/config/boards.js. If the id already matches a backend key (e.g. an
 * AI-installed board), pass it through unchanged.
 */
export function mapBoardIdToBackend(boardId: string): string {
  const direct: Record<string, string> = {
    uno: "arduino-uno",
    mega: "arduino-mega",
    nano: "arduino-nano",
    "nano-old": "arduino-nano-old",
    mini: "arduino-mini",
    leonardo: "arduino-leonardo",
    micro: "arduino-micro",
    "pro5v": "arduino-pro5v",
    "pro3v": "arduino-pro3v",
    zero: "arduino-zero",
    mkr1010: "arduino-mkr1010",
    nodemcu: "esp8266-nodemcu",
    d1mini: "esp8266-d1mini",
    esp32: "esp32-devkit",
    "esp32-devkit": "esp32-devkit",
    bluepill: "stm32-bluepill",
    blackpill: "stm32-blackpill",
    pico: "rp2040-pico",
    "pico-w": "rp2040-pico-w",
  };
  if (direct[boardId]) return direct[boardId];
  // Already a hyphenated FQBN-style key — pass through.
  if (boardId.includes("-") || boardId.includes(":")) return boardId;
  // Last-resort heuristic: prefix with "arduino-".
  return `arduino-${boardId}`;
}
