// Lightweight connectivity model: walk wires (treating components as nodes) to figure out
// which board pin each component pin is attached to, and what board pin a component's "input" pin
// receives. Simpler than a full SPICE graph but enough for the V1 MVP.

import type { CircuitComponent, Wire } from "./types";
import { COMPONENT_DEFS } from "./components";
import { findUnoPin } from "./uno-pins";

export interface NetGraph {
  /** for a given (componentId,pinId), which board pin number (or "GND"/"5V"/"3V3"/null) it connects to */
  netForCompPin: Map<string, string | null>;
  /** Reverse lookup: net root → list of (boardCompId, pin, label) endpoints
   *  so we can detect when multiple boards share a net and drive one board's
   *  input from another's output (e.g. master.D5 wired to slave.D7). */
  netToBoardPins?: Map<string, { boardCompId: string; pin: number; label: string }[]>;
}

const key = (cid: string, pid: string) => `${cid}::${pid}`;

export function buildNetGraph(components: CircuitComponent[], wires: Wire[]): NetGraph {
  // Union-find over (compId,pinId) and ("board", pinId)
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const r = find(p);
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  // Resistors are essentially wires for this MVP — short their pins together.
  for (const c of components) {
    if (c.kind === "resistor") {
      union(key(c.id, "1"), key(c.id, "2"));
    }
  }
  // Buttons: short A and B pins when pressed
  for (const c of components) {
    if (c.kind === "button" && c.props.pressed) {
      union(key(c.id, "A"), key(c.id, "B"));
    }
  }
  // Potentiometers act as voltage dividers: term1 - wiper - term2.
  // For MVP we just connect the wiper to whichever terminal we want (handled by analog read logic, not net-graph).

  // Wires
  for (const w of wires) {
    union(key(w.from.componentId, w.from.pinId), key(w.to.componentId, w.to.pinId));
  }

  // Build map: for each comp pin, find its net root, and check which board node label is in that net.
  const rootToBoardLabel = new Map<string, string>();
  // Set of component IDs that are themselves boards.
  const boardComps = new Set<string>();
  for (const c of components) {
    if (c.kind === "board") boardComps.add(c.id);
  }
  for (const w of wires) {
    for (const ep of [w.from, w.to]) {
      // Legacy primary board pseudo-id "board" stays valid.
      const isBoardEndpoint = ep.componentId === "board" || boardComps.has(ep.componentId);
      if (isBoardEndpoint) {
        const r = find(key(ep.componentId, ep.pinId));
        // Resolve board pin into a canonical label
        const bp = findUnoPin(ep.pinId);
        const label = bp ? bp.id : ep.pinId;
        rootToBoardLabel.set(r, label);
      }
    }
  }
  // Battery pins also seed canonical labels so loads can find their voltage
  // without needing an Arduino board in the circuit.
  for (const c of components) {
    if (c.kind !== "battery") continue;
    for (const pid of ["+", "-"] as const) {
      const r = find(key(c.id, pid));
      const cells = Math.max(1, Math.min(8, Number(c.props.cells ?? 1) || 1));
      const rawV = c.props.voltage;
      const v = rawV === undefined || rawV === "" ? cells * 3.7 : Number(rawV);
      const volts = Number.isFinite(v) ? v : cells * 3.7;
      const label = pid === "+" ? `BAT+:${c.id}:${volts}` : `BAT-:${c.id}`;
      // Only set if not already a board label (board wins).
      if (!rootToBoardLabel.has(r)) rootToBoardLabel.set(r, label);
    }
  }

  const out = new Map<string, string | null>();
  for (const c of components) {
    if (c.kind === "board") continue; // boards aren't components in the COMPONENT_DEFS sense
    const def = COMPONENT_DEFS[c.kind];
    for (const p of def.pins) {
      const k = key(c.id, p.id);
      const r = find(k);
      out.set(k, rootToBoardLabel.get(r) ?? null);
    }
  }

  // Build net root → board-pin list so callers can propagate one board's
  // output to another board's input on the same wire.
  const netToBoardPins = new Map<string, { boardCompId: string; pin: number; label: string }[]>();
  for (const c of components) {
    if (c.kind !== "board") continue;
    for (const w of wires) {
      for (const ep of [w.from, w.to]) {
        if (ep.componentId !== c.id) continue;
        const r = find(key(ep.componentId, ep.pinId));
        const bp = findUnoPin(ep.pinId);
        const pinNum = bp?.number;
        if (pinNum === undefined) continue;
        const list = netToBoardPins.get(r) ?? [];
        if (!list.some((e) => e.boardCompId === c.id && e.pin === pinNum)) {
          list.push({ boardCompId: c.id, pin: pinNum, label: bp.id });
        }
        netToBoardPins.set(r, list);
      }
    }
  }

  return { netForCompPin: out, netToBoardPins };
}

