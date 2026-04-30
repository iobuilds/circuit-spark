// Translate a subset of Arduino C++ into JavaScript.
// Supported:
//   - global int/float/long/unsigned/bool/char/String declarations (with init)
//   - void/int/float/bool/long named functions, including setup() and loop()
//   - control flow: if/else/for/while/do-while/switch/break/continue/return
//   - Serial.begin/print/println/read/available
//   - pinMode, digitalWrite, digitalRead, analogWrite, analogRead, delay, delayMicroseconds, millis, micros, tone, noTone, map, constrain, random
//   - HIGH/LOW/INPUT/OUTPUT/INPUT_PULLUP constants, true/false
//   - Single-line // comments and /* */ block comments
//   - Numeric types are all JS numbers; String becomes JS string
//
// Returns a JS source string that defines `setup` and `loop` on the runtime context, or throws a CompileError with a line number.

export class CompileError extends Error {
  line: number;
  constructor(msg: string, line: number) {
    super(msg);
    this.line = line;
  }
}

const TYPE_TOKENS = new Set([
  "void","int","long","short","unsigned","signed","float","double","bool","boolean","byte","char","String","size_t","uint8_t","uint16_t","uint32_t","int8_t","int16_t","int32_t",
]);

function stripComments(src: string): string {
  // Remove /* ... */ but preserve newlines for line numbers
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  // Remove // ... but preserve length on the same line
  out = out.replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
  return out;
}

interface FuncSig {
  name: string;
  params: { name: string }[];
  bodyStart: number; // index in source after `{`
  bodyEnd: number;   // index of matching `}`
}

