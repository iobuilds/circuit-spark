// Proxies the official Arduino library index and serves filtered results.
// The full index is ~10MB JSON; we cache it in module memory after the first
// fetch, then run a fast in-memory search per request.
//
// Source: https://downloads.arduino.cc/libraries/library_index.json
// (Same file Arduino IDE / arduino-cli use for the Library Manager.)

import { createFileRoute } from "@tanstack/react-router";

const INDEX_URL = "https://downloads.arduino.cc/libraries/library_index.json";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

interface RawLibraryRelease {
  name: string;
  version: string;
  author?: string;
  maintainer?: string;
  sentence?: string;
  paragraph?: string;
  website?: string;
  category?: string;
  architectures?: string[];
  types?: string[];
  url: string;
  archiveFileName?: string;
  size?: number;
  checksum?: string;
  providesIncludes?: string[];
  dependencies?: { name: string; version?: string }[];
}

interface RawIndex {
  libraries: RawLibraryRelease[];
}

// Aggregated, latest-version-per-name shape we send to the client.
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

let cache: { fetchedAt: number; entries: ArduinoLibraryEntry[] } | null = null;
let inflight: Promise<ArduinoLibraryEntry[]> | null = null;

function compareSemver(a: string, b: string) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10));
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = isNaN(pa[i]) ? 0 : pa[i];
    const bv = isNaN(pb[i]) ? 0 : pb[i];
    if (av !== bv) return av - bv;
  }
  return 0;
}

function aggregate(raw: RawIndex): ArduinoLibraryEntry[] {
  const byName = new Map<string, RawLibraryRelease[]>();
  for (const r of raw.libraries) {
    if (!r.name) continue;
    const arr = byName.get(r.name) ?? [];
    arr.push(r);
    byName.set(r.name, arr);
  }
  const entries: ArduinoLibraryEntry[] = [];
  for (const [name, releases] of byName) {
    releases.sort((a, b) => compareSemver(a.version, b.version));
    const latest = releases[releases.length - 1];
    entries.push({
      id: `arduino:${name}`,
      name,
      author: latest.author ?? "",
      maintainer: latest.maintainer ?? "",
      latestVersion: latest.version,
      versions: releases.map((r) => r.version),
      sentence: latest.sentence ?? "",
      paragraph: latest.paragraph ?? "",
      website: latest.website ?? "",
      category: latest.category ?? "Other",
      architectures: latest.architectures ?? [],
      types: latest.types ?? [],
      headers: latest.providesIncludes ?? [],
      downloadUrl: latest.url,
      archiveFileName: latest.archiveFileName ?? "",
      size: latest.size ?? 0,
    });
  }
  return entries;
}

async function loadIndex(): Promise<ArduinoLibraryEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.entries;
  if (inflight) return inflight;

  inflight = (async () => {
    const res = await fetch(INDEX_URL, {
      headers: { "User-Agent": "EmbedSim/1.0 (Arduino Library Manager)" },
    });
    if (!res.ok) throw new Error(`Arduino index fetch failed: ${res.status}`);
    const raw = (await res.json()) as RawIndex;
    const entries = aggregate(raw);
    cache = { fetchedAt: Date.now(), entries };
    return entries;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

function scoreMatch(e: ArduinoLibraryEntry, q: string): number {
  if (!q) return 1;
  const n = e.name.toLowerCase();
  const a = e.author.toLowerCase();
  const s = e.sentence.toLowerCase();
  const p = e.paragraph.toLowerCase();
  const headers = e.headers.join(" ").toLowerCase();
  if (n === q) return 1000;
  if (n.startsWith(q)) return 500;
  if (n.includes(q)) return 300;
  if (headers.includes(q)) return 200;
  if (a.includes(q)) return 100;
  if (s.includes(q)) return 50;
  if (p.includes(q)) return 20;
  return 0;
}

export const Route = createFileRoute("/api/libraries/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        const category = url.searchParams.get("category") ?? "";
        const type = url.searchParams.get("type") ?? "";
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "60", 10) || 60, 200);

        try {
          const entries = await loadIndex();
          let filtered = entries;
          if (category && category !== "All") {
            filtered = filtered.filter((e) => e.category === category);
          }
          if (type && type !== "All") {
            filtered = filtered.filter((e) => e.types.includes(type));
          }
          const scored = filtered
            .map((e) => ({ e, score: scoreMatch(e, q) }))
            .filter((x) => x.score > 0)
            .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name))
            .slice(0, limit)
            .map((x) => x.e);

          return Response.json({
            ok: true,
            total: filtered.length,
            count: scored.length,
            results: scored,
            cachedAt: cache?.fetchedAt ?? null,
          });
        } catch (err) {
          return Response.json(
            { ok: false, error: (err as Error).message, results: [] },
            { status: 502 },
          );
        }
      },
    },
  },
});
