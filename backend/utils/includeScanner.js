// Scans .ino/.cpp/.h sources for `#include <Lib.h>` directives and maps the
// header name to its Arduino Library Manager package name. Headers that ship
// with a core (Arduino.h, Wire.h, SPI.h, EEPROM.h, SoftwareSerial.h, …) are
// excluded so we don't try to install them.
const fs = require('fs');
const path = require('path');

const BUILTIN_HEADERS = new Set([
  'Arduino.h', 'Wire.h', 'SPI.h', 'EEPROM.h', 'SoftwareSerial.h',
  'HardwareSerial.h', 'Print.h', 'Stream.h',
  'avr/io.h', 'avr/interrupt.h', 'avr/pgmspace.h', 'avr/sleep.h', 'avr/wdt.h',
  'util/delay.h', 'util/atomic.h',
  'string.h', 'stdio.h', 'stdlib.h', 'math.h', 'stdint.h', 'stddef.h',
  'WiFi.h', 'WiFiClient.h', 'WiFiServer.h', // ESP cores
  'Esp.h', 'FS.h', 'LittleFS.h', 'SD.h',
]);

// Note: Servo IS distributed via Library Manager as "Servo" — keep it OUT of
// builtins so we install it on demand.

// header (case-insensitive) → Library Manager package name
const HEADER_TO_LIBRARY = {
  'servo.h': 'Servo',
  'adafruit_neopixel.h': 'Adafruit NeoPixel',
  'fastled.h': 'FastLED',
  'liquidcrystal.h': 'LiquidCrystal',
  'liquidcrystal_i2c.h': 'LiquidCrystal I2C',
  'dht.h': 'DHT sensor library',
  'onewire.h': 'OneWire',
  'dallastemperature.h': 'DallasTemperature',
  'adafruit_sensor.h': 'Adafruit Unified Sensor',
  'adafruit_gfx.h': 'Adafruit GFX Library',
  'adafruit_ssd1306.h': 'Adafruit SSD1306',
  'u8g2lib.h': 'U8g2',
  'u8x8lib.h': 'U8g2',
  'adafruit_bmp280.h': 'Adafruit BMP280 Library',
  'adafruit_bme280.h': 'Adafruit BME280 Library',
  'mfrc522.h': 'MFRC522',
  'irremote.h': 'IRremote',
  'rtclib.h': 'RTClib',
  'ds3231.h': 'DS3231',
  'pubsubclient.h': 'PubSubClient',
  'arduinojson.h': 'ArduinoJson',
  'tinygps.h': 'TinyGPS',
  'tinygpsplus.h': 'TinyGPSPlus',
  'stepper.h': 'Stepper',
  'accelstepper.h': 'AccelStepper',
  'encoder.h': 'Encoder',
  'keypad.h': 'Keypad',
  'tone.h': 'Tone',
  'ultrasonic.h': 'Ultrasonic',
  'newping.h': 'NewPing',
  'sd.h': 'SD',
};

const LIBRARY_ALIASES = {
  'adafruit-ssd1306': 'Adafruit SSD1306',
  'adafruit-gfx': 'Adafruit GFX Library',
  'adafruit-busio': 'Adafruit BusIO',
  'u8g2': 'U8g2',
};

const INDEX_FILE = path.join(process.env.HOME || '/root', '.arduino15', 'library_index.json');
let indexCache = null;

function compact(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function compareSemver(a, b) {
  const pa = String(a || '').split(/[.\-+]/).map((p) => parseInt(p, 10));
  const pb = String(b || '').split(/[.\-+]/).map((p) => parseInt(p, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const av = Number.isFinite(pa[i]) ? pa[i] : 0;
    const bv = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function loadLibraryIndexMaps() {
  try {
    const st = fs.statSync(INDEX_FILE);
    if (indexCache && indexCache.mtimeMs === st.mtimeMs && indexCache.size === st.size) return indexCache;

    const raw = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
    const byHeader = new Map();
    const byName = new Map();
    const latest = new Map();

    for (const lib of raw.libraries || []) {
      if (!lib?.name) continue;
      const key = compact(lib.name);
      const prev = latest.get(key);
      if (!prev || compareSemver(lib.version, prev.version) > 0) latest.set(key, lib);
    }

    for (const lib of latest.values()) {
      byName.set(compact(lib.name), lib.name);
      for (const h of lib.providesIncludes || []) byHeader.set(String(h).toLowerCase(), lib.name);
    }

    indexCache = { mtimeMs: st.mtimeMs, size: st.size, byHeader, byName };
    return indexCache;
  } catch (_) {
    return { byHeader: new Map(), byName: new Map() };
  }
}

function extractIncludes(source) {
  // strip block + line comments first to avoid false hits
  const clean = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  const re = /^\s*#\s*include\s*[<"]([^>"]+)[>"]/gm;
  const out = new Set();
  let m;
  while ((m = re.exec(clean)) !== null) out.add(m[1].trim());
  return [...out];
}

/**
 * @param {{name:string, content:string}[]} files
 * @returns {string[]} library package names that should be installed
 */
function detectRequiredLibraries(files) {
  const needed = new Set();
  const indexMaps = loadLibraryIndexMaps();
  for (const f of files || []) {
    if (!/\.(ino|cpp|c|h|hpp)$/i.test(f.name)) continue;
    for (const header of extractIncludes(f.content || '')) {
      if (BUILTIN_HEADERS.has(header)) continue;
      const key = header.toLowerCase();
      const lib = HEADER_TO_LIBRARY[key] || indexMaps.byHeader.get(key);
      if (lib) needed.add(lib);
    }
  }
  return [...needed];
}

function resolveLibraryNames(libraries) {
  const indexMaps = loadLibraryIndexMaps();
  const out = new Set();
  for (const raw of libraries || []) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const [base, version] = name.split('@');
    const canonical = LIBRARY_ALIASES[base.toLowerCase()] || indexMaps.byName.get(compact(base)) || base;
    out.add(version ? `${canonical}@${version}` : canonical);
  }
  return [...out];
}

function resolveHeadersToLibraries(headers) {
  const indexMaps = loadLibraryIndexMaps();
  const out = new Set();
  for (const raw of headers || []) {
    const header = String(raw || '').trim();
    if (!header || BUILTIN_HEADERS.has(header)) continue;
    const key = header.toLowerCase();
    const lib = HEADER_TO_LIBRARY[key] || indexMaps.byHeader.get(key);
    if (lib) out.add(lib);
  }
  return [...out];
}

function missingHeadersFromCompilerOutput(output) {
  const out = new Set();
  const re = /fatal error:\s*([^:\s]+\.h(?:pp)?):\s*No such file or directory/gi;
  let m;
  while ((m = re.exec(String(output || ''))) !== null) out.add(m[1].trim());
  return [...out];
}

module.exports = {
  detectRequiredLibraries,
  extractIncludes,
  resolveLibraryNames,
  resolveHeadersToLibraries,
  missingHeadersFromCompilerOutput,
  HEADER_TO_LIBRARY,
};
