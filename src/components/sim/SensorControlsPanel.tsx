// Floating "Sensor Controls" panel shown while the simulation is running.
// For every placed custom component (e.g. AI-generated MPU6050, DHT11, LDR…),
// it surfaces a slider per analog/PWM pin and a toggle per digital pin so the
// user can drive the sensor's "real-world" inputs (axis values, light level,
// distance, etc.) — useful when the component cannot physically be moved.
//
// Pin values are written to `comp.props["pin_<pinId>_value"]` and consumed by
// the netlist evaluator, which surfaces them on the connected board input pins.

import { useMemo, useState } from "react";
import { useSimStore } from "@/sim/store";
import { useAdminStore, type VisualPin } from "@/sim/adminStore";
import type { CircuitComponent } from "@/sim/types";
import { Sliders, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Pins that don't make sense to drive interactively. */
const NON_INPUT_TYPES = new Set(["power", "ground", "i2c-sda", "i2c-scl", "spi", "uart"]);

interface ResolvedSensor {
  comp: CircuitComponent;
  label: string;
  inputs: VisualPin[];
}

export function SensorControlsPanel() {
  const status = useSimStore((s) => s.status);
  const components = useSimStore((s) => s.components);
  const setProp = useSimStore((s) => s.setComponentProp);
  const adminComps = useAdminStore((s) => s.components);
  const [open, setOpen] = useState(true);

  const sensors: ResolvedSensor[] = useMemo(() => {
    const out: ResolvedSensor[] = [];
    for (const c of components) {
      if (c.kind !== "custom") continue;
      const cid = String(c.props.customId ?? "");
      const entry = adminComps.find((a) => a.id === cid);
      if (!entry?.pins?.length) continue;
      const inputs = entry.pins.filter((p) => !NON_INPUT_TYPES.has(p.type));
      if (inputs.length === 0) continue;
      out.push({ comp: c, label: entry.label, inputs });
    }
    return out;
  }, [components, adminComps]);

  // Only show during simulation, and only when there's something to control.
  if (status !== "running" && status !== "paused") return null;
  if (sensors.length === 0) return null;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[520px] w-[min(520px,calc(100%-32px))] rounded-md border border-border bg-card/95 backdrop-blur shadow-lg text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-border"
      >
        <span className="flex items-center gap-1.5 font-medium">
          <Sliders className="h-3.5 w-3.5 text-primary" />
          Sensor controls
          <span className="text-muted-foreground font-normal">
            ({sensors.length} sensor{sensors.length === 1 ? "" : "s"})
          </span>
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>
      {open && (
        <div className="max-h-[260px] overflow-auto p-3 space-y-3">
          {sensors.map(({ comp, label, inputs }) => (
            <div key={comp.id} className="rounded border border-border/60 p-2">
              <div className="flex items-center justify-between mb-2">
                <div className="font-mono font-semibold">{label}</div>
                <div className="text-[10px] text-muted-foreground">{comp.id.slice(0, 8)}</div>
              </div>
              <div className="space-y-2">
                {inputs.map((pin) => (
                  <PinControl
                    key={pin.id}
                    pin={pin}
                    value={comp.props[`pin_${pin.id}_value`]}
                    onChange={(v) => setProp(comp.id, `pin_${pin.id}_value`, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PinControl({
  pin,
  value,
  onChange,
}: {
  pin: VisualPin;
  value: number | string | boolean | undefined;
  onChange: (v: number | boolean) => void;
}) {
  // Digital pins → toggle 0/1. Analog/PWM/other → 0..1023 slider.
  if (pin.type === "digital") {
    const on = value === 1 || value === true;
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono w-20 truncate" title={pin.label}>{pin.label}</span>
        <Button
          size="sm"
          variant={on ? "default" : "outline"}
          className="h-6 px-2 text-[10px]"
          onClick={() => onChange(on ? 0 : 1)}
        >
          {on ? "HIGH" : "LOW"}
        </Button>
        <span className="ml-auto text-muted-foreground font-mono text-[10px]">digital</span>
      </div>
    );
  }

  const numValue = typeof value === "number" ? value : 512;
  const min = 0;
  const max = 1023;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono w-20 truncate" title={pin.label}>{pin.label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={numValue}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="font-mono tabular-nums w-12 text-right">{numValue}</span>
      <span className="text-muted-foreground font-mono text-[10px] w-12 text-right">
        {pin.type === "pwm" ? "pwm" : "analog"}
      </span>
    </div>
  );
}
