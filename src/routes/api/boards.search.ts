// Proxies the official Arduino board package index and serves filtered results.
// Source: https://downloads.arduino.cc/packages/package_index.json
// Same file Arduino IDE / arduino-cli use for the Boards Manager.

import { createFileRoute } from "@tanstack/react-router";

const INDEX_URLS = [
  "https://downloads.arduino.cc/packages/package_index.json",
  // 3rd-party indexes Arduino IDE pulls when configured. We fetch the official
  // ones so users see ESP32 / ESP8266 / RP2040 / STM32 etc. live.
  "https://espressif.github.io/arduino-esp32/package_esp32_index.json",
  "https://arduino.esp8266.com/stable/package_esp8266com_index.json",
  "https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json",
  "https://github.com/stm32duino/BoardManagerFiles/raw/main/package_stmicroelectronics_index.json",
];
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours

interface RawBoard { name: string; }
interface RawHelp { online?: string; }
interface RawPlatform {
  name: string;
  architecture: string;
  version: string;
  category?: string;
  url: string;
  archiveFileName?: string;
  size?: number | string;
  checksum?: string;
  help?: RawHelp;
  boards?: RawBoard[];
  toolsDependencies?: { packager: string; name: string; version: string }[];
}
interface RawPackage {
  name: string;
  maintainer?: string;
  websiteURL?: string;
  email?: string;
  help?: RawHelp;
  platforms?: RawPlatform[];
}
interface RawIndex { packages: RawPackage[] }

export interface ArduinoBoardEntry {
  id: string;             // e.g. "arduino:avr"
  package: string;        // "arduino"
  architecture: string;   // "avr"
  name: string;           // platform name
  maintainer: string;
  website: string;
  latestVersion: string;
  versions: string[];
  category: string;
  boards: string[];
  downloadUrl: string;    // latest archive
  archiveFileName: string;
  size: number;
}

let cache: { fetchedAt: number; entries: ArduinoBoardEntry[] } | null = null;
let inflight: Promise<ArduinoBoardEntry[]> | null = null;

function cmpSemver(a: string, b: string) {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10));
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = isNaN(pa[i]) ? 0 : pa[i];
    const bv = isNaN(pb[i]) ? 0 : pb[i];
    if (av !== bv) return av - bv;
  }
  return 0;
}

function aggregate(raw: RawIndex): ArduinoBoardEntry[] {
  const out: ArduinoBoardEntry[] = [];
  for (const pkg of raw.packages ?? []) {
    const byArch = new Map<string, RawPlatform[]>();
    for (const p of pkg.platforms ?? []) {
      const arr = byArch.get(p.architecture) ?? [];
      arr.push(p);
      byArch.set(p.architecture, arr);
    }
    for (const [arch, list] of byArch) {
      list.sort((a, b) => cmpSemver(a.version, b.version));
      const latest = list[list.length - 1];
      out.push({
        id: `${pkg.name}:${arch}`,
        package: pkg.name,
        architecture: arch,
        name: latest.name,
        maintainer: pkg.maintainer ?? "",
        website: pkg.websiteURL ?? latest.help?.online ?? "",
        latestVersion: latest.version,
        versions: list.map((p) => p.version),
        category: latest.category ?? "Contributed",
        boards: (latest.boards ?? []).map((b) => b.name).slice(0, 24),
        downloadUrl: latest.url,
        archiveFileName: latest.archiveFileName ?? "",
        size: typeof latest.size === "string" ? parseInt(latest.size, 10) || 0 : (latest.size ?? 0),
      });
    }
  }
  return out;
}

async function fetchIndex(url: string): Promise<RawIndex | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "EmbedSim/1.0 (Boards Manager)" } });
    if (!res.ok) return null;
    return (await res.json()) as RawIndex;
  } catch { return null; }
}

async function loadIndex(): Promise<ArduinoBoardEntry[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.entries;
  if (inflight) return inflight;

  inflight = (async () => {
    const raws = await Promise.all(INDEX_URLS.map(fetchIndex));
    const merged: RawIndex = { packages: [] };
    for (const r of raws) if (r?.packages) merged.packages.push(...r.packages);
    const entries = aggregate(merged);
    cache = { fetchedAt: Date.now(), entries };
    return entries;
  })();

  try { return await inflight; }
  finally { inflight = null; }
}

function score(e: ArduinoBoardEntry, q: string): number {
  if (!q) return 1;
  const n = e.name.toLowerCase();
  const m = e.maintainer.toLowerCase();
  const id = e.id.toLowerCase();
  const boards = e.boards.join(" ").toLowerCase();
  if (n === q || id === q) return 1000;
  if (n.startsWith(q) || id.startsWith(q)) return 500;
  if (n.includes(q) || id.includes(q)) return 300;
  if (boards.includes(q)) return 200;
  if (m.includes(q)) return 100;
  return 0;
}

export const Route = createFileRoute("/api/boards/search")({
  server: ({
    handlers: undefined as never,
  } as never) && undefined as never,
} as never);

(createFileRoute("/api/boards/search") as any)({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
        const category = url.searchParams.get("category") ?? "";
        const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "60", 10) || 60, 200);
        try {
          const entries = await loadIndex();
          let filtered = entries;
          if (category && category !== "All") filtered = filtered.filter((e) => e.category === category);
          const ranked = filtered
            .map((e) => ({ e, s: score(e, q) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
            .slice(0, limit)
            .map((x) => x.e);
          return Response.json({
            ok: true,
            total: filtered.length,
            count: ranked.length,
            results: ranked,
            cachedAt: cache?.fetchedAt ?? null,
          });
        } catch (err) {
          return Response.json({ ok: false, error: (err as Error).message, results: [] }, { status: 502 });
        }
      },
    },
  },
});
