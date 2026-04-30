// Renders a custom (AI-generated or imported) component on the canvas.
import type { CustomComponentRow } from "@/sim/componentPack";

interface Props {
  comp: CustomComponentRow;
}

export function CustomComponentSvg({ comp }: Props) {
  const w = comp.spec?.width ?? 100;
  const h = comp.spec?.height ?? 80;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      // dangerouslySetInnerHTML is fine here — SVG only, sanitized at AI level.
      dangerouslySetInnerHTML={{ __html: comp.svg }}
    />
  );
}
