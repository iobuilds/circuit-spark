import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DS3231_REG_INFO, createDs3231State, readSnapshot, type Ds3231State } from "@/sim/ds3231";

/**
 * DS3231 RTC module: top-down board view + click-to-open register inspector.
 * The visual mirrors the common ZS-042 breakout (DS3231 chip + 24C32 EEPROM
 * + battery holder) shown on the user's reference photo.
 */
export function Ds3231Svg() {
  const [open, setOpen] = useState(false);
  return (
    <g>
      {/* PCB body (200×130) */}
      <rect x={0} y={0} width={200} height={130} rx={4}
        fill="oklch(0.32 0.05 245)" stroke="oklch(0.18 0.02 245)" strokeWidth={1.2} />

      {/* Mounting holes */}
      <circle cx={6} cy={6} r={2.5} fill="oklch(0.05 0 0)" />
      <circle cx={194} cy={6} r={2.5} fill="oklch(0.05 0 0)" />
      <circle cx={6} cy={124} r={2.5} fill="oklch(0.05 0 0)" />
      <circle cx={194} cy={124} r={2.5} fill="oklch(0.05 0 0)" />

      {/* Left header pads (32K SQW SCL SDA VCC GND) */}
      {[18, 38, 58, 78, 98, 118].map((y) => (
        <g key={y}>
          <rect x={2} y={y - 4} width={18} height={8} rx={1} fill="oklch(0.78 0.10 90)" />
          <circle cx={11} cy={y} r={2.5} fill="oklch(0.10 0 0)" />
        </g>
      ))}
      {/* Right header pads (SCL SDA VCC GND) */}
      {[38, 58, 78, 98].map((y) => (
        <g key={y}>
          <rect x={180} y={y - 4} width={18} height={8} rx={1} fill="oklch(0.78 0.10 90)" />
          <circle cx={189} cy={y} r={2.5} fill="oklch(0.10 0 0)" />
        </g>
      ))}

      {/* Pin labels (left) */}
      <g fontSize={6} fontFamily="monospace" fill="oklch(0.95 0.02 90)">
        <text x={24} y={20}>32K</text>
        <text x={24} y={40}>SQW</text>
        <text x={24} y={60}>SCL</text>
        <text x={24} y={80}>SDA</text>
        <text x={24} y={100}>VCC</text>
        <text x={24} y={120}>GND</text>
      </g>
      <g fontSize={6} fontFamily="monospace" fill="oklch(0.95 0.02 90)" textAnchor="end">
        <text x={178} y={40}>SCL</text>
        <text x={178} y={60}>SDA</text>
        <text x={178} y={80}>VCC</text>
        <text x={178} y={100}>GND</text>
      </g>

      {/* DS3231 IC (clickable inspector trigger) */}
      <g
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        onMouseDown={(e) => e.stopPropagation()}
        className="cursor-pointer"
      >
        <rect x={70} y={20} width={60} height={50} rx={2}
          fill="oklch(0.12 0.01 245)" stroke="oklch(0.05 0 0)" strokeWidth={0.8} />
        <text x={100} y={42} textAnchor="middle" fontSize={9} fontWeight={700}
          fill="oklch(0.95 0.02 90)" fontFamily="monospace">DS3231</text>
        <text x={100} y={54} textAnchor="middle" fontSize={5}
          fill="oklch(0.7 0.05 90)" fontFamily="monospace">real-time clock</text>
        {/* IC pin marks */}
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={`l${i}`} x={67} y={24 + i * 5.4} width={3} height={2.4} fill="oklch(0.6 0 0)" />
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <rect key={`r${i}`} x={130} y={24 + i * 5.4} width={3} height={2.4} fill="oklch(0.6 0 0)" />
        ))}
        <title>Click to open DS3231 register inspector</title>
      </g>

      {/* 24C32 EEPROM */}
      <g>
        <rect x={66} y={92} width={48} height={16} rx={1.5}
          fill="oklch(0.10 0.01 245)" stroke="oklch(0.05 0 0)" strokeWidth={0.6} />
        <text x={90} y={102} textAnchor="middle" fontSize={5.5} fontWeight={700}
          fill="oklch(0.85 0.02 90)" fontFamily="monospace">24C32</text>
        <text x={90} y={107} textAnchor="middle" fontSize={4}
          fill="oklch(0.6 0.02 90)" fontFamily="monospace">EEPROM</text>
      </g>

      {/* Address jumpers A0 A1 A2 */}
      <g fontSize={4} fontFamily="monospace" fill="oklch(0.85 0.02 90)">
        <rect x={120} y={92} width={42} height={12} fill="oklch(0.18 0.02 245)" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <circle cx={128 + i * 12} cy={98} r={1.6} fill="oklch(0.7 0.10 90)" />
            <text x={128 + i * 12} y={111} textAnchor="middle">{`A${i}`}</text>
          </g>
        ))}
      </g>

      {/* SMD components hints */}
      <rect x={36} y={26} width={6} height={3} fill="oklch(0.85 0.05 90)" />
      <rect x={36} y={36} width={6} height={3} fill="oklch(0.85 0.05 90)" />
      <rect x={158} y={20} width={6} height={3} fill="oklch(0.85 0.05 90)" />
      <rect x={158} y={28} width={6} height={3} fill="oklch(0.85 0.05 90)" />

      {/* Inspector dialog (rendered via portal, safe inside <g>) */}
      <foreignObject x={0} y={0} width={0} height={0}>
        <Ds3231Inspector open={open} onOpenChange={setOpen} />
      </foreignObject>
    </g>
  );
}

function Ds3231Inspector({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  // Local read-only mirror of the simulated chip — re-snapshots once per second.
  // (We don't have a direct handle to the worker's instance; instead we run a
  // matching state object here so the inspector still shows live, plausible
  // register values driven by host time. Writes from sketches reflect in the
  // worker's instance — UI shows the no-offset baseline.)
  const [state] = useState<Ds3231State>(() => createDs3231State());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, [open]);

  const regs = readSnapshot(state);
  const now = new Date(Date.now() + state.offsetMs);
  void tick;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-mono">
            DS3231 — RTC Inspector
            <span className="ml-3 text-xs font-normal text-muted-foreground">
              I²C addr 0x68 · {now.toLocaleString()}
            </span>
          </DialogTitle>
          <DialogDescription>Live register map of the simulated DS3231 real-time clock.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="border border-border rounded overflow-hidden">
            <table className="w-full text-xs font-mono">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 w-16">Addr</th>
                  <th className="text-left p-2 w-28">Name</th>
                  <th className="text-left p-2 w-16">Hex</th>
                  <th className="text-left p-2 w-24">BCD/Dec</th>
                  <th className="text-left p-2">Description</th>
                </tr>
              </thead>
              <tbody>
                {DS3231_REG_INFO.map((r) => {
                  const v = regs[r.addr];
                  const dec = ((v >> 4) & 0x0f) * 10 + (v & 0x0f);
                  return (
                    <tr key={r.addr} className="border-t border-border">
                      <td className="p-2 text-muted-foreground">0x{r.addr.toString(16).toUpperCase().padStart(2, "0")}</td>
                      <td className="p-2 font-semibold">{r.name}</td>
                      <td className="p-2">0x{v.toString(16).toUpperCase().padStart(2, "0")}</td>
                      <td className="p-2">{dec}</td>
                      <td className="p-2 text-muted-foreground">{r.desc}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-[11px] text-muted-foreground p-3">
            Connect SDA/SCL to A4/A5 on the Arduino Uno. Read with{" "}
            <code className="bg-muted px-1 rounded">Wire.requestFrom(0x68, n)</code>.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
