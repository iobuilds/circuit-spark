import { useMemo } from "react";
import { useSimStore } from "@/sim/store";

interface Props {
  /** I2C slave address (0x3C default, or 0x3D). */
  addr: number;
}

/**
 * Visual representation of a 0.96" SSD1306 128×64 I2C OLED display.
 *
 * Body matches common breakouts (Vishay/Adafruit-style): blue PCB with a 4-pin
 * header (GND/VCC/SCL/SDA), a black panel area and the active pixel matrix.
 *
 * The pixel matrix is driven by the live framebuffer streamed from the AVR
 * worker via `oled-frame` messages. When no frame is available (sketch hasn't
 * initialized the display yet) we render the panel dark.
 */
export function Ssd1306Svg({ addr }: Props) {
  const activeBoardId = useSimStore((s) => s.activeSimBoardId);
  const oledFrames = useSimStore((s) => s.oledFrames);

  // Find the most recent frame for any board+addr matching this OLED.
  const frame = useMemo(() => {
    if (activeBoardId) {
      const f = oledFrames[`${activeBoardId}:${addr}`];
      if (f) return f;
    }
    // Fallback: pick any board's frame for the same addr (single-board case).
    for (const [k, v] of Object.entries(oledFrames)) {
      if (k.endsWith(`:${addr}`)) return v;
    }
    return null;
  }, [oledFrames, activeBoardId, addr]);

  // Build a single SVG <path> describing all lit pixels — vastly cheaper than
  // 8 192 individual rects. Path uses absolute moves + tiny relative rects.
  const litPath = useMemo(() => {
    if (!frame || !frame.on) return "";
    const { w, h, bitmap } = frame;
    let d = "";
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (bitmap[y * w + x]) d += `M${x} ${y}h1v1h-1z`;
      }
    }
    return d;
  }, [frame]);

  // Component-local 140×100 box (matches COMPONENT_DEFS.oled).
  // Layout: header on top (4 pins: GND VCC SCL SDA), panel below with active area.
  const px = 1; // pixel size in px when displayed in panel coords (panel is 128×64 user units)
  void px;

  // Panel in component coords: 128 wide, 32 tall (ratio 2:1, matches 0.96").
  const PANEL_X = 6;
  const PANEL_Y = 22;
  const PANEL_W = 128;
  const PANEL_H = 64;

  // Inside the panel we draw the framebuffer (128×64 logical pixels) via a
  // nested viewport. Use a uniform scale that fits W:128 into PANEL_W and
  // squashes H:64 into PANEL_H. The viewport uses `preserveAspectRatio="none"`
  // to honour the panel's 2:1 aspect (real 0.96" panels are 2:1).
  const lit = "oklch(0.95 0.05 220)"; // bright cyan-white pixel
  const dim = "oklch(0.04 0.005 250)"; // very dark panel surface

  return (
    <g>
      {/* PCB body */}
      <rect x={0} y={0} width={140} height={100} rx={3}
        fill="oklch(0.32 0.05 245)" stroke="oklch(0.18 0.02 245)" strokeWidth={1.2} />
      {/* Mounting holes */}
      <circle cx={5} cy={5} r={2.5} fill="oklch(0.05 0 0)" />
      <circle cx={135} cy={5} r={2.5} fill="oklch(0.05 0 0)" />
      <circle cx={5} cy={95} r={2.5} fill="oklch(0.05 0 0)" />
      <circle cx={135} cy={95} r={2.5} fill="oklch(0.05 0 0)" />

      {/* Header pads (GND / VCC / SCL / SDA — 4-pin I2C) */}
      <g>
        {[
          { x: 30, label: "GND" },
          { x: 55, label: "VDD" },
          { x: 80, label: "SCK" },
          { x: 105, label: "SDA" },
        ].map((p, i) => (
          <g key={p.label}>
            <rect x={p.x - 8} y={3} width={16} height={10} rx={1.5}
              fill="oklch(0.78 0.10 90)" />
            <circle cx={p.x} cy={8} r={2.5} fill="oklch(0.10 0 0)" />
            <text x={p.x} y={20} textAnchor="middle" fontSize={4.5}
              fontFamily="monospace" fill="oklch(0.95 0.02 90)">
              {`${i + 1} ${p.label}`}
            </text>
          </g>
        ))}
      </g>

      {/* Display bezel + panel */}
      <rect x={PANEL_X - 2} y={PANEL_Y - 2}
        width={PANEL_W + 4} height={PANEL_H + 4} rx={2}
        fill="oklch(0.05 0.005 250)" stroke="oklch(0.10 0 0)" strokeWidth={0.6} />
      <rect x={PANEL_X} y={PANEL_Y} width={PANEL_W} height={PANEL_H}
        fill={dim} />

      {/* Active pixel area — render via nested SVG so the path uses
          framebuffer-native (128×64) coordinates, scaled to the panel rect. */}
      <svg
        x={PANEL_X} y={PANEL_Y} width={PANEL_W} height={PANEL_H}
        viewBox={`0 0 ${frame?.w ?? 128} ${frame?.h ?? 64}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
      >
        {frame && frame.on && litPath && (
          <path d={litPath} fill={lit} opacity={Math.max(0.45, frame.contrast / 255)} />
        )}
        {(!frame || !frame.on) && (
          <text x={(frame?.w ?? 128) / 2} y={(frame?.h ?? 64) / 2 + 4}
            textAnchor="middle" fontSize={8} fontFamily="monospace"
            fill="oklch(0.4 0.05 220 / 0.6)">SSD1306 OFF</text>
        )}
      </svg>

      {/* Flex cable hint at bottom (decorative) */}
      <rect x={50} y={88} width={40} height={10} fill="oklch(0.62 0.10 60)" />
      <rect x={56} y={92} width={28} height={2} fill="oklch(0.45 0.08 60)" />

      {/* Address label */}
      <text x={70} y={97} textAnchor="middle" fontSize={4} fontFamily="monospace"
        fill="oklch(0.85 0.02 90)">{`0x${addr.toString(16).toUpperCase()}`}</text>

      <title>{`SSD1306 OLED 128×64 @ 0x${addr.toString(16).toUpperCase()}`}</title>
    </g>
  );
}
