// Scans .ino/.cpp/.h sources for `#include <Lib.h>` directives and maps the
// header name to its Arduino Library Manager package name. Headers that ship
// with a core (Arduino.h, Wire.h, SPI.h, EEPROM.h, SoftwareSerial.h, …) are
// excluded so we don't try to install them.

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
  for (const f of files || []) {
    if (!/\.(ino|cpp|c|h|hpp)$/i.test(f.name)) continue;
    for (const header of extractIncludes(f.content || '')) {
      if (BUILTIN_HEADERS.has(header)) continue;
      const key = header.toLowerCase();
      const lib = HEADER_TO_LIBRARY[key];
      if (lib) needed.add(lib);
    }
  }
  return [...needed];
}

module.exports = { detectRequiredLibraries, extractIncludes, HEADER_TO_LIBRARY };
