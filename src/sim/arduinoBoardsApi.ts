// Client helper for the live Arduino Boards Manager search.

export interface ArduinoBoardEntry {
  id: string;
  package: string;
  architecture: string;
  name: string;
  maintainer: string;
  website: string;
  latestVersion: string;
  versions: string[];
  category: string;
  boards: string[];
  downloadUrl: string;
  archiveFileName: string;
  size: number;
}

export const BOARD_CATEGORIES = ["All", "Arduino", "Contributed", "ESP32", "ESP8266"] as const;

export async function searchArduinoBoards(opts: {
  q?: string;
  category?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<{
  ok: boolean;
  results: ArduinoBoardEntry[];
  total?: number;
  count?: number;
  error?: string;
}> {
  const sp = new URLSearchParams();
  if (opts.q) sp.set("q", opts.q);
  if (opts.category && opts.category !== "All") sp.set("category", opts.category);
  if (opts.limit) sp.set("limit", String(opts.limit));
  try {
    const res = await fetch(`/api/boards/search?${sp.toString()}`, { signal: opts.signal });
    if (!res.ok) return { ok: false, results: [], error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e) {
    return { ok: false, results: [], error: (e as Error).message };
  }
}

export function formatBytes(n: number): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
