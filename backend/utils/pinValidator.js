// Static pin-range validator for Arduino sketches.
//
// arduino-cli happily compiles `digitalWrite(60, HIGH)` because the parameter
// is a uint8_t — but pin 60 doesn't exist on an Uno. This module runs a
// regex-based scan of pin-taking calls and flags numeric literals that are
// outside the selected board's valid pin range. It is intentionally
// conservative: it only flags calls where the pin argument is a plain integer
// literal, never variables or expressions.

// Maximum digital pin number per board family (inclusive). Analog pins (A0+)
// are aliased to numbers above the max digital pin and still fall in range.
const BOARD_PIN_RANGES = {
  'arduino-uno':       { min: 0, max: 19, label: 'Arduino Uno (digital 0-13, analog A0-A5 = 14-19)' },
  'arduino-nano':      { min: 0, max: 21, label: 'Arduino Nano (digital 0-13, analog A0-A7 = 14-21)' },
  'arduino-nano-old':  { min: 0, max: 21, label: 'Arduino Nano (digital 0-13, analog A0-A7 = 14-21)' },
  'arduino-mini':      { min: 0, max: 21, label: 'Arduino Mini' },
  'arduino-pro5v':     { min: 0, max: 21, label: 'Arduino Pro Mini' },
  'arduino-pro3v':     { min: 0, max: 21, label: 'Arduino Pro Mini' },
  'arduino-mega':      { min: 0, max: 69, label: 'Arduino Mega 2560 (digital 0-53, analog A0-A15 = 54-69)' },
  'arduino-leonardo':  { min: 0, max: 29, label: 'Arduino Leonardo' },
  'arduino-micro':     { min: 0, max: 29, label: 'Arduino Micro' },
};

// Functions whose first argument is a pin number.
const PIN_FUNCS = [
  'pinMode', 'digitalWrite', 'digitalRead',
  'analogWrite', 'analogRead',
  'tone', 'noTone',
  'attachInterrupt', 'detachInterrupt',
  'pulseIn', 'pulseInLong',
];

function stripCommentsAndStrings(src) {
  // Replace block comments with whitespace (preserve newlines for line numbers).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  // Replace line comments.
  out = out.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  // Replace string literals with spaces of the same length.
  out = out.replace(/"(?:\\.|[^"\\])*"/g, (m) => ' '.repeat(m.length));
  out = out.replace(/'(?:\\.|[^'\\])*'/g, (m) => ' '.repeat(m.length));
  return out;
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

function colOf(src, idx) {
  let col = 1;
  for (let i = idx - 1; i >= 0; i--) {
    if (src[i] === '\n') break;
    col++;
  }
  return col;
}

/**
 * Validate pin-number literals across all sketch files for the given board.
 * Returns an array of CompileError-shaped objects (empty if all good, or if
 * the board has no defined pin range).
 */
function validatePins(files, board) {
  const range = BOARD_PIN_RANGES[board];
  if (!range || !Array.isArray(files)) return [];

  const errors = [];

  for (const f of files) {
    if (!f || !f.name || !f.content) continue;
    if (!/\.(ino|cpp|c|h)$/i.test(f.name)) continue;

    const src = stripCommentsAndStrings(f.content);

    for (const fn of PIN_FUNCS) {
      // Match: <fnName> ( <whitespace> <integer-literal> <whitespace> [, ...) | )
      const re = new RegExp(`\\b${fn}\\s*\\(\\s*(\\d+)\\s*(?=[,)])`, 'g');
      let m;
      while ((m = re.exec(src)) !== null) {
        const pin = parseInt(m[1], 10);
        if (pin < range.min || pin > range.max) {
          const litIdx = m.index + m[0].indexOf(m[1]);
          errors.push({
            file: f.name.split('/').pop(),
            line: lineOf(src, litIdx),
            col: colOf(src, litIdx),
            severity: 'error',
            message: `Invalid pin ${pin} in ${fn}() — ${range.label} supports pins ${range.min}-${range.max}.`,
          });
        }
      }
    }
  }

  return errors;
}

module.exports = { validatePins, BOARD_PIN_RANGES };
