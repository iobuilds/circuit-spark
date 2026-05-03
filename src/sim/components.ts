import type { ComponentDef, ComponentKind } from "./types";

// Pin coordinates are in component-local SVG units.
export const COMPONENT_DEFS: Record<ComponentKind, ComponentDef> = {
  led: {
    kind: "led",
    label: "LED",
    category: "Basic",
    width: 60,
    height: 80,
    pins: [
      { id: "A", label: "Anode (+)", x: 20, y: 78 },
      { id: "K", label: "Cathode (-)", x: 40, y: 78 },
    ],
    available: true,
    color: "red",
  },
  "rgb-led": {
    kind: "rgb-led", label: "RGB LED", category: "Basic", width: 80, height: 90,
    pins: [
      { id: "R", label: "Red", x: 16, y: 88 },
      { id: "GND", label: "GND", x: 32, y: 88 },
      { id: "G", label: "Green", x: 48, y: 88 },
      { id: "B", label: "Blue", x: 64, y: 88 },
    ], available: false,
  },
  resistor: {
    kind: "resistor", label: "Resistor", category: "Basic", width: 100, height: 56,
    pins: [
      { id: "1", label: "Pin 1", x: 4, y: 15 },
      { id: "2", label: "Pin 2", x: 96, y: 15 },
    ], available: true,
  },
  button: {
    kind: "button", label: "Push Button", category: "Basic", width: 70, height: 70,
    pins: [
      { id: "A", label: "Pin A", x: 8, y: 35 },
      { id: "B", label: "Pin B", x: 62, y: 35 },
    ], available: false,
  },
  potentiometer: {
    kind: "potentiometer", label: "Potentiometer", category: "Basic", width: 90, height: 90,
    pins: [
      { id: "1", label: "Term 1", x: 15, y: 84 },
      { id: "W", label: "Wiper", x: 45, y: 84 },
      { id: "2", label: "Term 2", x: 75, y: 84 },
    ], available: false,
  },
  buzzer: {
    kind: "buzzer", label: "Buzzer", category: "Basic", width: 70, height: 70,
    pins: [
      { id: "+", label: "+", x: 22, y: 68 },
      { id: "-", label: "GND", x: 48, y: 68 },
    ], available: false,
  },
  "switch": {
    kind: "switch", label: "Slide Switch", category: "Basic", width: 80, height: 50,
    pins: [
      { id: "1", label: "1", x: 12, y: 48 },
      { id: "C", label: "Common", x: 40, y: 48 },
      { id: "2", label: "2", x: 68, y: 48 },
    ], available: false,
  },
  lcd1602: {
    kind: "lcd1602", label: "LCD 16x2", category: "Displays", width: 220, height: 90,
    pins: [
      { id: "GND", label: "GND", x: 20, y: 88 },
      { id: "VCC", label: "VCC", x: 50, y: 88 },
      { id: "SDA", label: "SDA", x: 80, y: 88 },
      { id: "SCL", label: "SCL", x: 110, y: 88 },
    ], available: false,
  },
  oled: {
    kind: "oled", label: "OLED 128x64", category: "Displays", width: 140, height: 100,
    pins: [
      { id: "GND", label: "GND", x: 30, y: 98 },
      { id: "VCC", label: "VCC", x: 55, y: 98 },
      { id: "SCL", label: "SCL", x: 80, y: 98 },
      { id: "SDA", label: "SDA", x: 105, y: 98 },
    ], available: false,
  },
  "7seg": {
    kind: "7seg", label: "7-Segment", category: "Displays", width: 90, height: 120,
    pins: [
      { id: "a", label: "a", x: 12, y: 118 }, { id: "b", label: "b", x: 24, y: 118 },
      { id: "c", label: "c", x: 36, y: 118 }, { id: "d", label: "d", x: 48, y: 118 },
      { id: "e", label: "e", x: 60, y: 118 }, { id: "f", label: "f", x: 72, y: 118 },
      { id: "g", label: "g", x: 84, y: 118 }, { id: "GND", label: "GND", x: 6, y: 118 },
    ], available: false,
  },
  servo: {
    kind: "servo", label: "Servo", category: "Actuators", width: 90, height: 80,
    pins: [
      { id: "GND", label: "GND", x: 22, y: 78 },
      { id: "VCC", label: "VCC", x: 45, y: 78 },
      { id: "SIG", label: "Signal", x: 68, y: 78 },
    ], available: false,
  },
  relay: {
    kind: "relay", label: "Relay Module", category: "Actuators", width: 100, height: 80,
    pins: [
      { id: "VCC", label: "VCC", x: 14, y: 78 },
      { id: "GND", label: "GND", x: 36, y: 78 },
      { id: "IN",  label: "IN",  x: 58, y: 78 },
    ], available: false,
  },
  dht11: {
    kind: "dht11", label: "DHT11", category: "Sensors", width: 80, height: 100,
    pins: [
      { id: "VCC",  label: "VCC",  x: 16, y: 98 },
      { id: "DATA", label: "DATA", x: 40, y: 98 },
      { id: "GND",  label: "GND",  x: 64, y: 98 },
    ], available: false,
  },
  ultrasonic: {
    kind: "ultrasonic", label: "HC-SR04", category: "Sensors", width: 140, height: 70,
    pins: [
      { id: "VCC",  label: "VCC",  x: 24, y: 68 },
      { id: "TRIG", label: "TRIG", x: 56, y: 68 },
      { id: "ECHO", label: "ECHO", x: 84, y: 68 },
      { id: "GND",  label: "GND",  x: 116, y: 68 },
    ], available: false,
  },
  pir: {
    kind: "pir", label: "PIR Sensor", category: "Sensors", width: 90, height: 90,
    pins: [
      { id: "VCC", label: "VCC", x: 18, y: 88 },
      { id: "OUT", label: "OUT", x: 45, y: 88 },
      { id: "GND", label: "GND", x: 72, y: 88 },
    ], available: false,
  },
  ldr: {
    kind: "ldr", label: "Photoresistor", category: "Sensors", width: 60, height: 80,
    pins: [
      { id: "1", label: "Pin 1", x: 14, y: 78 },
      { id: "2", label: "Pin 2", x: 46, y: 78 },
    ], available: false,
  },
  battery: {
    kind: "battery", label: "9V Battery", category: "Power", width: 80, height: 100,
    pins: [
      { id: "+", label: "+", x: 24, y: 98 },
      { id: "-", label: "-", x: 56, y: 98 },
    ], available: false,
  },
  // Generic placeholder for admin-defined custom components. Real visuals come
  // from the admin entry's SVG and pins (resolved at render time).
  custom: {
    kind: "custom", label: "Custom", category: "Basic", width: 80, height: 60,
    pins: [], available: false,
  },
  // Board placeholder. Pins are resolved dynamically from the boardId stored
  // in component props (Uno uses uno-pins, others use generic header pins).
  board: {
    kind: "board", label: "Board", category: "Basic", width: 360, height: 240,
    pins: [], available: false,
  },
};
