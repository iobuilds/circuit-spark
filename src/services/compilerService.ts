// Real-time compiler client — talks to the EmbedSim backend (Express + Bull + Socket.IO).
// Submits a compile job, subscribes to live progress over WebSocket, and falls
// back to HTTP polling if no socket events arrive within 3 seconds.

import { io, type Socket } from "socket.io-client";

const API_URL: string =
  ((import.meta as { env?: Record<string, string | undefined> }).env?.VITE_API_URL) ||
  "http://localhost:3001";

let socket: Socket | null = null;

function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, { transports: ["websocket", "polling"] });
  }
  return socket;
}

export interface CompileFile {
  name: string;
  content: string;
}

export interface CompileError {
  file: string;
  line: number;
  col: number;
  severity: "error" | "warning";
  message: string;
}

export interface CompileResult {
  success: boolean;
  stdout: string;
  stderr: string;
  errors: CompileError[];
  warnings: CompileError[];
  binary: string | null;
  binaryType: "hex" | "bin" | "uf2" | null;
  binarySize: number;
  flashUsed: number;
  flashTotal: number;
  flashPercent: number;
  ramUsed: number;
  ramTotal: number;
  ramPercent: number;
  duration: number;
  fromCache: boolean;
}

export interface CompileProgress {
  step: string;
  percent: number;
  message: string;
  lastLine?: string;
}

export interface CompileCallbacks {
  onProgress?: (progress: CompileProgress) => void;
  onComplete?: (result: CompileResult) => void;
  onError?: (error: string, errors?: CompileError[]) => void;
}

export async function compileSketch(
  board: string,
  files: CompileFile[],
  libraries: string[],
  callbacks: CompileCallbacks,
): Promise<void> {
  const sock = getSocket();

  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/compile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ board, files, libraries }),
    });
  } catch (e) {
    callbacks.onError?.(`Backend unreachable: ${(e as Error).message}`);
    return;
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Request failed" }));
    callbacks.onError?.(err.error || "Request failed", err.details);
    return;
  }

  const { jobId } = (await response.json()) as { jobId: string };

  sock.emit("subscribe:job", jobId);

  const onProgress = (data: CompileProgress & { jobId: string }) => {
    if (data.jobId === jobId) callbacks.onProgress?.(data);
  };
  const onDone = (data: { jobId: string; result: CompileResult }) => {
    if (data.jobId === jobId) {
      cleanup();
      callbacks.onComplete?.(data.result);
    }
  };
  const onErr = (data: { jobId: string; error: string; errors: CompileError[] }) => {
    if (data.jobId === jobId) {
      cleanup();
      callbacks.onError?.(data.error, data.errors);
    }
  };

  sock.on("compile:progress", onProgress);
  sock.on("compile:done", onDone);
  sock.on("compile:error", onErr);

  // Polling fallback: only used if the socket doesn't deliver progress events
  // within ~5s. Uses a long interval + exponential backoff on 429 to avoid
  // hammering the backend rate limiter.
  let pollingInterval: ReturnType<typeof setTimeout> | null = null;
  let pollDelay = 2500;
  const poll = async () => {
    try {
      const r = await fetch(`${API_URL}/api/compile/${jobId}`);
      if (r.status === 429) {
        pollDelay = Math.min(pollDelay * 2, 15000);
      } else {
        pollDelay = 2500;
        const data = await r.json();
        if (data.progress) callbacks.onProgress?.(data.progress);
        if (data.status === "completed") { cleanup(); callbacks.onComplete?.(data.result); return; }
        if (data.status === "failed")    { cleanup(); callbacks.onError?.(data.error, data.errors); return; }
      }
    } catch { /* keep polling */ }
    pollingInterval = setTimeout(poll, pollDelay);
  };
  const startPolling = () => { pollingInterval = setTimeout(poll, pollDelay); };

  const socketTimeout = setTimeout(startPolling, 5000);

  function cleanup() {
    clearTimeout(socketTimeout);
    if (pollingInterval) clearTimeout(pollingInterval);
    sock.off("compile:progress", onProgress);
    sock.off("compile:done", onDone);
    sock.off("compile:error", onErr);
    sock.emit("unsubscribe:job", jobId);
  }
}

export async function searchLibraries(query: string, topic?: string) {
  const params = new URLSearchParams({ q: query });
  if (topic) params.set("topic", topic);
  const r = await fetch(`${API_URL}/api/libraries/search?${params}`);
  return r.json();
}

export async function getInstalledLibraries() {
  const r = await fetch(`${API_URL}/api/libraries`);
  return r.json();
}

export async function installLibrary(name: string, version?: string) {
  const r = await fetch(`${API_URL}/api/libraries/install`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, version }),
  });
  return r.json();
}

export async function uninstallLibrary(name: string) {
  const r = await fetch(`${API_URL}/api/libraries/${encodeURIComponent(name)}`, { method: "DELETE" });
  return r.json();
}

export interface InstallProgressEvent {
  type: "start" | "install_start" | "install_done" | "install_error" | "finish" | "result" | "fatal";
  name?: string;
  index?: number;
  total?: number;
  message?: string;
  error?: string;
  success?: boolean;
  results?: { name: string; ok: boolean; error?: string }[];
}

export async function installLibrariesBatch(names: string[]) {
  const r = await fetch(`${API_URL}/api/libraries/install-batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
  return r.json() as Promise<{ success: boolean; results: { name: string; ok: boolean; error?: string }[] }>;
}

/**
 * Streaming variant — calls onEvent for every progress step delivered by the
 * backend (Server-Sent Events). Resolves with the final `result` event.
 */
export async function installLibrariesStream(
  names: string[],
  onEvent: (e: InstallProgressEvent) => void,
  signal?: AbortSignal,
): Promise<InstallProgressEvent | null> {
  const res = await fetch(`${API_URL}/api/libraries/install-batch/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ names }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    onEvent({ type: "fatal", error: err.error || `HTTP ${res.status}` });
    return null;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let final: InstallProgressEvent | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        const evt = JSON.parse(line.slice(6)) as InstallProgressEvent;
        onEvent(evt);
        if (evt.type === "result" || evt.type === "fatal") final = evt;
      } catch { /* ignore malformed */ }
    }
  }
  return final;
}

export async function repairLibraryIndexes() {
  const r = await fetch(`${API_URL}/api/libraries/repair`, { method: "POST" });
  return r.json();
}

export async function uploadZipLibrary(file: File) {
  const form = new FormData();
  form.append("zipfile", file);
  const r = await fetch(`${API_URL}/api/libraries/upload`, { method: "POST", body: form });
  return r.json();
}

export async function getBoards() {
  const r = await fetch(`${API_URL}/api/boards`);
  return r.json();
}

export async function getHealth() {
  const r = await fetch(`${API_URL}/api/health`);
  return r.json();
}
