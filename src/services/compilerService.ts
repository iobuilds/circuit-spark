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

  // Polling fallback: if the socket doesn't deliver events in 3s, start polling.
  let pollingInterval: ReturnType<typeof setInterval> | null = null;
  const startPolling = () => {
    pollingInterval = setInterval(async () => {
      try {
        const r = await fetch(`${API_URL}/api/compile/${jobId}`);
        const data = await r.json();
        if (data.progress) callbacks.onProgress?.(data.progress);
        if (data.status === "completed") {
          cleanup();
          callbacks.onComplete?.(data.result);
        } else if (data.status === "failed") {
          cleanup();
          callbacks.onError?.(data.error, data.errors);
        }
      } catch (e) { /* keep polling */ }
    }, 1000);
  };

  const socketTimeout = setTimeout(startPolling, 3000);

  function cleanup() {
    clearTimeout(socketTimeout);
    if (pollingInterval) clearInterval(pollingInterval);
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
