// Detect Arduino libraries required by a sketch from its `#include <header.h>`
// lines, match them against the catalog, and return the list of library IDs
// to ship with the compile request. Optionally persists newly-required libs
// into the IDE store so the user can see them in the Library Manager.
//
// Behaviour:
//   - Scans each .ino/.h/.cpp/.c file for #include <X> lines (system-style).
//   - Looks up each header in LIBRARY_PACKAGES (matching `headers`).
//   - Already-installed libraries stay installed; new ones are added.
//   - Standard Arduino headers (Wire.h, SPI.h, EEPROM.h, Arduino.h, …) and
//     headers that don't match any catalog entry are silently ignored —
//     the Arduino CLI ships those built-in or the compile error will surface
//     them just like normal.

import { LIBRARY_PACKAGES } from "./ideCatalog";
import { useIdeStore, type InstalledLibrary } from "./ideStore";

/** Headers always available without an external library. */
const BUILTIN_HEADERS = new Set([
  "Arduino.h", "Wire.h", "SPI.h", "EEPROM.h", "SoftwareSerial.h",
  "HardwareSerial.h", "string.h", "stdio.h", "stdlib.h", "math.h",
  "stdint.h", "stddef.h", "stdbool.h", "ctype.h", "avr/pgmspace.h",
  "avr/io.h", "avr/interrupt.h", "avr/sleep.h", "avr/wdt.h", "util/delay.h",
  "util/atomic.h",
]);

/** Extract every <header.h> system-include from a single source file. */
function extractIncludes(src: string): string[] {
  const out: string[] = [];
  // Strip block + line comments first so commented-out includes don't count.
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine = noBlock.replace(/\/\/[^\n]*/g, "");
  const re = /^\s*#\s*include\s*<([^>]+)>/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noLine)) !== null) out.push(m[1].trim());
  return out;
}

export interface AutoInstallResult {
  /** Final list of library IDs to send with the compile request. */
  libraryIds: string[];
  /** New library packages added to the IDE store (for UI feedback). */
  added: { id: string; name: string }[];
  /** Headers that didn't match any catalog entry and aren't built-in. */
  unknown: string[];
}

/**
 * Resolve required libraries for a set of sketch files and persist any new
 * ones into the IDE store so they show up in the Library Manager.
 */
export function resolveRequiredLibraries(
  files: { name: string; content: string }[],
): AutoInstallResult {
  // Gather every #include header from every file in the sketch.
  const headers = new Set<string>();
  for (const f of files) for (const h of extractIncludes(f.content)) headers.add(h);

  const store = useIdeStore.getState();
  const installedById = new Map(store.installedLibraries.map((l) => [l.id, l] as const));
  const finalIds = new Set(installedById.keys());
  const added: { id: string; name: string }[] = [];
  const unknown: string[] = [];

  for (const h of headers) {
    if (BUILTIN_HEADERS.has(h)) continue;

    // Find the FIRST catalog entry that declares this header. If multiple
    // libraries share a header, we prefer one already installed; otherwise
    // we pick the first listed (catalog order = curation order).
    const matches = LIBRARY_PACKAGES.filter((p) => p.headers?.includes(h));
    if (matches.length === 0) {
      unknown.push(h);
      continue;
    }
    const preferred = matches.find((m) => installedById.has(m.id)) ?? matches[0];
    finalIds.add(preferred.id);

    if (!installedById.has(preferred.id)) {
      const lib: InstalledLibrary = {
        id: preferred.id,
        version: preferred.version,
        name: preferred.name,
        headers: preferred.headers,
      };
      store.installLibrary(lib);
      installedById.set(preferred.id, lib);
      added.push({ id: preferred.id, name: preferred.name });
    }
  }

  return { libraryIds: Array.from(finalIds), added, unknown };
}