export function isLedPowered(
  comp: CircuitComponent,
  net: NetGraph,
  pinStates: Record<number, { mode: string; digital: 0 | 1; analog: number }>,
): boolean {
  if (comp.kind !== "led") return false;
  if (comp.props?.burned) return false;
  const a = net.netForCompPin.get(key(comp.id, "A"));
  const k = net.netForCompPin.get(key(comp.id, "K"));
  if (!a || !k) return false;
  const mode = String(comp.props?.mode ?? "auto"); // "auto" | "power" | "gpio"
  const isGround = (label: string) =>
    label === "GND" || label === "GND1" || label === "GND2" || label === "GND_TOP";
  const isRail = (label: string) =>
    label === "5V" || label === "3V3" || label === "VIN";
  const isGpioHigh = (label: string): boolean => {
    if (label.startsWith("D")) {
      const n = Number(label.slice(1));
      return pinStates[n]?.digital === 1;
    }
    if (label.startsWith("A")) {
      const n = Number(label.slice(1)) + 14;
      return pinStates[n]?.digital === 1;
    }
    return false;
  };
  const labelToHigh = (label: string): boolean => {
    if (mode === "power") return isRail(label);
    if (mode === "gpio") return isGpioHigh(label);
    return isRail(label) || isGpioHigh(label);
  };
  const aHigh = labelToHigh(a), kHigh = labelToHigh(k);
  const aGnd = isGround(a), kGnd = isGround(k);
  return (aHigh && kGnd) || (kHigh && aGnd);
}

/**
 * Burn check: LED is being driven from a high-voltage rail (5V/VIN) directly to
 * GND with NO current-limiting resistor in series. With a resistor anywhere in
 * the path the union-find groups its pins into the LED's net, so the heuristic
 * is "powered from rail, terminates at GND, and no resistor pin shares either
 * the anode or cathode net root". 3V3 is treated as safe (marginal in reality
 * but generally non-destructive for typical LEDs).
 */
export function isLedBurning(
  comp: CircuitComponent,
  components: CircuitComponent[],
  net: NetGraph,
): boolean {
  if (comp.kind !== "led") return false;
  if (comp.props?.burned) return true;
  const a = net.netForCompPin.get(key(comp.id, "A"));
  const k = net.netForCompPin.get(key(comp.id, "K"));
  if (!a || !k) return false;
  const isGround = (l: string) => l === "GND" || l === "GND1" || l === "GND2" || l === "GND_TOP";
  const isHotRail = (l: string) => l === "5V" || l === "VIN";
  const aHot = isHotRail(a), kHot = isHotRail(k);
  const aGnd = isGround(a), kGnd = isGround(k);
  const polarized = (aHot && kGnd) || (kHot && aGnd);
  if (!polarized) return false;
  // Look for any resistor whose pin lands on the same net label as A or K.
  for (const c of components) {
    if (c.kind !== "resistor") continue;
    const r1 = net.netForCompPin.get(key(c.id, "1"));
    const r2 = net.netForCompPin.get(key(c.id, "2"));
    if (r1 === a || r1 === k || r2 === a || r2 === k) return false;
  }
  return true;
}

/**
 * Compute approximate voltage applied across (+,−) pins of a 2-terminal load.
 * Recognises board rails (5V, 3V3, VIN, GND) and Battery components
 * (each cell = 3.7V). Returns 0 when not connected to a complete loop.
 * Direction: positive value means + pin is higher than − pin; if reversed
 * we still return the magnitude — caller checks direction separately.
 */
