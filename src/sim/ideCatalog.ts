// Curated catalogs for Board Manager and Library Manager.
// Mock metadata — installation is local-only (localStorage).

export interface BoardPackage {
  id: string;            // FQBN-ish e.g. "arduino:avr"
  name: string;
  author: string;
  version: string;
  description: string;
  size: string;          // human readable
  boards: string[];      // friendly board names
  /** Map to internal sim BoardId when available. */
  simBoardIds?: string[];
  installedByDefault?: boolean;
}

export const BOARD_PACKAGES: BoardPackage[] = [
  {
    id: "arduino:avr",
    name: "Arduino AVR Boards",
    author: "Arduino",
    version: "1.8.6",
    description: "Boards built around AVR microcontrollers — Uno, Mega, Nano, Mini, Leonardo, Pro.",
    size: "32 MB",
    boards: ["Uno", "Mega 2560", "Nano", "Mini", "Leonardo", "Pro / Pro Mini"],
    simBoardIds: ["uno", "mega", "nano"],
    installedByDefault: true,
  },
  {
    id: "esp32:esp32",
    name: "ESP32 by Espressif Systems",
    author: "Espressif Systems",
    version: "2.0.14",
    description: "Wi-Fi + Bluetooth dual-core MCU. Supports ESP32, ESP32-S2, ESP32-S3, ESP32-C3.",
    size: "180 MB",
    boards: ["ESP32 DevKit", "ESP32-S3", "NodeMCU-32S", "TTGO T-Display"],
    simBoardIds: ["esp32"],
  },
  {
    id: "esp8266:esp8266",
    name: "ESP8266 by ESP8266 Community",
    author: "ESP8266 Community",
    version: "3.1.2",
    description: "Wi-Fi enabled MCU. NodeMCU, Wemos D1 Mini, Adafruit Feather HUZZAH.",
    size: "120 MB",
    boards: ["NodeMCU 1.0", "Wemos D1 Mini", "Generic ESP8266"],
  },
  {
    id: "rp2040:rp2040",
    name: "Raspberry Pi Pico/RP2040 by Earle Philhower",
    author: "Earle F. Philhower III",
    version: "3.9.0",
    description: "Dual-core ARM Cortex-M0+ at 133 MHz. Pi Pico, Pico W, RP2040 boards.",
    size: "150 MB",
    boards: ["Raspberry Pi Pico", "Pico W", "Adafruit Feather RP2040"],
  },
  {
    id: "STMicroelectronics:stm32",
    name: "STM32 by STMicroelectronics",
    author: "STMicroelectronics",
    version: "2.6.0",
    description: "Official ST Cortex-M cores: F1/F4/F7/H7/L0/L4 series. Includes Blue Pill.",
    size: "210 MB",
    boards: ["Blue Pill (F103C8)", "Nucleo-F411", "Nucleo-F767ZI"],
  },
];

export interface LibraryPackage {
  id: string;
  name: string;
  author: string;
  version: string;
  description: string;
  topic: LibraryTopic;
  type: "Recommended" | "Contributed" | "Partner" | "Retired";
  stars: number;
  headers: string[];      // e.g. ["DHT.h"]
  installedByDefault?: boolean;
}

export type LibraryTopic =
  | "Communication"
  | "Display"
  | "Sensors"
  | "Timing"
  | "Signal Input/Output"
  | "Data Processing"
  | "Data Storage"
  | "Device Control"
  | "Other";

export const LIBRARY_TOPICS: LibraryTopic[] = [
  "Communication",
  "Display",
  "Sensors",
  "Timing",
  "Signal Input/Output",
  "Data Processing",
  "Data Storage",
  "Device Control",
  "Other",
];

