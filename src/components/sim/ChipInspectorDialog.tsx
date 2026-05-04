import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSimStore } from "@/sim/store";
import {
  ATMEGA328P_REGS,
  ATMEGA328P_DIP_PINS,
  synthesizeSramFromPins,
  type RegSpec,
} from "@/sim/atmega328p";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Board component id whose pin states drive the inspector. */
  boardCompId: string | null;
}

const F_CPU = 16_000_000;

/** Live debug view of the ATmega328P: pinout, register map, SRAM, flash, EEPROM, PC/SP. */
export function ChipInspectorDialog({ open, onOpenChange, boardCompId }: Props) {
  const pinStatesByBoard = useSimStore((s) => s.pinStatesByBoard);
  const focusedPinStates = useSimStore((s) => s.pinStates);
  const simTimeMs = useSimStore((s) => s.simTimeMs);
  const status = useSimStore((s) => s.status);

  const pinStates = boardCompId
    ? (pinStatesByBoard[boardCompId] ?? focusedPinStates)
    : focusedPinStates;

  // Synthetic SRAM image derived from current pin states.
  const sram = useMemo(() => synthesizeSramFromPins(pinStates), [pinStates]);

  // Estimated PC: every Arduino instruction averages ~1.5 cycles. PC is in
  // 16-bit words; cap to flash size 16K words.
  const cycles = Math.floor((simTimeMs / 1000) * F_CPU);
  const pcWords = Math.floor(cycles / 1.5) % 0x4000;
  const sp = (sram[0x3E + 0x20] << 8) | sram[0x3D + 0x20];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>ATmega328P — Chip Inspector</span>
            <span className="text-xs font-mono text-muted-foreground">
              {status === "running" ? "● LIVE" : "◯ paused"} · F_CPU = 16 MHz
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="registers" className="flex-1 overflow-hidden flex flex-col">
          <TabsList>
            <TabsTrigger value="pinout">Pinout</TabsTrigger>
            <TabsTrigger value="registers">Registers</TabsTrigger>
            <TabsTrigger value="sram">SRAM</TabsTrigger>
            <TabsTrigger value="flash">Flash</TabsTrigger>
            <TabsTrigger value="eeprom">EEPROM</TabsTrigger>
            <TabsTrigger value="cpu">CPU / Stack</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-3">
            <TabsContent value="pinout" className="h-full m-0">
              <PinoutTab pinStates={pinStates} />
            </TabsContent>
            <TabsContent value="registers" className="h-full m-0">
              <RegistersTab sram={sram} />
            </TabsContent>
            <TabsContent value="sram" className="h-full m-0">
              <MemoryHexView data={sram} startAddr={0x100} length={0x800} label="SRAM (0x100–0x8FF)" />
            </TabsContent>
            <TabsContent value="flash" className="h-full m-0">
              <FlashTab pcWords={pcWords} cycles={cycles} />
            </TabsContent>
            <TabsContent value="eeprom" className="h-full m-0">
              <EepromTab />
            </TabsContent>
            <TabsContent value="cpu" className="h-full m-0">
              <CpuTab pcWords={pcWords} sp={sp} cycles={cycles} sram={sram} />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// -------------------- Pinout --------------------
function PinoutTab({
  pinStates,
}: {
  pinStates: Record<number, { mode: string; digital: 0 | 1; analog: number }>;
}) {
  const left = ATMEGA328P_DIP_PINS.slice(0, 14);
  const right = ATMEGA328P_DIP_PINS.slice(14).reverse();

  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="mx-auto" style={{ maxWidth: 720 }}>
          <div className="bg-card border-2 border-border rounded-lg p-4">
            <div className="flex items-center justify-center mb-3">
              <div className="text-xs font-mono text-muted-foreground tracking-wider">
                ◖ ATMEGA328P-PU
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                {left.map((p) => (
                  <PinRow key={p.num} pin={p} side="left" pinStates={pinStates} />
                ))}
              </div>
              <div className="space-y-1">
                {right.map((p) => (
                  <PinRow key={p.num} pin={p} side="right" pinStates={pinStates} />
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3 text-center">
            28-pin DIP, top view. Live state from connected Arduino board.
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

function PinRow({
  pin,
  side,
  pinStates,
}: {
  pin: { num: number; label: string; alt?: string };
  side: "left" | "right";
  pinStates: Record<number, { mode: string; digital: 0 | 1; analog: number }>;
}) {
  // Map AVR pin → Arduino pin number.
  const ardMatch = pin.alt?.match(/[AD]\d+/);
  const arduinoPin = ardMatch
    ? (ardMatch[0].startsWith("A")
        ? 14 + Number(ardMatch[0].slice(1))
        : Number(ardMatch[0].slice(1)))
    : null;
  const ps = arduinoPin !== null ? pinStates[arduinoPin] : undefined;
  const high = ps?.digital === 1;
  const isOutput = ps?.mode === "OUTPUT";

  const dot = (
    <span
      className={`inline-block w-3 h-3 rounded-full border ${
        high
          ? "bg-[oklch(0.72_0.20_145)] border-[oklch(0.72_0.20_145)] shadow-[0_0_8px_oklch(0.72_0.20_145)]"
          : ps
          ? "bg-muted border-border"
          : "bg-transparent border-border"
      }`}
    />
  );

  const num = (
    <span className="font-mono text-xs w-6 text-center text-muted-foreground">
      {pin.num}
    </span>
  );

  const label = (
    <div className="flex-1 min-w-0">
      <div className="font-mono text-xs font-semibold truncate">{pin.label}</div>
      {pin.alt && (
        <div className="font-mono text-[10px] text-muted-foreground truncate">{pin.alt}</div>
      )}
    </div>
  );

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded border ${
        ps ? "bg-card" : "bg-background/50"
      } ${isOutput ? "border-primary/40" : "border-border"}`}
    >
      {side === "left" ? (
        <>
          {num}
          {dot}
          {label}
        </>
      ) : (
        <>
          {label}
          {dot}
          {num}
        </>
      )}
    </div>
  );
}

// -------------------- Registers --------------------
function RegistersTab({ sram }: { sram: Uint8Array }) {
  const groups = useMemo(() => {
    const g: Record<string, RegSpec[]> = {};
    for (const r of ATMEGA328P_REGS) {
      (g[r.group] ||= []).push(r);
    }
    return g;
  }, []);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {Object.entries(groups).map(([group, regs]) => (
          <div key={group}>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              {group}
            </div>
            <div className="border border-border rounded overflow-hidden">
              <table className="w-full text-xs font-mono">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 w-24">Name</th>
                    <th className="text-left p-2 w-16">Addr</th>
                    <th className="text-left p-2 w-16">Hex</th>
                    <th className="text-left p-2 w-32">Binary</th>
                    <th className="text-left p-2">Bits / Description</th>
                  </tr>
                </thead>
                <tbody>
                  {regs.map((r) => {
                    const v = sram[r.sramOffset] ?? 0;
                    return (
                      <tr key={r.name} className="border-t border-border">
                        <td className="p-2 font-semibold">{r.name}</td>
                        <td className="p-2 text-muted-foreground">0x{r.addr.toString(16).toUpperCase().padStart(2, "0")}</td>
                        <td className="p-2">0x{v.toString(16).toUpperCase().padStart(2, "0")}</td>
                        <td className="p-2">
                          <BitField value={v} bits={r.bits} />
                        </td>
                        <td className="p-2 text-muted-foreground">{r.desc}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function BitField({ value, bits }: { value: number; bits?: string[] }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 8 }).map((_, i) => {
        const bit = 7 - i;
        const set = (value >> bit) & 1;
        const label = bits?.[i];
        return (
          <span
            key={bit}
            title={label ? `${label} = ${set}` : `bit ${bit} = ${set}`}
            className={`inline-block w-4 h-4 text-center text-[9px] leading-4 rounded-sm border ${
              set
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border"
            }`}
          >
            {set}
          </span>
        );
      })}
    </div>
  );
}

// -------------------- Memory hex view --------------------
function MemoryHexView({
  data,
  startAddr,
  length,
  label,
}: {
  data: Uint8Array;
  startAddr: number;
  length: number;
  label: string;
}) {
  const rows: { addr: number; bytes: number[] }[] = [];
  for (let a = startAddr; a < startAddr + length; a += 16) {
    const slice = Array.from(data.slice(a, a + 16));
    rows.push({ addr: a, bytes: slice });
  }
  return (
    <ScrollArea className="h-full">
      <div className="p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {label}
        </div>
        <pre className="text-[11px] font-mono leading-relaxed">
          {rows.map((r) => {
            const hex = r.bytes
              .map((b) => (b ?? 0).toString(16).padStart(2, "0"))
              .join(" ");
            const ascii = r.bytes
              .map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
              .join("");
            return (
              <div key={r.addr} className="hover:bg-muted/30 px-1">
                <span className="text-muted-foreground">
                  {r.addr.toString(16).toUpperCase().padStart(4, "0")}:
                </span>{" "}
                <span>{hex}</span>{" "}
                <span className="text-muted-foreground">|{ascii}|</span>
              </div>
            );
          })}
        </pre>
      </div>
    </ScrollArea>
  );
}

// -------------------- Flash --------------------
function FlashTab({ pcWords, cycles }: { pcWords: number; cycles: number }) {
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Flash size" value="32 KB" sub="16,384 words × 16-bit" />
          <Stat
            label="Program counter"
            value={`0x${pcWords.toString(16).toUpperCase().padStart(4, "0")}`}
            sub="word address (estimated)"
          />
          <Stat label="Cycles executed" value={cycles.toLocaleString()} sub="@ 16 MHz" />
        </div>
        <div className="text-xs text-muted-foreground border-l-2 border-primary pl-3 py-1">
          Flash hex view requires the compiled .hex from Arduino CLI. Compile your sketch
          to populate this region. The program counter is currently estimated from elapsed
          simulation time — connect the avr8js execution path for cycle-accurate values.
        </div>
      </div>
    </ScrollArea>
  );
}

// -------------------- EEPROM --------------------
function EepromTab() {
  const eeprom = useMemo(() => new Uint8Array(1024), []);
  return <MemoryHexView data={eeprom} startAddr={0} length={1024} label="EEPROM (1 KB)" />;
}

// -------------------- CPU / Stack --------------------
function CpuTab({
  pcWords,
  sp,
  cycles,
  sram,
}: {
  pcWords: number;
  sp: number;
  cycles: number;
  sram: Uint8Array;
}) {
  const sreg = sram[0x3F + 0x20] ?? 0;
  const flags = ["I", "T", "H", "S", "V", "N", "Z", "C"];
  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label="PC (word)"
            value={`0x${pcWords.toString(16).toUpperCase().padStart(4, "0")}`}
          />
          <Stat
            label="PC (byte)"
            value={`0x${(pcWords * 2).toString(16).toUpperCase().padStart(4, "0")}`}
          />
          <Stat label="Stack Pointer" value={`0x${sp.toString(16).toUpperCase().padStart(4, "0")}`} />
          <Stat label="Cycles" value={cycles.toLocaleString()} />
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Status Register (SREG)
          </div>
          <div className="flex gap-2">
            {flags.map((f, i) => {
              const bit = 7 - i;
              const set = (sreg >> bit) & 1;
              return (
                <div
                  key={f}
                  className={`flex flex-col items-center justify-center w-12 h-12 rounded border ${
                    set
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground"
                  }`}
                >
                  <div className="font-mono text-sm font-bold">{f}</div>
                  <div className="font-mono text-xs">{set}</div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            I=Interrupts T=Bit-copy H=Half-carry S=Sign V=Overflow N=Negative Z=Zero C=Carry
          </p>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Stack region (top 64 bytes)
          </div>
          <pre className="text-[11px] font-mono leading-relaxed bg-card border border-border rounded p-2">
            {Array.from({ length: 4 }).map((_, row) => {
              const addr = 0x8FF - 16 * row - 15;
              const bytes = Array.from(sram.slice(Math.max(0, addr), addr + 16));
              return (
                <div key={row}>
                  <span className="text-muted-foreground">
                    {addr.toString(16).toUpperCase().padStart(4, "0")}:
                  </span>{" "}
                  {bytes.map((b) => (b ?? 0).toString(16).padStart(2, "0")).join(" ")}
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    </ScrollArea>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold mt-1">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
