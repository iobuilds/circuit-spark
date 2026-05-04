// SSD1306 128x64 monochrome OLED I2C emulator.
//
// Implements enough of the SSD1306 datasheet (and Adafruit_SSD1306 / U8g2
// usage patterns) to faithfully render Arduino sketches that drive a
// 0.96" I2C OLED at address 0x3C (or 0x3D):
//
//  - Co=0/D/C control byte (0x00 commands, 0x40 data, with optional Co bit)
//  - Page addressing mode (default after reset)
//  - Horizontal addressing mode (most modern libraries)
//  - Set column address (0x21), set page address (0x22)
//  - Set page start (0xB0..B7), set column low/high (0x00..0x0F / 0x10..0x1F)
//  - Display ON/OFF (0xAE/0xAF), invert (0xA6/0xA7), entire-on (0xA4/0xA5)
//  - Multi-byte command consumption (contrast 0x81, charge pump 0x8D, etc.)
//  - GDDRAM = 128 columns × 8 pages (1 bit per pixel, LSB = top of page)
//
// The framebuffer (128×64 packed-by-page Uint8Array of length 1024) is the
// authoritative output — UI components render it pixel-by-pixel.

export const SSD1306_ADDRS = [0x3c, 0x3d] as const;
export const SSD1306_W = 128;
export const SSD1306_H = 64;
export const SSD1306_PAGES = SSD1306_H / 8;        // 8
export const SSD1306_GDDRAM = SSD1306_W * SSD1306_PAGES; // 1024 bytes

export interface Ssd1306State {
  /** GDDRAM, organized as page-major: byte index = page*128 + col.
   *  Bit 0 of each byte is the top pixel of the page. */
  ram: Uint8Array;
  /** Display on/off (0xAE/0xAF). Off = blank panel. */
  on: boolean;
  /** Invert colors (0xA6 normal, 0xA7 invert). */
  invert: boolean;
  /** Entire-display-on test mode (0xA5). */
  allOn: boolean;
  /** Contrast 0..255 (0x81 cmd) — used as panel brightness multiplier. */
  contrast: number;

  /** Current addressing mode: 0=horizontal, 1=vertical, 2=page (default). */
  addrMode: 0 | 1 | 2;
  /** Page-mode current page (0..7) and current column (0..127). */
  page: number;
  col: number;
  /** Horizontal-mode windows. */
  colStart: number;
  colEnd: number;
  pageStart: number;
  pageEnd: number;

  /** When the next byte of an I2C transaction is pending after a multi-byte
   *  command opcode, store how many command-arg bytes still need consuming. */
  pendingCmdArgs: number;
  /** The opcode awaiting args (e.g. 0x21, 0x22, 0x81…). */
  pendingCmd: number;
  /** Buffered args for the pending command. */
  cmdArgs: number[];

  /** Monotonically increasing whenever GDDRAM changes — UI uses this to
   *  decide when to repaint without diffing 1KB every frame. */
  dirty: number;
}

export function createSsd1306State(): Ssd1306State {
  return {
    ram: new Uint8Array(SSD1306_GDDRAM),
    on: false,
    invert: false,
    allOn: false,
    contrast: 0x7f,
    addrMode: 2, // page mode is the power-on default
    page: 0,
    col: 0,
    colStart: 0,
    colEnd: SSD1306_W - 1,
    pageStart: 0,
    pageEnd: SSD1306_PAGES - 1,
    pendingCmdArgs: 0,
    pendingCmd: 0,
    cmdArgs: [],
    dirty: 0,
  };
}

/** Number of arg bytes that follow common SSD1306 command opcodes. */
function argsForCmd(op: number): number {
  switch (op) {
    case 0x81: return 1; // contrast
    case 0x21: return 2; // column addr (start, end)
    case 0x22: return 2; // page addr (start, end)
    case 0x20: return 1; // memory addressing mode
    case 0xd5: return 1; // display clock divide
    case 0xa8: return 1; // multiplex ratio
    case 0xd3: return 1; // display offset
    case 0xda: return 1; // COM pins config
    case 0xd9: return 1; // pre-charge period
    case 0xdb: return 1; // VCOMH deselect
    case 0x8d: return 1; // charge pump
    case 0x40: // start line (0x40..0x7F bake the value in, no args)
    default: return 0;
  }
}

