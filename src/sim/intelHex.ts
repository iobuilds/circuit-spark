// Browser-safe Intel HEX parser. Accepts a HEX string OR a base64-encoded HEX
// payload (what the backend returns) and produces a Uint8Array of program data
// padded with 0xFF up to the highest address written.
//
// The parser supports the standard record types used by avr-objcopy / arduino-cli:
//   00 DATA, 01 END_OF_FILE, 02 EXT_SEGMENT_ADDR, 04 EXT_LINEAR_ADDR,
//   03 START_SEGMENT_ADDR, 05 START_LINEAR_ADDR.

export interface ParsedHex {
  /** Flash image, byte-addressed, padded with 0xFF to highestAddr+1. */
  data: Uint8Array;
  /** Highest written byte address + 1 (i.e. effective program size). */
  size: number;
  /** Start address from a record-05, when present (rarely used on AVR). */
  startLinearAddress: number | null;
}

function decodeBase64ToString(b64: string): string {
  if (typeof atob === "function") {
    const bin = atob(b64);
    return bin;
  }
  // Node fallback (worker bundling occasionally lands here).
  const G = globalThis as { Buffer?: { from(d: string, e: string): { toString(e: string): string } } };
  if (G.Buffer) return G.Buffer.from(b64, "base64").toString("binary");
  throw new Error("No base64 decoder available");
}

function looksLikeBase64(s: string): boolean {
  // HEX records start with ':'. If the first non-whitespace char isn't ':',
  // treat as base64.
  const t = s.trimStart();
  return t.length > 0 && t[0] !== ":";
}

export function parseIntelHex(input: string): ParsedHex {
  const text = looksLikeBase64(input) ? decodeBase64ToString(input) : input;

  // Pre-allocate a generous flash buffer (max Atmega328P flash is 32 KB).
  // We'll resize down to highestAddr+1 at the end.
  const buf = new Uint8Array(64 * 1024);
  buf.fill(0xff);
  let highest = 0;
  let upper = 0;
  let startLinearAddress: number | null = null;

  const lines = text.split(/\r?\n/);
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (line.length === 0) continue;
    if (line[0] !== ":") throw new Error(`HEX line ${li + 1}: missing ':'`);

    const len = parseInt(line.substr(1, 2), 16);
    const addr = parseInt(line.substr(3, 4), 16);
    const type = parseInt(line.substr(7, 2), 16);
    const dataStart = 9;

    if (type === 0x00) {
      const fullAddr = (upper << 16) | addr;
      for (let i = 0; i < len; i++) {
        const byte = parseInt(line.substr(dataStart + i * 2, 2), 16);
        const a = fullAddr + i;
        if (a < buf.length) buf[a] = byte;
        if (a + 1 > highest) highest = a + 1;
      }
    } else if (type === 0x01) {
      break;
    } else if (type === 0x02) {
      // segment address: shift left 4
      upper = (parseInt(line.substr(dataStart, 4), 16) << 4) >>> 16;
    } else if (type === 0x04) {
      upper = parseInt(line.substr(dataStart, 4), 16);
    } else if (type === 0x05) {
      startLinearAddress = parseInt(line.substr(dataStart, 8), 16);
    }
    // type 0x03 (start segment) is ignored on AVR.
  }

  return { data: buf.slice(0, Math.max(highest, 1)), size: highest, startLinearAddress };
}