export function computeLoadVoltage(
  comp: CircuitComponent,
  net: NetGraph,
  plusPin: string,
  minusPin: string,
): { volts: number; reversed: boolean } {
  const pLabel = net.netForCompPin.get(key(comp.id, plusPin)) ?? null;
  const mLabel = net.netForCompPin.get(key(comp.id, minusPin)) ?? null;
  if (!pLabel || !mLabel) return { volts: 0, reversed: false };

  const labelVolts = (l: string): { v: number; pos: boolean } | null => {
    if (l === "GND" || l === "GND1" || l === "GND2" || l === "GND_TOP") return { v: 0, pos: false };
    if (l === "5V" || l === "VIN") return { v: 5, pos: true };
    if (l === "3V3") return { v: 3.3, pos: true };
    if (l.startsWith("BAT+:")) {
      const v = Number(l.split(":")[2] ?? "3.7") || 3.7;
      return { v, pos: true };
    }
    if (l.startsWith("BAT-:")) return { v: 0, pos: false };
    return null;
  };

  const p = labelVolts(pLabel);
  const m = labelVolts(mLabel);
  if (!p || !m) return { volts: 0, reversed: false };
  // Need a positive on one side and ground on the other.
  if (p.pos && !m.pos) return { volts: p.v - m.v, reversed: false };
  if (!p.pos && m.pos) return { volts: m.v - p.v, reversed: true };
  return { volts: 0, reversed: false };
}

/**
 * For each board input pin, evaluate what the connected components write to it
 * (e.g. potentiometer wiper, button + pullup).
 * Returns a map of board pin number -> { digital?, analog? } overrides for this tick.
 */
export function evaluateInputs(
  components: CircuitComponent[],
  net: NetGraph,
  pinStates: Record<number, { mode: string; digital: 0 | 1; analog: number }>,
): Record<number, { digital?: 0 | 1; analog?: number }> {
  const out: Record<number, { digital?: 0 | 1; analog?: number }> = {};

  const labelToPinNum = (label: string): number | null => {
    if (label.startsWith("D")) return Number(label.slice(1));
    if (label.startsWith("A")) return 14 + Number(label.slice(1));
    return null;
  };
  const isGroundLabel = (l: string | null) =>
    !!l && (l === "GND" || l === "GND1" || l === "GND2" || l === "GND_TOP");
  const isHighLabel = (l: string | null) =>
    !!l && (l === "5V" || l === "3V3" || l === "VIN");

  for (const c of components) {
    if (c.kind === "potentiometer") {
      const w = net.netForCompPin.get(key(c.id, "W"));
      if (!w) continue;
      const pinNum = labelToPinNum(w);
      if (pinNum === null) continue;
      const value = Number(c.props.value ?? 512);
      out[pinNum] = { analog: value, digital: value > 511 ? 1 : 0 };
    }
    if (c.kind === "button") {
      // While pressed, button connects A and B nets. If either side is GND and the other goes to a board input pin,
      // that pin reads LOW. Otherwise (with INPUT_PULLUP), pin reads HIGH.
      const a = net.netForCompPin.get(key(c.id, "A")) ?? null;
      const b = net.netForCompPin.get(key(c.id, "B")) ?? null;
      const sides: (string | null)[] = [a, b];
      for (let i = 0; i < 2; i++) {
        const me = sides[i];
        const other = sides[1 - i];
        if (!me) continue;
        const pinNum = labelToPinNum(me);
        if (pinNum === null) continue;
        const state = pinStates[pinNum];
        if (state?.mode !== "INPUT" && state?.mode !== "INPUT_PULLUP") continue;
        if (c.props.pressed && isGroundLabel(other)) {
          out[pinNum] = { digital: 0, analog: 0 };
        } else if (c.props.pressed && isHighLabel(other)) {
          out[pinNum] = { digital: 1, analog: 1023 };
        } else if (!c.props.pressed && state.mode === "INPUT_PULLUP") {
          out[pinNum] = { digital: 1, analog: 1023 };
        }
      }
    }
    if (c.kind === "custom") {
      // Sensor sliders / toggles: any prop named "pin_<pinId>_value" drives the
      // board pin connected to that custom pin. Lets users move "axes" of an
      // MPU6050, dial in LDR brightness, etc., without physically moving the part.
      for (const k of Object.keys(c.props)) {
        const m = /^pin_(.+)_value$/.exec(k);
        if (!m) continue;
        const pinId = m[1];
        const netLabel = net.netForCompPin.get(key(c.id, pinId));
        if (!netLabel) continue;
        const pinNum = labelToPinNum(netLabel);
        if (pinNum === null) continue;
        const raw = c.props[k];
        if (typeof raw === "boolean") {
          out[pinNum] = { digital: raw ? 1 : 0, analog: raw ? 1023 : 0 };
        } else if (typeof raw === "number") {
          const v = Math.max(0, Math.min(1023, Math.round(raw)));
          out[pinNum] = { analog: v, digital: v > 511 ? 1 : 0 };
        }
      }
    }
  }
  return out;
}
