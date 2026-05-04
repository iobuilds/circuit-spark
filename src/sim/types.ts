// Domain types for the simulator.

export type BoardId =
  | "uno"
  | "mega"
  | "nano"
  | "esp32"
  | "esp8266"
  | "stm32"
  | "msp430"
  | "pico";

export interface BoardDef {
  id: BoardId;
  name: string;
  mcu: string;
  digitalPins: number;
  analogPins: number;
  available: boolean;
}

// Library wiped down to a single fully-functional Arduino Uno board (driven by
// the imported STEP→GLB top view). Other entries remain in the type union for
// backward-compat with persisted projects, but are flagged unavailable so they
// don't appear in palettes/pickers.
export const BOARDS: BoardDef[] = [
  { id: "uno", name: "Arduino Uno", mcu: "ATmega328P", digitalPins: 14, analogPins: 6, available: true },
  { id: "mega", name: "Arduino Mega 2560", mcu: "ATmega2560", digitalPins: 54, analogPins: 16, available: false },
  { id: "nano", name: "Arduino Nano", mcu: "ATmega328P", digitalPins: 14, analogPins: 8, available: false },
  { id: "esp32", name: "ESP32 DevKit", mcu: "ESP32", digitalPins: 38, analogPins: 18, available: false },
  { id: "esp8266", name: "ESP8266 NodeMCU", mcu: "ESP8266", digitalPins: 17, analogPins: 1, available: false },
  { id: "stm32", name: "STM32 Blue Pill", mcu: "STM32F103C8T6", digitalPins: 37, analogPins: 10, available: false },
  { id: "msp430", name: "MSP430 LaunchPad", mcu: "MSP430G2553", digitalPins: 16, analogPins: 8, available: false },
  { id: "pico", name: "Raspberry Pi Pico", mcu: "RP2040", digitalPins: 26, analogPins: 3, available: false },
];

export type ComponentKind =
  | "led"
  | "resistor"
  | "button"
  | "potentiometer"
  | "buzzer"
  | "lcd1602"
  | "oled"
  | "servo"
  | "dht11"
  | "ultrasonic"
  | "pir"
  | "ldr"
  | "battery"
  | "motor"
  | "rgb-led"
  | "switch"
  | "7seg"
  | "relay"
  | "ds3231"
  | "water-level"
  | "board"
  | "custom";

export interface ComponentDef {
  kind: ComponentKind;
  label: string;
  category: "Basic" | "Displays" | "Sensors" | "Actuators" | "Power" | "Comms";
  width: number;
  height: number;
  pins: { id: string; label: string; x: number; y: number }[];
  available: boolean;
  /** Visual color for LEDs */
  color?: "red" | "green" | "blue" | "yellow";
}

export interface CircuitComponent {
  id: string;
  kind: ComponentKind;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  props: Record<string, number | string | boolean>;
}

export interface BoardInstance {
  id: "board";
  boardId: BoardId;
  x: number;
  y: number;
}

export interface Wire {
  id: string;
  from: { componentId: string; pinId: string };
  to: { componentId: string; pinId: string };
  /** Optional intermediate waypoints in canvas (SVG) coordinates. */
  waypoints?: { x: number; y: number }[];
  /** Custom CSS color (any valid CSS color or oklch token). Defaults to --color-wire. */
  color?: string;
  /** Stroke width in px. Defaults to 2.2. */
  thickness?: number;
}

export interface SerialLine {
  ts: number;
  text: string;
  kind: "out" | "in" | "sys";
}

export type PinMode = "INPUT" | "OUTPUT" | "INPUT_PULLUP";

export interface PinState {
  mode: PinMode;
  digital: 0 | 1;
  /** 0..255 PWM, or analogRead value 0..1023 written by host (for analog pins) */
  analog: number;
}

export type SimStatus = "idle" | "running" | "paused" | "error";