export const LIBRARY_PACKAGES: LibraryPackage[] = [
  // Sensors
  { id: "dht-sensor-library", name: "DHT sensor library", author: "Adafruit", version: "1.4.6", description: "DHT11/DHT22/AM2302 temperature & humidity sensors.", topic: "Sensors", type: "Recommended", stars: 1843, headers: ["DHT.h"] },
  { id: "adafruit-bmp280", name: "Adafruit BMP280 Library", author: "Adafruit", version: "2.6.8", description: "Bosch BMP280 barometric pressure / temperature sensor.", topic: "Sensors", type: "Recommended", stars: 412, headers: ["Adafruit_BMP280.h"] },
  { id: "adafruit-mpu6050", name: "Adafruit MPU6050", author: "Adafruit", version: "2.2.6", description: "6-axis accelerometer + gyroscope.", topic: "Sensors", type: "Recommended", stars: 287, headers: ["Adafruit_MPU6050.h"] },
  { id: "onewire", name: "OneWire", author: "Paul Stoffregen", version: "2.3.7", description: "Maxim/Dallas 1-Wire bus protocol.", topic: "Communication", type: "Recommended", stars: 980, headers: ["OneWire.h"] },
  { id: "dallastemperature", name: "DallasTemperature", author: "Miles Burton", version: "3.11.0", description: "Dallas/Maxim DS18B20 1-Wire temperature sensors.", topic: "Sensors", type: "Recommended", stars: 661, headers: ["DallasTemperature.h"] },
  { id: "tinygps-plus", name: "TinyGPS++", author: "Mikal Hart", version: "1.0.3", description: "Parse NMEA data from GPS modules.", topic: "Communication", type: "Contributed", stars: 743, headers: ["TinyGPS++.h"] },
  { id: "vl53l0x", name: "VL53L0X", author: "Pololu", version: "1.3.1", description: "ST VL53L0X time-of-flight distance sensor.", topic: "Sensors", type: "Contributed", stars: 198, headers: ["VL53L0X.h"] },
  { id: "adafruit-bno055", name: "Adafruit BNO055", author: "Adafruit", version: "1.6.3", description: "Bosch BNO055 9-DOF absolute orientation IMU sensor.", topic: "Sensors", type: "Recommended", stars: 421, headers: ["Adafruit_BNO055.h"] },
  { id: "bno055-bosch", name: "BNO055", author: "Robert Bosch GmbH", version: "1.2.1", description: "Allows to use the IMU MKR Shield with the Bosch BNO055 9-axis sensor.", topic: "Sensors", type: "Partner", stars: 187, headers: ["BNO055.h", "Arduino_BNO055.h"] },
  { id: "7semi-bno08x", name: "7Semi BNO08x", author: "7Semi", version: "0.1.0", description: "Minimal BNO08x IMU SHTP driver with pluggable I2C/SPI/UART transports.", topic: "Sensors", type: "Contributed", stars: 24, headers: ["7Semi_BNO08x.h"] },
  { id: "7semi-bno055", name: "7Semi_BNO055", author: "7Semi <info@7semi.com>", version: "1.0.2", description: "Lightweight BNO055 driver (raw + minimal helpers) with optional configurable I2C pins.", topic: "Sensors", type: "Contributed", stars: 18, headers: ["7Semi_BNO055.h"] },
  { id: "sparkfun-bno080", name: "SparkFun BNO080 Cortex Based IMU", author: "SparkFun Electronics", version: "1.1.12", description: "Library for the BNO080 9-DOF orientation IMU.", topic: "Sensors", type: "Contributed", stars: 156, headers: ["SparkFun_BNO080_Arduino_Library.h"] },
  { id: "adafruit-bme280", name: "Adafruit BME280 Library", author: "Adafruit", version: "2.2.4", description: "Bosch BME280 humidity, temperature & pressure sensor.", topic: "Sensors", type: "Recommended", stars: 612, headers: ["Adafruit_BME280.h"] },
  { id: "adafruit-bmp085", name: "Adafruit BMP085 Library", author: "Adafruit", version: "1.2.4", description: "Bosch BMP085 / BMP180 barometric pressure sensor.", topic: "Sensors", type: "Recommended", stars: 142, headers: ["Adafruit_BMP085.h"] },
  { id: "adafruit-tsl2561", name: "Adafruit TSL2561", author: "Adafruit", version: "1.1.2", description: "TSL2561 luminosity / lux sensor.", topic: "Sensors", type: "Recommended", stars: 87, headers: ["Adafruit_TSL2561_U.h"] },
  { id: "adafruit-htu21df", name: "Adafruit HTU21DF Library", author: "Adafruit", version: "1.1.2", description: "HTU21D-F humidity & temperature sensor.", topic: "Sensors", type: "Recommended", stars: 41, headers: ["Adafruit_HTU21DF.h"] },
  { id: "adafruit-unified-sensor", name: "Adafruit Unified Sensor", author: "Adafruit", version: "1.1.14", description: "Unified sensor abstraction layer used by Adafruit sensor libraries.", topic: "Sensors", type: "Recommended", stars: 512, headers: ["Adafruit_Sensor.h"] },
  { id: "mpu9250", name: "MPU9250", author: "hideakitai", version: "0.4.8", description: "InvenSense MPU9250 9-axis IMU library.", topic: "Sensors", type: "Contributed", stars: 213, headers: ["MPU9250.h"] },
  { id: "icm20948", name: "ICM20948_WE", author: "Wolfgang Ewald", version: "1.1.10", description: "TDK InvenSense ICM-20948 9-axis IMU.", topic: "Sensors", type: "Contributed", stars: 64, headers: ["ICM20948_WE.h"] },

  // Displays
  { id: "liquidcrystal", name: "LiquidCrystal", author: "Arduino, Adafruit", version: "1.0.7", description: "Standard HD44780 character LCD displays.", topic: "Display", type: "Recommended", stars: 312, headers: ["LiquidCrystal.h"], installedByDefault: true },
  { id: "liquidcrystal-i2c", name: "LiquidCrystal I2C", author: "Frank de Brabander", version: "1.1.2", description: "I2C-backpack character LCDs (PCF8574).", topic: "Display", type: "Contributed", stars: 1102, headers: ["LiquidCrystal_I2C.h"] },
  { id: "adafruit-ssd1306", name: "Adafruit SSD1306", author: "Adafruit", version: "2.5.9", description: "128x64 / 128x32 monochrome OLED displays.", topic: "Display", type: "Recommended", stars: 2243, headers: ["Adafruit_SSD1306.h"], installedByDefault: true },
  { id: "adafruit-gfx", name: "Adafruit GFX Library", author: "Adafruit", version: "1.11.9", description: "Core graphics library for Adafruit displays.", topic: "Display", type: "Recommended", stars: 1812, headers: ["Adafruit_GFX.h"], installedByDefault: true },
  { id: "adafruit-busio", name: "Adafruit BusIO", author: "Adafruit", version: "1.16.1", description: "Bus I/O abstraction (I²C / SPI) used by Adafruit drivers.", topic: "Display", type: "Recommended", stars: 412, headers: ["Adafruit_BusIO_Register.h"], installedByDefault: true },
  { id: "u8g2", name: "U8g2", author: "oliver", version: "2.35.19", description: "Monochrome graphics library for many display controllers.", topic: "Display", type: "Recommended", stars: 4567, headers: ["U8g2lib.h", "U8x8lib.h"], installedByDefault: true },
  { id: "fastled", name: "FastLED", author: "Daniel Garcia", version: "3.6.0", description: "Animation library for addressable LED strips (WS2812, APA102, etc.).", topic: "Display", type: "Recommended", stars: 6831, headers: ["FastLED.h"] },
  { id: "adafruit-neopixel", name: "Adafruit NeoPixel", author: "Adafruit", version: "1.12.0", description: "WS2812 / WS2811 / NeoPixel addressable LEDs.", topic: "Display", type: "Recommended", stars: 3001, headers: ["Adafruit_NeoPixel.h"] },

  // Communication
  { id: "wifi", name: "WiFi", author: "Arduino", version: "1.2.7", description: "Connect to Wi-Fi networks (Arduino WiFi shield / ESP).", topic: "Communication", type: "Recommended", stars: 521, headers: ["WiFi.h"] },
  { id: "wifimanager", name: "WiFiManager", author: "tzapu", version: "2.0.16", description: "ESP8266/ESP32 Wi-Fi configuration with web portal.", topic: "Communication", type: "Recommended", stars: 7912, headers: ["WiFiManager.h"] },
  { id: "pubsubclient", name: "PubSubClient", author: "Nick O'Leary", version: "2.8.0", description: "MQTT client for Arduino.", topic: "Communication", type: "Recommended", stars: 4923, headers: ["PubSubClient.h"] },
  { id: "arduinojson", name: "ArduinoJson", author: "Benoit Blanchon", version: "7.0.4", description: "Efficient JSON parser/serializer for embedded systems.", topic: "Data Processing", type: "Recommended", stars: 6512, headers: ["ArduinoJson.h"] },
  { id: "irremote", name: "IRremote", author: "shirriff, z3t0, ArminJo", version: "4.3.1", description: "Send & receive infrared signals.", topic: "Communication", type: "Recommended", stars: 3987, headers: ["IRremote.hpp", "IRremote.h"] },

  // Motors
  { id: "servo", name: "Servo", author: "Michael Margolis, Arduino", version: "1.2.1", description: "Control RC servo motors.", topic: "Device Control", type: "Recommended", stars: 421, headers: ["Servo.h"], installedByDefault: true },
  { id: "stepper", name: "Stepper", author: "Arduino", version: "1.1.3", description: "Bipolar / unipolar stepper motor control.", topic: "Device Control", type: "Recommended", stars: 184, headers: ["Stepper.h"], installedByDefault: true },
  { id: "accelstepper", name: "AccelStepper", author: "Mike McCauley", version: "1.64.0", description: "Stepper motors with acceleration/deceleration.", topic: "Device Control", type: "Recommended", stars: 712, headers: ["AccelStepper.h"] },

  // Timing
  { id: "taskscheduler", name: "TaskScheduler", author: "Anatoli Arkhipenko", version: "3.7.0", description: "Cooperative multitasking on Arduino.", topic: "Timing", type: "Contributed", stars: 1192, headers: ["TaskScheduler.h"] },
  { id: "timelib", name: "TimeLib", author: "Paul Stoffregen", version: "1.6.1", description: "Time/date functions for Arduino.", topic: "Timing", type: "Recommended", stars: 367, headers: ["TimeLib.h"] },

  // Storage
  { id: "sd", name: "SD", author: "Arduino, SparkFun", version: "1.2.4", description: "Read & write SD cards.", topic: "Data Storage", type: "Recommended", stars: 312, headers: ["SD.h"], installedByDefault: true },
  { id: "eeprom", name: "EEPROM", author: "Arduino", version: "2.0.0", description: "Read/write the on-chip EEPROM.", topic: "Data Storage", type: "Recommended", stars: 102, headers: ["EEPROM.h"], installedByDefault: true },

  // Other
  { id: "wire", name: "Wire", author: "Arduino", version: "1.0.0", description: "I²C / TWI bus.", topic: "Communication", type: "Recommended", stars: 245, headers: ["Wire.h"], installedByDefault: true },
  { id: "spi", name: "SPI", author: "Arduino", version: "1.0.0", description: "Serial Peripheral Interface bus.", topic: "Communication", type: "Recommended", stars: 178, headers: ["SPI.h"], installedByDefault: true },
];
