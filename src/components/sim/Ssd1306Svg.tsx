import { useMemo } from "react";
import { useSimStore } from "@/sim/store";
import oledBoardUrl from "@/assets/oled-board.svg";

interface Props {
  /** I2C slave address (0x3C default, or 0x3D). */
  addr: number;
}

/**
 * 0.96" SSD1306 128×64 I2C OLED — top-down photoreal view sourced from a
 * traced SVG of the real breakout (dark PCB, blue inner backplate, four
 * mounting screws, large black display window, 4-pin header at the bottom).
 *
 * Live pixels from the AVR worker's framebuffer are overlaid on top of the
 * black display panel.
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

  // Component bounds 140×100. The bundled SVG art is 672×669; the visible
  // black display window inside the art is at x=33, y=116, w=602, h=318
  // (source units). We map that to the 128×64 framebuffer below.
  const ART_W = 672;
  const ART_H = 669;
  const SCREEN = { x: 33, y: 116, w: 602, h: 318 };

  // Scale factors from source SVG units → component-local 140×100.
  const sx = 140 / ART_W;
  const sy = 100 / ART_H;
  const screenX = SCREEN.x * sx;
  const screenY = SCREEN.y * sy;
  const screenW = SCREEN.w * sx;
  const screenH = SCREEN.h * sy;

  const lit = "oklch(0.95 0.05 220)";

  return (
    <g>
      {/* Photoreal board art */}
      <image
        href={oledBoardUrl}
        x={0}
        y={0}
        width={140}
        height={100}
        preserveAspectRatio="none"
      />

      {/* Live pixel overlay aligned to the black display window */}
      <svg
        x={screenX}
        y={screenY}
        width={screenW}
        height={screenH}
        viewBox={`0 0 ${frame?.w ?? 128} ${frame?.h ?? 64}`}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
      >
        {/* Soft black backdrop so the display reads as off when panel is off */}
        <rect x={0} y={0} width={frame?.w ?? 128} height={frame?.h ?? 64} fill="oklch(0.04 0.005 250)" />
        {frame && frame.on && litPath && (
          <path
            d={litPath}
            fill={lit}
            opacity={Math.max(0.55, frame.contrast / 255)}
          />
        )}
      </svg>

      <title>{`SSD1306 OLED 128×64 @ 0x${addr.toString(16).toUpperCase()}`}</title>
    </g>
  );
}
