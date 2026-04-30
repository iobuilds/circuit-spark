// Realistic Arduino Uno SVG (360x240 user-space units).
// Used both by the simulator canvas and the admin board editor.
// Pure SVG — no images — so it scales crisply and recolors cleanly.

export const UNO_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="pcb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0aa19a"/>
      <stop offset="1" stop-color="#067a73"/>
    </linearGradient>
    <linearGradient id="usb" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfd2d6"/>
      <stop offset="0.5" stop-color="#9ea3aa"/>
      <stop offset="1" stop-color="#6b7077"/>
    </linearGradient>
    <linearGradient id="jack" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c1c1f"/>
      <stop offset="1" stop-color="#0a0a0c"/>
    </linearGradient>
    <linearGradient id="header" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1a1a1d"/>
      <stop offset="1" stop-color="#0e0e10"/>
    </linearGradient>
    <radialGradient id="ledOn" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#fff7a6"/>
      <stop offset="0.5" stop-color="#f5c518"/>
      <stop offset="1" stop-color="#a17a00"/>
    </radialGradient>
    <radialGradient id="ledPwr" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#c5ffd8"/>
      <stop offset="1" stop-color="#11a23a"/>
    </radialGradient>
    <pattern id="silk" width="4" height="4" patternUnits="userSpaceOnUse">
      <rect width="4" height="4" fill="transparent"/>
    </pattern>
  </defs>

  <!-- PCB body with rounded corners and silkscreen border -->
  <rect x="0" y="0" width="360" height="240" rx="12" ry="12" fill="url(#pcb)"/>
  <rect x="3" y="3" width="354" height="234" rx="10" ry="10" fill="none" stroke="#055a55" stroke-width="0.6"/>
  <rect x="6" y="6" width="348" height="228" rx="8" ry="8" fill="none" stroke="#ffffff" stroke-opacity="0.18" stroke-width="0.5" stroke-dasharray="3 2"/>

  <!-- Mounting holes -->
  <g fill="#0b3633" stroke="#cfd2d6" stroke-width="0.6">
    <circle cx="14" cy="16" r="3.2"/>
    <circle cx="14" cy="222" r="3.2"/>
    <circle cx="346" cy="14" r="3.2"/>
    <circle cx="346" cy="226" r="3.2"/>
  </g>

  <!-- USB-B connector (left side, sticks slightly off the board) -->
  <g>
    <rect x="-10" y="36" width="44" height="56" rx="2" fill="url(#usb)" stroke="#3a3d42" stroke-width="0.8"/>
    <rect x="-6" y="44" width="36" height="40" fill="#1a1c1f"/>
    <rect x="-6" y="50" width="36" height="28" fill="#0e1012"/>
    <text x="12" y="100" text-anchor="middle" font-family="monospace" font-size="6" fill="#ffffff" opacity="0.55">USB</text>
  </g>

  <!-- DC barrel jack (lower-left) -->
  <g>
    <rect x="-2" y="148" width="42" height="40" rx="3" fill="url(#jack)" stroke="#000" stroke-width="0.8"/>
    <circle cx="19" cy="168" r="9" fill="#26282b" stroke="#0a0a0c" stroke-width="0.8"/>
    <circle cx="19" cy="168" r="3.5" fill="#0a0a0c"/>
    <text x="19" y="192" text-anchor="middle" font-family="monospace" font-size="6" fill="#ffffff" opacity="0.55">PWR</text>
  </g>

  <!-- Voltage regulator (TO-220) -->
  <g>
    <rect x="56" y="142" width="22" height="36" rx="2" fill="#1f1f22" stroke="#000" stroke-width="0.6"/>
    <rect x="58" y="144" width="18" height="6" fill="#9ea3aa"/>
    <circle cx="67" cy="160" r="2" fill="#3a3d42"/>
    <text x="67" y="174" text-anchor="middle" font-family="monospace" font-size="5" fill="#ffffff" opacity="0.7">NCP1117</text>
  </g>

  <!-- Electrolytic capacitor (next to regulator) -->
  <g>
    <circle cx="92" cy="158" r="11" fill="#1a1a1c" stroke="#000" stroke-width="0.6"/>
    <circle cx="92" cy="158" r="9" fill="#26262a"/>
    <path d="M 88 158 h 8 M 92 154 v 8" stroke="#cfd2d6" stroke-width="0.6"/>
  </g>

  <!-- ATmega328P MCU (DIP-28 footprint) -->
  <g>
    <rect x="148" y="108" width="74" height="74" rx="2" fill="#15151a" stroke="#000" stroke-width="0.8"/>
    <rect x="150" y="110" width="70" height="70" fill="#1c1c22"/>
    <!-- pin-1 indicator notch -->
    <path d="M 148 124 a 4 4 0 0 0 8 0" fill="#0a0a0c"/>
    <text x="185" y="138" text-anchor="middle" font-family="monospace" font-size="7.5" fill="#cfd2d6" font-weight="700">ATMEGA</text>
    <text x="185" y="150" text-anchor="middle" font-family="monospace" font-size="7.5" fill="#cfd2d6" font-weight="700">328P-PU</text>
    <text x="185" y="162" text-anchor="middle" font-family="monospace" font-size="5" fill="#cfd2d6" opacity="0.7">U-NO</text>
    <text x="185" y="172" text-anchor="middle" font-family="monospace" font-size="4.5" fill="#cfd2d6" opacity="0.5">2426</text>
    <!-- DIP pin pads (visible silver bumps along sides) -->
    <g fill="#cfd2d6">
      <!-- left side: 14 pins -->
      ${Array.from({ length: 14 }, (_, i) => `<rect x="146" y="${112 + i * 5}" width="4" height="2" rx="0.5"/>`).join("")}
      <!-- right side: 14 pins -->
      ${Array.from({ length: 14 }, (_, i) => `<rect x="220" y="${112 + i * 5}" width="4" height="2" rx="0.5"/>`).join("")}
    </g>
  </g>

  <!-- 16 MHz crystal oscillator -->
  <g>
    <rect x="232" y="138" width="28" height="14" rx="3" fill="#a3a7ad" stroke="#3a3d42" stroke-width="0.6"/>
    <rect x="234" y="140" width="24" height="10" rx="2" fill="#cfd2d6"/>
    <text x="246" y="148" text-anchor="middle" font-family="monospace" font-size="5" fill="#1a1a1c">16.000</text>
  </g>

  <!-- ICSP header (right side, 2x3) -->
  <g>
    <rect x="280" y="120" width="22" height="34" rx="1.5" fill="url(#header)" stroke="#000" stroke-width="0.5"/>
    <g fill="#cfd2d6">
      ${Array.from({ length: 3 }, (_, r) =>
        Array.from({ length: 2 }, (_, c) => `<circle cx="${287 + c * 8}" cy="${127 + r * 10}" r="1.4"/>`).join("")
      ).join("")}
    </g>
    <text x="291" y="162" text-anchor="middle" font-family="monospace" font-size="4.5" fill="#ffffff" opacity="0.7">ICSP</text>
  </g>

  <!-- Reset button (square tactile) -->
  <g>
    <rect x="56" y="106" width="22" height="22" rx="1.5" fill="#1a1a1c" stroke="#000" stroke-width="0.6"/>
    <rect x="60" y="110" width="14" height="14" rx="1.5" fill="#3a3d42"/>
    <circle cx="67" cy="117" r="3.5" fill="#cfd2d6"/>
    <text x="67" y="138" text-anchor="middle" font-family="monospace" font-size="4.5" fill="#ffffff" opacity="0.7">RESET</text>
  </g>

  <!-- LEDs: ON (power, green) and L (D13, yellow) plus TX/RX -->
  <g>
    <rect x="100" y="74" width="40" height="14" rx="2" fill="#0c4a47" opacity="0.6"/>
    <circle cx="108" cy="81" r="3" fill="url(#ledPwr)"/>
    <text x="108" y="94" text-anchor="middle" font-family="monospace" font-size="4.5" fill="#ffffff" opacity="0.85">ON</text>

    <circle cx="122" cy="81" r="3" fill="url(#ledOn)"/>
    <text x="122" y="94" text-anchor="middle" font-family="monospace" font-size="4.5" fill="#ffffff" opacity="0.85">L</text>

    <circle cx="134" cy="81" r="2.5" fill="#3a3d42"/>
    <text x="134" y="94" text-anchor="middle" font-family="monospace" font-size="4.5" fill="#ffffff" opacity="0.75">TX</text>

    <circle cx="146" cy="81" r="2.5" fill="#3a3d42"/>
    <text x="146" y="94" text-anchor="middle" font-family="monospace" font-size="4.5" fill="#ffffff" opacity="0.75">RX</text>
  </g>

  <!-- Pin header strips (black plastic body) -->
  <!-- Top digital header strip: spans D0..D13 + GND + AREF area -->
  <rect x="86" y="10" width="218" height="16" rx="1.5" fill="url(#header)" stroke="#000" stroke-width="0.5"/>
  <!-- Per-pin sockets along top -->
  <g fill="#0a0a0c" stroke="#3a3d42" stroke-width="0.4">
    ${Array.from({ length: 16 }, (_, i) => {
      // 14 digital pins + GND + AREF; some grouping skip handled by drawing equally here
      const x = 95 + i * 14;
      return `<rect x="${x - 3.2}" y="13" width="6.4" height="10" rx="0.6"/>`;
    }).join("")}
  </g>

  <!-- Bottom power + analog header strips -->
  <rect x="92" y="214" width="108" height="16" rx="1.5" fill="url(#header)" stroke="#000" stroke-width="0.5"/>
  <rect x="232" y="214" width="78" height="16" rx="1.5" fill="url(#header)" stroke="#000" stroke-width="0.5"/>
  <g fill="#0a0a0c" stroke="#3a3d42" stroke-width="0.4">
    ${[100, 114, 128, 142, 156, 170, 184].map((x) => `<rect x="${x - 3.2}" y="217" width="6.4" height="10" rx="0.6"/>`).join("")}
    ${Array.from({ length: 6 }, (_, i) => `<rect x="${240 + i * 14 - 3.2}" y="217" width="6.4" height="10" rx="0.6"/>`).join("")}
  </g>

  <!-- Silkscreen labels above top header -->
  <g font-family="monospace" font-size="4" fill="#ffffff" opacity="0.85" text-anchor="middle">
    ${Array.from({ length: 14 }, (_, i) => `<text x="${95 + i * 14}" y="9">${i}</text>`).join("")}
    <text x="${95 + 14 * 14}" y="9">GND</text>
    <text x="${95 + 15 * 14}" y="9">AREF</text>
    <text x="180" y="36" font-size="5" font-weight="700">DIGITAL (PWM~)</text>
  </g>

  <!-- Silkscreen labels below bottom header -->
  <g font-family="monospace" font-size="4" fill="#ffffff" opacity="0.85" text-anchor="middle">
    <text x="100" y="238">VIN</text>
    <text x="114" y="238">GND</text>
    <text x="128" y="238">GND</text>
    <text x="142" y="238">5V</text>
    <text x="156" y="238">3V3</text>
    <text x="170" y="238">RST</text>
    <text x="184" y="238">IOR</text>
    <text x="146" y="208" font-size="5" font-weight="700">POWER</text>

    ${Array.from({ length: 6 }, (_, i) => `<text x="${240 + i * 14}" y="238">A${i}</text>`).join("")}
    <text x="270" y="208" font-size="5" font-weight="700">ANALOG IN</text>
  </g>

  <!-- ARDUINO logo / branding (top-center area) -->
  <g font-family="'Helvetica Neue', Arial, sans-serif" text-anchor="middle">
    <text x="180" y="60" font-size="13" font-weight="800" fill="#ffffff" letter-spacing="2">ARDUINO</text>
    <text x="180" y="72" font-size="7" font-weight="600" fill="#ffffff" opacity="0.85" letter-spacing="3">UNO</text>
  </g>

  <!-- "TM" -->
  <text x="232" y="56" font-family="Arial" font-size="4" fill="#ffffff" opacity="0.8">TM</text>

  <!-- A few resistor-network rectangles for realism -->
  <g fill="#1a1a1c" stroke="#000" stroke-width="0.4">
    <rect x="240" y="160" width="14" height="4" rx="0.6"/>
    <rect x="258" y="160" width="14" height="4" rx="0.6"/>
    <rect x="240" y="170" width="14" height="4" rx="0.6"/>
  </g>
  <g fill="#cfd2d6">
    <rect x="241" y="161" width="2" height="2"/>
    <rect x="251" y="161" width="2" height="2"/>
    <rect x="259" y="161" width="2" height="2"/>
    <rect x="269" y="161" width="2" height="2"/>
    <rect x="241" y="171" width="2" height="2"/>
    <rect x="251" y="171" width="2" height="2"/>
  </g>

  <!-- Subtle solder mask traces (decorative) -->
  <g fill="none" stroke="#055a55" stroke-width="0.5" opacity="0.7">
    <path d="M 40 100 C 80 100, 120 60, 160 60"/>
    <path d="M 40 130 C 80 130, 120 110, 160 110"/>
    <path d="M 224 130 C 260 130, 280 100, 320 100"/>
    <path d="M 224 150 C 260 150, 290 170, 320 170"/>
  </g>

  <!-- Made-In and copyright micro-text -->
  <g font-family="monospace" font-size="3.5" fill="#ffffff" opacity="0.55">
    <text x="180" y="200" text-anchor="middle">Made in Italy</text>
  </g>
</svg>
`.trim();
