// Client helper for the live Arduino library index proxy.

export interface ArduinoLibraryEntry {
  id: string;
  name: string;
  author: string;
  maintainer: string;
  latestVersion: string;
  versions: string[];
  sentence: string;
  paragraph: string;
  website: string;
  category: string;
  architectures: string[];
  types: string[];
  headers: string[];
  downloadUrl: string;
  archiveFileName: string;
  size: number;
}

export interface ArduinoSearchResult {
  ok: boolean;
  total?: number;
  count?: number;
  results: ArduinoLibraryEntry[];
  cachedAt?: number | null;
  error?: string;
}

export async function searchArduinoLibraries(params: {
  q?: string;
  category?: string;
  type?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<ArduinoSearchResult> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.category && params.category !== "All") sp.set("category", params.category);
  if (params.type && params.type !== "All") sp.set("type", params.type);
  sp.set("limit", String(params.limit ?? 60));

  try {
    const res = await fetch(`/api/libraries/search?${sp.toString()}`, { signal: params.signal });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, results: [], error: `HTTP ${res.status} ${txt}` };
    }
    return (await res.json()) as ArduinoSearchResult;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return { ok: false, results: [], error: "aborted" };
    }
    return { ok: false, results: [], error: (err as Error).message };
  }
}

export const ARDUINO_CATEGORIES = [
  "All",
  "Communication",
  "Data Processing",
  "Data Storage",
  "Device Control",
  "Display",
  "Other",
  "Sensors",
  "Signal Input/Output",
  "Timing",
  "Uncategorized",
];

export const ARDUINO_TYPES = ["All", "Arduino", "Partner", "Recommended", "Contributed", "Retired"];
