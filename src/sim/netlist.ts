// Lightweight connectivity model: walk wires (treating components as nodes) to figure out
// which board pin each component pin is attached to, and what board pin a component's "input" pin
// receives. Simpler than a full SPICE graph but enough for the V1 MVP.

import type { CircuitComponent, Wire } from "./types";
import { COMPONENT_DEFS } from "./components";
import { findUnoPin } from "./uno-pins";

export interface NetGraph {
  /** for a given (componentId,pinId), which board pin number (or "GND"/"5V"/"3V3"/null) it connects to */
  netForCompPin: Map<string, string | null>;
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

  return { netForCompPin: out };
}

export function isLedPowered(
  comp: CircuitComponent,
  net: NetGraph,
  pinStates: Record<number, { mode: string; digital: 0 | 1; analog: number }>,
): boolean {
  if (comp.kind !== "led") return false;
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
