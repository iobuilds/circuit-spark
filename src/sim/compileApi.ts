// Compile API client. Talks to a backend Express server when VITE_API_URL is set.
// Otherwise returns a mock response so the UI keeps working in preview/dev.

import type { SourceFile } from "./ideStore";

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
  flashPercent?: number;
  ramUsed?: number;
  ramPercent?: number;
  compiledAt: string;
  /** True when no backend URL was configured and we returned a mock. */
  mock?: boolean;
}

export interface CompileRequest {
  board: string;          // FQBN or sim board id
  files: { name: string; content: string }[];
  libraries: string[];
  options?: { optimize?: "size" | "speed"; warnings?: "default" | "more" | "all" };
}

export const API_BASE: string =
  ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_URL) ?? "";

export const HAS_BACKEND = Boolean(API_BASE);

export async function compileSketch(req: CompileRequest): Promise<CompileResult> {
  if (!HAS_BACKEND) return mockCompile(req);

  try {
    const res = await fetch(`${API_BASE}/api/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    const json = await res.json();
    return {
      success: !!json.success,
      stdout: json.stdout,
      stderr: json.stderr,
      errors: json.errors ?? [],
      warnings: json.warnings ?? [],
      binary: json.binary,
      binarySize: json.binarySize,
      flashPercent: json.flashPercent,
      ramUsed: json.ramUsed,
      ramPercent: json.ramPercent,
      compiledAt: json.compiledAt ?? new Date().toISOString(),
    };
  } catch (e) {
    return {
      success: false,
      errors: [{ file: "network", line: 0, message: `Backend unreachable: ${(e as Error).message}` }],
      warnings: [],
      compiledAt: new Date().toISOString(),
    };
  }
}

function mockCompile(req: CompileRequest): CompileResult {
  // Trivially "compile" by checking for setup() and loop() in any .ino file.
  const ino = req.files.find((f) => f.name.endsWith(".ino"));
  const errors: CompileError[] = [];
  if (!ino) {
    errors.push({ file: "project", line: 0, message: "No .ino file in project." });
  } else {
    if (!/\bvoid\s+setup\s*\(/.test(ino.content)) errors.push({ file: ino.name, line: 1, message: "Missing void setup()" });
    if (!/\bvoid\s+loop\s*\(/.test(ino.content)) errors.push({ file: ino.name, line: 1, message: "Missing void loop()" });
  }
  const totalSize = req.files.reduce((n, f) => n + f.content.length, 0);
  const fakeBytes = 800 + Math.floor(totalSize * 0.2);
  return {
    success: errors.length === 0,
    stdout: errors.length === 0
      ? `Sketch uses ${fakeBytes} bytes (${((fakeBytes / 32768) * 100).toFixed(1)}%) of program storage.\nGlobal variables use ${Math.floor(fakeBytes / 50)} bytes.`
      : "",
    stderr: errors.length ? "Compilation failed (mock)." : "",
    errors,
    warnings: [],
    binary: errors.length === 0 ? btoa("mock-hex-binary") : undefined,
    binarySize: errors.length === 0 ? fakeBytes : undefined,
    flashPercent: errors.length === 0 ? +(fakeBytes / 327.68).toFixed(1) : undefined,
    ramUsed: errors.length === 0 ? Math.floor(fakeBytes / 50) : undefined,
    ramPercent: errors.length === 0 ? +(fakeBytes / 50 / 20.48).toFixed(1) : undefined,
    compiledAt: new Date().toISOString(),
    mock: true,
  };
}

export async function uploadZipLibrary(file: File): Promise<{ success: boolean; name?: string; headers?: string[]; error?: string }> {
  if (!HAS_BACKEND) {
    // Mock: pretend we extracted the zip and read its name
    const baseName = file.name.replace(/\.zip$/i, "");
    return {
      success: true,
      name: baseName,
      headers: [`${baseName}.h`],
    };
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