function applyCommand(s: Ssd1306State, op: number, args: number[]) {
  // Single-byte opcodes
  if (op >= 0xb0 && op <= 0xb7) { s.page = op - 0xb0; return; }      // page start
  if (op >= 0x00 && op <= 0x0f) { s.col = (s.col & 0xf0) | op; return; }     // col low nibble
  if (op >= 0x10 && op <= 0x1f) { s.col = (s.col & 0x0f) | ((op - 0x10) << 4); return; } // col high nibble
  switch (op) {
    case 0xae: s.on = false; return;
    case 0xaf: s.on = true; return;
    case 0xa4: s.allOn = false; return;
    case 0xa5: s.allOn = true; return;
    case 0xa6: s.invert = false; return;
    case 0xa7: s.invert = true; return;
    case 0x81: s.contrast = args[0] & 0xff; return;
    case 0x20: {
      const m = args[0] & 0x03;
      s.addrMode = (m === 0 ? 0 : m === 1 ? 1 : 2);
      return;
    }
    case 0x21: {
      s.colStart = args[0] & 0x7f;
      s.colEnd = args[1] & 0x7f;
      s.col = s.colStart;
      return;
    }
    case 0x22: {
      s.pageStart = args[0] & 0x07;
      s.pageEnd = args[1] & 0x07;
      s.page = s.pageStart;
      return;
    }
    // Init-time configuration commands — accepted, no visible side-effects in our model.
    case 0xd5: case 0xa8: case 0xd3: case 0xda: case 0xd9: case 0xdb: case 0x8d:
      return;
    default:
      // Unknown — ignore to keep init sequences happy.
      return;
  }
}

function writeData(s: Ssd1306State, byte: number) {
  if (s.addrMode === 0) {
    // Horizontal: advance column; wrap to next page in window.
    const idx = s.page * SSD1306_W + s.col;
    s.ram[idx] = byte & 0xff;
    if (s.col >= s.colEnd) {
      s.col = s.colStart;
      s.page = s.page >= s.pageEnd ? s.pageStart : s.page + 1;
    } else {
      s.col++;
    }
  } else if (s.addrMode === 1) {
    // Vertical: advance page; wrap to next column.
    const idx = s.page * SSD1306_W + s.col;
    s.ram[idx] = byte & 0xff;
    if (s.page >= s.pageEnd) {
      s.page = s.pageStart;
      s.col = s.col >= s.colEnd ? s.colStart : s.col + 1;
    } else {
      s.page++;
    }
  } else {
    // Page addressing (default). Column wraps within 0..127.
    const idx = s.page * SSD1306_W + (s.col & 0x7f);
    s.ram[idx] = byte & 0xff;
    s.col = (s.col + 1) & 0x7f;
  }
  s.dirty++;
}

/**
 * Process one I2C transmission to the SSD1306. The Wire/Adafruit driver
 * always sends a control byte first (0x00=commands, 0x40=data) followed
 * by the payload bytes. With the Co bit set (high bit of control byte),
 * each subsequent byte alternates control/payload.
 */
export function ssd1306HandleI2cWrite(s: Ssd1306State, payload: number[]) {
  if (payload.length === 0) return;
  let i = 0;
  // Most libraries use one control byte for the whole transmission.
  let ctrl = payload[i++] & 0xff;
  let isData = (ctrl & 0x40) !== 0;
  let coBit = (ctrl & 0x80) !== 0;
  while (i < payload.length) {
    const b = payload[i++] & 0xff;
    if (isData) {
      writeData(s, b);
    } else {
      if (s.pendingCmdArgs > 0) {
        s.cmdArgs.push(b);
        s.pendingCmdArgs--;
        if (s.pendingCmdArgs === 0) {
          applyCommand(s, s.pendingCmd, s.cmdArgs);
          s.cmdArgs = [];
          s.pendingCmd = 0;
        }
      } else {
        const need = argsForCmd(b);
        if (need === 0) applyCommand(s, b, []);
        else { s.pendingCmd = b; s.pendingCmdArgs = need; s.cmdArgs = []; }
      }
    }
    // If Co was set, the next byte is another control byte.
    if (coBit && i < payload.length) {
      ctrl = payload[i++] & 0xff;
      isData = (ctrl & 0x40) !== 0;
      coBit = (ctrl & 0x80) !== 0;
    }
  }
}

/** Reads from the SSD1306 are rarely meaningful in real sketches; return 0xFF. */
export function ssd1306HandleI2cRead(_s: Ssd1306State, n: number): number[] {
  return new Array(n).fill(0xff);
}

/** Pack the GDDRAM into a flat 128×64 bitmap (one byte per pixel: 0 or 1)
 *  applying inversion / entire-on / display-off rules. */
export function ssd1306Render(s: Ssd1306State): Uint8Array {
  const out = new Uint8Array(SSD1306_W * SSD1306_H);
  if (!s.on) return out; // panel off — all black
  for (let p = 0; p < SSD1306_PAGES; p++) {
    for (let x = 0; x < SSD1306_W; x++) {
      const byte = s.ram[p * SSD1306_W + x];
      for (let bit = 0; bit < 8; bit++) {
        const y = p * 8 + bit;
        let on = (byte >> bit) & 1;
        if (s.allOn) on = 1;
        if (s.invert) on = on ? 0 : 1;
        out[y * SSD1306_W + x] = on as 0 | 1;
      }
    }
  }
  return out;
}
