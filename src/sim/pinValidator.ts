// Client-side mirror of backend/utils/pinValidator.js so invalid pin numbers
// are caught instantly in the IDE — no backend round-trip, no cache to bust.
// Keep ranges in sync with backend/utils/pinValidator.js.

export interface PinRange {
  min: number;
  max: number;
  label: string;
}

export const BOARD_PIN_RANGES: Record<string, PinRange> = {
  "arduino-uno":      { min: 0, max: 19, label: "Arduino Uno (digital 0-13, analog A0-A5 = 14-19)" },
  "arduino-nano":     { min: 0, max: 21, label: "Arduino Nano (digital 0-13, analog A0-A7 = 14-21)" },
  "arduino-nano-old": { min: 0, max: 21, label: "Arduino Nano (digital 0-13, analog A0-A7 = 14-21)" },
  "arduino-mini":     { min: 0, max: 21, label: "Arduino Mini" },
  "arduino-pro5v":    { min: 0, max: 21, label: "Arduino Pro Mini" },
  "arduino-pro3v":    { min: 0, max: 21, label: "Arduino Pro Mini" },
  "arduino-mega":     { min: 0, max: 69, label: "Arduino Mega 2560 (digital 0-53, analog A0-A15 = 54-69)" },
  "arduino-leonardo": { min: 0, max: 29, label: "Arduino Leonardo" },
  "arduino-micro":    { min: 0, max: 29, label: "Arduino Micro" },
};

const PIN_FUNCS = [
  "pinMode", "digitalWrite", "digitalRead",
  "analogWrite", "analogRead",
  "tone", "noTone",
  "attachInterrupt", "detachInterrupt",
  "pulseIn", "pulseInLong",
];

function stripCommentsAndStrings(src: string): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  out = out.replace(/"(?:\\.|[^"\\])*"/g, (m) => " ".repeat(m.length));
  out = out.replace(/'(?:\\.|[^'\\])*'/g, (m) => " ".repeat(m.length));
  return out;
}

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

function colOf(src: string, idx: number): number {
  let col = 1;
  for (let i = idx - 1; i >= 0; i--) {
    if (src[i] === "\n") break;
    col++;
  }
  return col;
}

export interface PinValidationError {
  file: string;
  line: number;
  col: number;
  severity: "error";
  message: string;
}

export function validatePins(
  files: { name: string; content: string }[],
  board: string,
): PinValidationError[] {
  const range = BOARD_PIN_RANGES[board];
  if (!range || !Array.isArray(files)) return [];

  const errors: PinValidationError[] = [];
  for (const f of files) {
    if (!f?.name || !f?.content) continue;
    if (!/\.(ino|cpp|c|h)$/i.test(f.name)) continue;

    const src = stripCommentsAndStrings(f.content);
    for (const fn of PIN_FUNCS) {
      const re = new RegExp(`\\b${fn}\\s*\\(\\s*(\\d+)\\s*(?=[,)])`, "g");
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const pin = parseInt(m[1], 10);
        if (pin < range.min || pin > range.max) {
          const litIdx = m.index + m[0].indexOf(m[1]);
          errors.push({
            file: f.name.split("/").pop() || f.name,
            line: lineOf(src, litIdx),
            col: colOf(src, litIdx),
            severity: "error",
            message: `Invalid pin ${pin} in ${fn}() — ${range.label} supports pins ${range.min}-${range.max}.`,
          });
        }
      }
    }
  }
  return errors;
}
