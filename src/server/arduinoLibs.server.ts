// Server-only helper: fetches the official Arduino library index and searches it.
// The full index is large (~50MB raw JSON, ~50k entries with duplicate versions).
// We dedupe to one entry per library name (keeping the latest version), keep only
// the fields we need, and cache the result in memory for the lifetime of this
// Worker instance with a TTL.

export interface ArduinoLibrary {
  name: string;
  version: string;
  author: string;
  maintainer?: string;
  sentence: string;
  paragraph?: string;
  website?: string;
  repository?: string;
  category?: string;
  architectures: string[];
}

interface RawLibrary extends ArduinoLibrary {
  // identical shape — only used during parsing.
}

interface IndexCache {
  libs: ArduinoLibrary[];
  fetchedAt: number;
}

const INDEX_URL = "https://downloads.arduino.cc/libraries/library_index.json";
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let cache: IndexCache | null = null;
let inFlight: Promise<IndexCache> | null = null;

function compareSemver(a: string, b: string): number {
  const pa = a.split(/[.\-+]/).map((p) => parseInt(p, 10));
  const pb = b.split(/[.\-+]/).map((p) => parseInt(p, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = Number.isFinite(pa[i]) ? pa[i] : 0;
    const bv = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

async function loadIndex(): Promise<IndexCache> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch(INDEX_URL);
    if (!res.ok) throw new Error(`Arduino library index ${res.status}`);
    const data = (await res.json()) as { libraries: RawLibrary[] };

    // Dedupe to latest version per library name.
    const byName = new Map<string, ArduinoLibrary>();
    for (const lib of data.libraries) {
      if (!lib?.name) continue;
      const existing = byName.get(lib.name);
      if (!existing || compareSemver(lib.version, existing.version) > 0) {
        byName.set(lib.name, {
          name: lib.name,
          version: lib.version,
          author: lib.author,
          maintainer: lib.maintainer,
          sentence: lib.sentence ?? "",
          paragraph: lib.paragraph ?? "",
          website: lib.website,
          repository: lib.repository,
          category: lib.category,
          architectures: lib.architectures ?? [],
        });
      }
    }
    cache = { libs: Array.from(byName.values()), fetchedAt: Date.now() };
    inFlight = null;
    return cache;
  })();

  try {
    return await inFlight;
  } catch (e) {
    inFlight = null;
    throw e;
  }
}

/** Tokenize a query into useful keywords (drop short words & generic terms). */
function tokenize(s: string): string[] {
  const STOP = new Set([
    "the", "and", "for", "with", "that", "this", "from", "into", "your",
    "small", "tiny", "real", "module", "modules", "component", "components",
    "board", "boards", "pin", "pins", "sensor", "sensors", "device", "an", "a",
    "of", "to", "in", "on", "is", "it", "by",
  ]);
  return Array.from(
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 .-]+/g, " ")
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !STOP.has(t)),
    ),
  );
}

export interface LibSearchInput {
  /** Component name, e.g. "0.96 SSD1306 OLED Display" */
  name?: string;
  /** Slug, e.g. "ssd1306-oled" */
  slug?: string;
  /** Free-form description */
  description?: string;
  /** Extra keywords */
  keywords?: string[];
  /** Max results (default 8) */
  limit?: number;
}

export interface LibMatch extends ArduinoLibrary {
  score: number;
  matchedTerms: string[];
}

export async function searchArduinoLibraries(input: LibSearchInput): Promise<LibMatch[]> {
  const limit = input.limit ?? 8;
  const idx = await loadIndex();
  const terms = tokenize(
    [input.name, input.slug?.replace(/-/g, " "), input.description, (input.keywords ?? []).join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  if (terms.length === 0) return [];

  const results: LibMatch[] = [];
  for (const lib of idx.libs) {
    const haystack = [
      lib.name,
      lib.sentence,
      lib.paragraph ?? "",
      lib.category ?? "",
      lib.author ?? "",
    ]
      .join(" ")
      .toLowerCase();

    let score = 0;
    const matched: string[] = [];
    for (const term of terms) {
      if (!haystack.includes(term)) continue;
      matched.push(term);
      // Stronger weight when the term appears in the library name.
      if (lib.name.toLowerCase().includes(term)) score += 5;
      else if ((lib.sentence ?? "").toLowerCase().includes(term)) score += 2;
      else score += 1;
    }
    if (score > 0) {
      // Bonus for popular/official authors
      if (/adafruit|arduino|sparkfun|espressif/i.test(lib.author ?? "")) score += 1;
      results.push({ ...lib, score, matchedTerms: matched });
    }
  }

  results.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return results.slice(0, limit);
}
