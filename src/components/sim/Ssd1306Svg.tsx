import { useMemo } from "react";
import { useSimStore } from "@/sim/store";

interface Props {
  /** I2C slave address (0x3C default, or 0x3D). */
  addr: number;
}

/**
 * 0.96" SSD1306 128×64 I2C OLED — realistic top-down view of the common
 * blue breakout board: 4-pin header at top (GND VDD SCK SDA), large black
 * display window below the bezel, and a white flex cable strip + gold
 * contact pads at the bottom edge.
 *
 * Pixels are driven by the live framebuffer streamed from the AVR worker.
 */
export function Ssd1306Svg({ addr }: Props) {
  const activeBoardId = useSimStore((s) => s.activeSimBoardId);
  const oledFrames = useSimStore((s) => s.oledFrames);

  const frame = useMemo(() => {
    if (activeBoardId) {
      const f = oledFrames[`${activeBoardId}:${addr}`];
      if (f) return f;
    }
    for (const [k, v] of Object.entries(oledFrames)) {
      if (k.endsWith(`:${addr}`)) return v;
    }
    return null;
  }, [oledFrames, activeBoardId, addr]);

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

  // Component bounds 140×100. Layout to match the photo reference:
  //  • PCB: blue rounded rect, 4 corner mounting holes
  //  • Top header strip darker blue, 4 pads with header pins
  //  • Display window (black) takes the central area
  //  • Flex cable strip + gold contact pads at the bottom
  const PCB_FILL = "oklch(0.36 0.07 230)";       // mid blue
  const PCB_STROKE = "oklch(0.20 0.04 230)";
  const HEADER_FILL = "oklch(0.30 0.07 230)";    // slightly darker top strip
  const PAD_GOLD = "oklch(0.72 0.10 80)";
  const PIN_DARK = "oklch(0.18 0.01 80)";
  const PANEL_BLACK = "oklch(0.06 0.005 250)";
  const BEZEL = "oklch(0.10 0.01 250)";
  const FLEX_WHITE = "oklch(0.96 0.01 90)";
  const LABEL = "oklch(0.95 0.02 90)";

  const PANEL_X = 12;
  const PANEL_Y = 24;
  const PANEL_W = 116;
  const PANEL_H = 56;

  const lit = "oklch(0.95 0.05 220)";

  return (
    <g>
      {/* PCB body */}
      <rect x={0} y={0} width={140} height={100} rx={3}
        fill={PCB_FILL} stroke={PCB_STROKE} strokeWidth={1} />

      {/* Top header strip */}
      <rect x={0} y={0} width={140} height={20} fill={HEADER_FILL} />

      {/* Mounting holes */}
      {[
        [6, 6], [134, 6], [6, 94], [134, 94],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={3} fill="oklch(0.92 0.03 80)" />
          <circle cx={cx} cy={cy} r={1.4} fill="oklch(0.05 0 0)" />
        </g>
      ))}

      {/* 4-pin header — gold pads + dark holes, with labels below */}
      {[
        { x: 50, label: "GND", num: "1" },
        { x: 66, label: "VDD", num: "" },
        { x: 82, label: "SCK", num: "" },
        { x: 98, label: "SDA", num: "4" },
      ].map((p) => (
        <g key={p.label}>
          <rect x={p.x - 5} y={3} width={10} height={7} rx={1} fill={PAD_GOLD} />
          <circle cx={p.x} cy={6.5} r={1.6} fill={PIN_DARK} />
        </g>
      ))}
      <text x={48} y={17} fontSize={3.2} fontFamily="monospace" fill={LABEL}>1</text>
      <text x={101} y={17} fontSize={3.2} fontFamily="monospace" fill={LABEL}>4</text>
      {[
        { x: 50, label: "GND" },
        { x: 66, label: "VDD" },
        { x: 82, label: "SCK" },
        { x: 98, label: "SDA" },
      ].map((p) => (
        <text key={p.label} x={p.x} y={17} textAnchor="middle"
          fontSize={3.2} fontFamily="monospace" fill={LABEL}>
          {p.label}
        </text>
      ))}

      {/* Display bezel + black panel */}
      <rect x={PANEL_X - 1} y={PANEL_Y - 1}
        width={PANEL_W + 2} height={PANEL_H + 2}
        fill={BEZEL} />
      <rect x={PANEL_X} y={PANEL_Y} width={PANEL_W} height={PANEL_H}
        fill={PANEL_BLACK} />

      {/* Subtle screen-glare highlight (top-right) */}
      <path
        d={`M ${PANEL_X + PANEL_W - 18} ${PANEL_Y} L ${PANEL_X + PANEL_W} ${PANEL_Y} L ${PANEL_X + PANEL_W} ${PANEL_Y + 22} Z`}
        fill="oklch(1 0 0 / 0.04)"
      />

      {/* Active pixel area */}
      <svg
        x={PANEL_X} y={PANEL_Y} width={PANEL_W} height={PANEL_H}
        viewBox={`0 0 ${frame?.w ?? 128} ${frame?.h ?? 64}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
      >
        {frame && frame.on && litPath && (
          <path d={litPath} fill={lit} opacity={Math.max(0.55, frame.contrast / 255)} />
        )}
      </svg>

      {/* Flex cable: dark strip behind, white tongue with gold contacts */}
      <rect x={PANEL_X} y={PANEL_Y + PANEL_H} width={PANEL_W} height={6}
        fill="oklch(0.08 0.01 250)" />
      <rect x={56} y={PANEL_Y + PANEL_H + 4} width={28} height={10}
        fill={FLEX_WHITE} stroke="oklch(0.65 0.04 80)" strokeWidth={0.4} />
      {/* Gold contact pads on the flex */}
      {Array.from({ length: 6 }).map((_, i) => (
        <rect key={i} x={59 + i * 4} y={PANEL_Y + PANEL_H + 5}
          width={2.4} height={3.5} fill={PAD_GOLD} />
      ))}

      <title>{`SSD1306 OLED 128×64 @ 0x${addr.toString(16).toUpperCase()}`}</title>
    </g>
  );
}
