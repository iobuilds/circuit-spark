// Realistic Arduino Uno — uses the user-supplied top-down PNG illustration
// embedded inside an SVG so the rest of the simulator (which expects an SVG
// string) keeps working. The image is rasterized at 960x704 (its natural
// pixel size); pin coordinates in unoPins.ts are calibrated to this viewBox.

import unoPng from "@/assets/arduino-uno.png";

export const UNO_VIEW_W = 960;
export const UNO_VIEW_H = 704;

export const UNO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${UNO_VIEW_W} ${UNO_VIEW_H}" preserveAspectRatio="none">
  <image href="${unoPng}" x="0" y="0" width="${UNO_VIEW_W}" height="${UNO_VIEW_H}" preserveAspectRatio="none" />
</svg>
`.trim();
