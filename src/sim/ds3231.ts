// DS3231 I2C real-time-clock emulation.
//
// Implements the register map from the DS3231 datasheet (addr 0x68, 0x00..0x12)
// well enough for typical Arduino sketches:
//   0x00 seconds (BCD)        0x07 alarm1 sec
//   0x01 minutes (BCD)        0x08 alarm1 min
//   0x02 hours   (BCD,24h)    0x09 alarm1 hour
//   0x03 weekday (1..7)       0x0A alarm1 day/date
//   0x04 date    (BCD,1..31)  0x0B alarm2 min
//   0x05 month   (BCD,1..12)  0x0C alarm2 hour
//   0x06 year    (BCD,0..99)  0x0D alarm2 day/date
//   0x0E control / 0x0F status / 0x10 aging / 0x11..0x12 temperature MSB/LSB
//
// The clock advances based on host-real-time (with optional offset set via
// the inspector). Reads return current values; writes update the offset so a
// sketch can set the time and immediately read it back.

export const DS3231_ADDR = 0x68;
export const DS3231_REG_COUNT = 0x13;

export interface Ds3231State {
  /** Offset (in ms) applied to Date.now() to produce the chip's current time. */
  offsetMs: number;
  /** Pointer register set by the most-recent write transaction. */
  ptr: number;
  /** Persistent registers (alarms, control, status, aging, temperature). */
  regs: Uint8Array;
  /** Simulated die temperature (°C), reported via 0x11/0x12. */
  tempC: number;
}

export function createDs3231State(): Ds3231State {
  const regs = new Uint8Array(DS3231_REG_COUNT);
  regs[0x0E] = 0x1C; // control: INTCN=1, RS2=RS1=1 (1Hz SQW disabled, alarms off)
  regs[0x0F] = 0x00; // status: OSF cleared
  regs[0x10] = 0x00; // aging
  return { offsetMs: 0, ptr: 0, regs, tempC: 25.25 };
}

const bcd = (n: number) => ((Math.floor(n / 10) << 4) | (n % 10)) & 0xff;
const fromBcd = (b: number) => ((b >> 4) & 0x0f) * 10 + (b & 0x0f);

/** Compute the live register array (clock fields + persistent regs + temp). */
export function readSnapshot(s: Ds3231State): Uint8Array {
  const out = new Uint8Array(DS3231_REG_COUNT);
  out.set(s.regs);
  const d = new Date(Date.now() + s.offsetMs);
  out[0x00] = bcd(d.getSeconds());
  out[0x01] = bcd(d.getMinutes());
  out[0x02] = bcd(d.getHours()); // 24h mode (bit6=0)
  out[0x03] = ((d.getDay() + 6) % 7) + 1; // 1..7 (Mon..Sun per typical RTC libs)
  out[0x04] = bcd(d.getDate());
  out[0x05] = bcd(d.getMonth() + 1);
  out[0x06] = bcd(d.getFullYear() % 100);
  // Temperature: 10-bit two's-complement (°C × 4) packed as MSB/LSB[7:6].
  const t = Math.round(s.tempC * 4);
  out[0x11] = (t >> 2) & 0xff;
  out[0x12] = (t & 0x03) << 6;
  return out;
}

/** Write a single byte to the chip at the current pointer, advancing it. */
function writeByte(s: Ds3231State, val: number) {
  const p = s.ptr & 0xff;
  if (p === 0x00 || p === 0x01 || p === 0x02 ||
      p === 0x03 || p === 0x04 || p === 0x05 || p === 0x06) {
    // Adjust offset: build a new Date from the incoming time/date fields
    // by reading current shadow, applying the change, then recomputing offset.
    const live = readSnapshot(s);
    live[p] = val & 0xff;
    const sec = fromBcd(live[0x00] & 0x7f);
    const min = fromBcd(live[0x01] & 0x7f);
    // 24h mode (assume bit6=0 — DS3231 default after power-on is 24h).
    const hr = fromBcd(live[0x02] & 0x3f);
    const date = fromBcd(live[0x04] & 0x3f);
    const month = fromBcd(live[0x05] & 0x1f);
    const year = 2000 + fromBcd(live[0x06]);
    const target = new Date(year, month - 1, date, hr, min, sec).getTime();
    s.offsetMs = target - Date.now();
  } else if (p < DS3231_REG_COUNT) {
    s.regs[p] = val & 0xff;
  }
  s.ptr = (s.ptr + 1) % DS3231_REG_COUNT;
}

/**
 * Handle a master I2C transmission addressed to the DS3231.
 *  - 1 byte payload = pointer set (followed by master read).
 *  - 2+ byte payload = pointer set + register writes.
 */
export function handleI2cWrite(s: Ds3231State, payload: number[]) {
  if (payload.length === 0) return;
  s.ptr = payload[0] % DS3231_REG_COUNT;
  for (let i = 1; i < payload.length; i++) writeByte(s, payload[i]);
}

/** Master read of `n` bytes starting at the current pointer (auto-increment). */
export function handleI2cRead(s: Ds3231State, n: number): number[] {
  const live = readSnapshot(s);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(live[s.ptr] ?? 0xff);
    s.ptr = (s.ptr + 1) % DS3231_REG_COUNT;
  }
  return out;
}

export const DS3231_REG_INFO: { addr: number; name: string; desc: string }[] = [
  { addr: 0x00, name: "SECONDS", desc: "00–59 (BCD)" },
  { addr: 0x01, name: "MINUTES", desc: "00–59 (BCD)" },
  { addr: 0x02, name: "HOURS",   desc: "00–23 / 12h flag (BCD)" },
  { addr: 0x03, name: "DAY",     desc: "Day of week 1–7" },
  { addr: 0x04, name: "DATE",    desc: "01–31 (BCD)" },
  { addr: 0x05, name: "MONTH",   desc: "Month 01–12 + Century bit" },
  { addr: 0x06, name: "YEAR",    desc: "00–99 (BCD)" },
  { addr: 0x07, name: "A1_SEC",  desc: "Alarm1 seconds" },
  { addr: 0x08, name: "A1_MIN",  desc: "Alarm1 minutes" },
  { addr: 0x09, name: "A1_HOUR", desc: "Alarm1 hours" },
  { addr: 0x0A, name: "A1_DAY",  desc: "Alarm1 day/date" },
  { addr: 0x0B, name: "A2_MIN",  desc: "Alarm2 minutes" },
  { addr: 0x0C, name: "A2_HOUR", desc: "Alarm2 hours" },
  { addr: 0x0D, name: "A2_DAY",  desc: "Alarm2 day/date" },
  { addr: 0x0E, name: "CONTROL", desc: "EOSC BBSQW CONV RS2 RS1 INTCN A2IE A1IE" },
  { addr: 0x0F, name: "STATUS",  desc: "OSF — — — EN32kHz BSY A2F A1F" },
  { addr: 0x10, name: "AGING",   desc: "Aging offset (signed)" },
  { addr: 0x11, name: "TEMP_MSB",desc: "Temperature integer (°C)" },
  { addr: 0x12, name: "TEMP_LSB",desc: "Temperature fraction (0.25 °C)" },
];