function findMatchingBrace(src: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function lineOf(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

/** Translate a C-ish expression/statement body into JS. Operates token-by-token-ish via regex passes. */
function translateBody(body: string): string {
  let s = body;

  // Replace String type declarations like: String foo = "x";  -> let foo = "x";
  // Variable declarations: <type> <name> [= expr] [, name = expr]*;
  // We also handle arrays: int arr[3] = {1,2,3};
  s = s.replace(
    /\b(?:unsigned\s+|signed\s+)?(?:const\s+)?(?:int|long|short|float|double|bool|boolean|byte|char|String|size_t|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t)\s+([^;]+);/g,
    (_m, decl: string) => {
      // decl like: "x = 5, y, arr[3] = {1,2,3}"
      const parts = splitTopLevel(decl, ",");
      const out = parts.map((p) => {
        const t = p.trim();
        // array form
        const arr = /^([A-Za-z_]\w*)\s*\[\s*(\d*)\s*\]\s*(?:=\s*(.+))?$/.exec(t);
        if (arr) {
          const name = arr[1];
          const init = arr[3];
          if (init) {
            const conv = init.trim().replace(/^\{/, "[").replace(/\}$/, "]");
            return `let ${name} = ${conv}`;
          }
          const size = arr[2] ? Number(arr[2]) : 0;
          return `let ${name} = new Array(${size}).fill(0)`;
        }
        const m = /^([A-Za-z_]\w*)\s*(?:=\s*(.+))?$/.exec(t);
        if (m) {
          return m[2] !== undefined ? `let ${m[1]} = ${m[2]}` : `let ${m[1]} = 0`;
        }
        return `/* ${t} */`;
      });
      return out.join("; ") + ";";
    }
  );

  // Constants
  s = s.replace(/\bHIGH\b/g, "1")
       .replace(/\bLOW\b/g, "0")
       .replace(/\bINPUT_PULLUP\b/g, '"INPUT_PULLUP"')
       .replace(/\bOUTPUT\b/g, '"OUTPUT"')
       .replace(/\bINPUT\b/g, '"INPUT"')
       .replace(/\btrue\b/g, "true")
       .replace(/\bfalse\b/g, "false");

  // Serial.* methods - pass through (runtime supplies Serial object)
  // Convert 'Serial.print(x, DEC)' second-arg forms by stripping unsupported second args
  s = s.replace(/Serial\.(print|println)\s*\(([^()]*)\)/g, (_m, m: string, args: string) => {
    const parts = splitTopLevel(args, ",");
    return `Serial.${m}(${parts[0] ?? '""'})`;
  });

  // String concatenation with + works in JS — leave alone.

  // Convert `delay(N)` to `await __rt.delay(N)`
  s = s.replace(/\bdelay\s*\(/g, "await __rt.delay(");
  s = s.replace(/\bdelayMicroseconds\s*\(/g, "await __rt.delayMicroseconds(");

  // Convert other Arduino calls to runtime calls
  const rtFns = [
    "pinMode", "digitalWrite", "digitalRead", "analogWrite", "analogRead",
    "millis", "micros", "tone", "noTone", "map", "constrain",
  ];
  for (const fn of rtFns) {
    const re = new RegExp(`\\b${fn}\\s*\\(`, "g");
    s = s.replace(re, `__rt.${fn}(`);
  }
  // random(a) or random(a,b)
  s = s.replace(/\brandom\s*\(/g, "__rt.random(");

  // for (int i=0; i<n; i++) — drop the type keyword inside for-init
  s = s.replace(
    /for\s*\(\s*(?:unsigned\s+|signed\s+|const\s+)?(?:int|long|short|float|double|byte|size_t|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t)\s+/g,
    "for (let "
  );

  // Increase await-ness of loops: any loop body might call delay; we made delay an await call so functions become async.
  // We need to ensure `for` and `while` are inside an async function — handled at function level.

  return s;
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
    else if (ch === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

interface ExtractedFn {
  name: string;
  params: string[];
  body: string;
  startLine: number;
}

function extractFunctions(src: string): { funcs: ExtractedFn[]; globals: string } {
  const funcs: ExtractedFn[] = [];
  let globals = "";
  let i = 0;
  // Walk through source. Whenever we see `<type> <name>(...)` followed by `{`, treat as function.
  const fnRe = /(?:^|[\s;}])((?:unsigned\s+|signed\s+|const\s+|static\s+)*(?:void|int|long|short|float|double|bool|boolean|byte|char|String|size_t|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*)\{/g;

  const matches: { name: string; params: string; openIdx: number; matchStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = fnRe.exec(src)) !== null) {
    const openIdx = fnRe.lastIndex - 1; // points at '{'
    matches.push({ name: m[2], params: m[3], openIdx, matchStart: m.index + (m[0].length - m[1].length - 1) });
  }

  let lastEnd = 0;
  for (const mt of matches) {
    const close = findMatchingBrace(src, mt.openIdx);
    if (close < 0) throw new CompileError("Unmatched '{' in function body", lineOf(src, mt.openIdx));
    // Globals: everything between lastEnd and matchStart
    globals += src.slice(lastEnd, mt.matchStart);
    const body = src.slice(mt.openIdx + 1, close);
    funcs.push({
      name: mt.name,
      params: mt.params.split(",").map((p) => p.trim()).filter(Boolean).map((p) => p.replace(/^.*\s+/, "")),
      body,
      startLine: lineOf(src, mt.matchStart),
    });
    lastEnd = close + 1;
  }
  globals += src.slice(lastEnd);
  return { funcs, globals };
}

export function compileArduino(src: string): { js: string; warnings: string[] } {
  const warnings: string[] = [];
  const noComments = stripComments(src);

  // Strip #include and #define lines (best-effort)
  const cleaned = noComments
    .replace(/^\s*#include[^\n]*$/gm, "")
    .replace(/^\s*#define\s+(\w+)\s+(.+)$/gm, "const $1 = $2;");

  const { funcs, globals } = extractFunctions(cleaned);

  if (!funcs.find((f) => f.name === "setup")) {
    throw new CompileError("Missing setup() function", 1);
  }
  if (!funcs.find((f) => f.name === "loop")) {
    throw new CompileError("Missing loop() function", 1);
  }

  // Translate globals: variable declarations only.
  const translatedGlobals = translateBody(globals);

  // Translate each function body.
  const translatedFns = funcs.map((f) => {
    const body = translateBody(f.body);
    const paramList = f.params.join(", ");
    return `async function ${f.name}(${paramList}) {\n${body}\n}`;
  });

  const js = `
"use strict";
// generated
${translatedGlobals}
${translatedFns.join("\n\n")}
__rt.__bind({ setup: typeof setup === "function" ? setup : null, loop: typeof loop === "function" ? loop : null });
`;
  return { js, warnings };
}
