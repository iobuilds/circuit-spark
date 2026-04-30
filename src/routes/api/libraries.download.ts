// Library zip download proxy with shared in-memory cache.
//
// The Arduino library index hands out direct .zip URLs hosted on
// downloads.arduino.cc / GitHub. We proxy them so:
//   1. The browser doesn't hit CORS.
//   2. The first project to "install" a library populates a shared cache.
//      Every subsequent install of the same name@version is served from
//      RAM — no repeated network egress, faster install for users.
//
// Cache key is `${name}@${version}`. Entries are evicted LRU-style once the
// total cached size grows past CACHE_BUDGET_BYTES.

import { createFileRoute } from "@tanstack/react-router";

interface CachedZip {
  bytes: ArrayBuffer;
  contentType: string;
  fetchedAt: number;
  hits: number;
  size: number;
}

const CACHE_BUDGET_BYTES = 80 * 1024 * 1024; // 80 MB shared cache
const cache = new Map<string, CachedZip>();
let cacheBytes = 0;

function evictIfNeeded() {
  if (cacheBytes <= CACHE_BUDGET_BYTES) return;
  // LRU-ish: drop entries with fewest hits / oldest first.
  const entries = [...cache.entries()].sort(
    (a, b) => (a[1].hits - b[1].hits) || (a[1].fetchedAt - b[1].fetchedAt),
  );
  for (const [k, v] of entries) {
    cache.delete(k);
    cacheBytes -= v.size;
    if (cacheBytes <= CACHE_BUDGET_BYTES * 0.8) break;
  }
}

export const Route = createFileRoute("/api/libraries/download")({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        const url = new URL(request.url);
        const name = url.searchParams.get("name") ?? "";
        const version = url.searchParams.get("version") ?? "";
        const downloadUrl = url.searchParams.get("url") ?? "";

        if (!name || !version || !downloadUrl) {
          return Response.json(
            { ok: false, error: "Missing name/version/url" },
            { status: 400 },
          );
        }

        const key = `${name}@${version}`;
        const existing = cache.get(key);
        if (existing) {
          existing.hits += 1;
          return new Response(existing.bytes, {
            headers: {
              "Content-Type": existing.contentType,
              "X-Cache": "HIT",
              "X-Cache-Hits": String(existing.hits),
              "X-Cache-Size": String(existing.size),
            },
          });
        }

        // Validate origin to prevent open-proxy abuse.
        const ALLOWED = [
          "downloads.arduino.cc",
          "github.com",
          "codeload.github.com",
          "raw.githubusercontent.com",
        ];
        try {
          const u = new URL(downloadUrl);
          if (!ALLOWED.some((d) => u.hostname === d || u.hostname.endsWith("." + d))) {
            return Response.json(
              { ok: false, error: `Origin not allowed: ${u.hostname}` },
              { status: 403 },
            );
          }
        } catch {
          return Response.json({ ok: false, error: "Invalid URL" }, { status: 400 });
        }

        try {
          const res = await fetch(downloadUrl, {
            headers: { "User-Agent": "EmbedSim/1.0 (Library proxy)" },
          });
          if (!res.ok) {
            return Response.json(
              { ok: false, error: `Upstream ${res.status}` },
              { status: 502 },
            );
          }
          const bytes = await res.arrayBuffer();
          const contentType = res.headers.get("content-type") ?? "application/zip";
          const entry: CachedZip = {
            bytes,
            contentType,
            fetchedAt: Date.now(),
            hits: 1,
            size: bytes.byteLength,
          };
          cache.set(key, entry);
          cacheBytes += entry.size;
          evictIfNeeded();
          return new Response(bytes, {
            headers: {
              "Content-Type": contentType,
              "X-Cache": "MISS",
              "X-Cache-Size": String(entry.size),
            },
          });
        } catch (err) {
          return Response.json(
            { ok: false, error: (err as Error).message },
            { status: 502 },
          );
        }
      },
    },
  },
});
