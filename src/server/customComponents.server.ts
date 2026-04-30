// Server-only helpers for the custom-component admin tooling.
// Talks to Lovable AI Gateway and Cloud DB/Storage with admin privileges.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const COMPONENT_PACKS_BUCKET = "component-packs";

export interface ComponentPin {
  id: string;
  label: string;
  x: number;
  y: number;
  /** Pin role helps simulator behavior. */
  role?: "power" | "ground" | "digital" | "analog" | "io" | "signal";
}

export interface BehaviorParam {
  id: string;
  label: string;
  type: "number" | "boolean" | "enum";
  min?: number;
  max?: number;
  step?: number;
  default?: number | boolean | string;
  options?: string[];
  unit?: string;
}

export interface BehaviorState {
  id: string;
  label: string;
  /** Condition expression using params + pins, e.g. "speed > 0 && !burned" */
  when?: string;
  /** Visual hints applied to the SVG root in this state. */
  visual?: {
    /** CSS color filter or fill override applied to root <g>. */
    filter?: string;
    /** Optional element selector inside the SVG to spin (data-spin). */
    spinSelector?: string;
    /** Optional element selector to glow (data-glow). */
    glowSelector?: string;
    /** Optional element selector to flicker (data-flicker). */
    flickerSelector?: string;
    /** Smoke / spark overlay. */
    overlay?: "smoke" | "spark" | "flame" | null;
  };
}

export interface ComponentBehavior {
  /** Tunable parameters surfaced as preview controls (speed, voltage, direction, etc). */
  params?: BehaviorParam[];
  /** Discrete visual states (idle, running, burned, etc). */
  states?: BehaviorState[];
  /** Failure conditions, e.g. "voltage > maxVoltage" -> burned state id. */
  failures?: { when: string; state: string; reason: string }[];
  /** Plain-English summary, for tooltip / docs. */
  notes?: string;
}

export interface ComponentSpec {
  name: string;
  slug: string;
  kind: "component" | "board";
  description: string;
  width: number;
  height: number;
  pins: ComponentPin[];
  /** Free-form behavior notes (legacy field). */
  behaviorNotes?: string;
  /** Structured behavior used by the live preview simulator. */
  behavior?: ComponentBehavior;
  /** Default props applied when dropped on the canvas. */
  defaults?: Record<string, string | number | boolean>;
}

export const COMPONENT_SPEC_TOOL = {
  type: "function" as const,
  function: {
    name: "emit_component_spec",
    description:
      "Emit a finalized component or board spec. Always include a clean SVG, a slug, and accurately placed pins.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        slug: {
          type: "string",
          description: "kebab-case unique identifier, e.g. 'tcs3200-color-sensor'",
        },
        kind: { type: "string", enum: ["component", "board"] },
        description: { type: "string" },
        width: { type: "number", description: "SVG viewBox width in component-local units" },
        height: { type: "number" },
        pins: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              x: { type: "number" },
              y: { type: "number" },
              role: {
                type: "string",
                enum: ["power", "ground", "digital", "analog", "io", "signal"],
              },
            },
            required: ["id", "label", "x", "y"],
            additionalProperties: false,
          },
        },
        svg: {
          type: "string",
          description:
            "Inner SVG markup (no outer <svg> wrapper). Use simple shapes; the viewBox will be 0 0 width height. Tag movable / glowing parts with data-spin, data-glow, or data-flicker attributes so the simulator can animate them.",
        },
        behaviorNotes: { type: "string" },
        behavior: {
          type: "object",
          description:
            "Structured behavior model used by the live preview simulator. Define tunable params (speed, voltage, direction), discrete states (idle, running, burned, broken), and failure conditions.",
          properties: {
            params: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  type: { type: "string", enum: ["number", "boolean", "enum"] },
                  min: { type: "number" },
                  max: { type: "number" },
                  step: { type: "number" },
                  default: {},
                  options: { type: "array", items: { type: "string" } },
                  unit: { type: "string" },
                },
                required: ["id", "label", "type"],
              },
            },
            states: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  when: { type: "string", description: "JS-like expression over params, e.g. 'speed > 0 && !burned'" },
                  visual: {
                    type: "object",
                    properties: {
                      filter: { type: "string" },
                      spinSelector: { type: "string" },
                      glowSelector: { type: "string" },
                      flickerSelector: { type: "string" },
                      overlay: { type: "string", enum: ["smoke", "spark", "flame"] },
                    },
                  },
                },
                required: ["id", "label"],
              },
            },
            failures: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  when: { type: "string" },
                  state: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["when", "state", "reason"],
              },
            },
            notes: { type: "string" },
          },
        },
        defaults: {
          type: "object",
          additionalProperties: true,
        },
      },
      required: ["name", "slug", "kind", "description", "width", "height", "pins", "svg"],
      additionalProperties: false,
    },
  },
} as const;

export const SYSTEM_PROMPT = `You are an expert hardware component designer for an Arduino-style circuit simulator.

When the user describes a component or board, iterate together with them. **You do NOT need a reference SVG** — if none is provided, generate one yourself from primitive SVG shapes that visually resembles the real-world part (e.g. a DC motor = circle body + shaft + 2 terminals; an LCD = rectangle with grid; a servo = box with horn). Ask short clarifying questions only when essential. Once the design is concrete, CALL the \`emit_component_spec\` tool.

Rules for the spec:
- slug: kebab-case, unique-ish.
- kind: "board" only for full MCU dev boards; otherwise "component".
- pins.x / pins.y are in SVG-local coords inside the viewBox 0 0 width height. Place pins on the visible edge so wires can attach.
- svg: inner markup only (no outer <svg> tag). Use <rect>, <circle>, <line>, <path>, <text>, <g> with sensible fills/strokes. Avoid external assets, scripts, or event handlers. No <foreignObject>.
- **Tag animatable parts** with data attributes so the live simulator can animate them:
   - \`data-spin="true"\` on rotor / shaft / fan blades
   - \`data-glow="true"\` on LEDs, indicators, status lamps
   - \`data-flicker="true"\` on parts that flicker when broken
   - \`data-screen="true"\` on the visible display surface of OLEDs/LCDs/TFTs/7-segments. Make it a single <rect> sized to the active pixel area — the simulator overlays rendered text/graphics on top of it.
   - Wrap any spinning element in a <g> centered on its rotation point.
- width / height: integers, typically 60-220 for components, 240-400 for boards.

**Behavior model (REQUIRED for active components — including displays):**
- params: tunable inputs surfaced as live controls. Examples:
   - DC motor: { speed 0..100, direction enum [forward,reverse], voltage 0..15 }
   - LED: { brightness 0..255, voltage 0..6 }
   - Servo: { angle 0..180 }
   - **0.96" SSD1306 I2C OLED**: { i2cAddress enum ["0x3C","0x3D"], voltage 0..6, contrast 0..255, text string default "Hello, World!", invert boolean }
   - LCD 16x2: { line1 string, line2 string, backlight boolean, contrast 0..100 }
   - 7-segment: { digit string default "8", decimalPoint boolean }
- states: visual states like "idle", "powered", "displaying", "burned", "no-power". Use \`when\` expressions over params (e.g. "voltage >= 3 && !burned"). Attach \`visual\` overrides:
   - filter: CSS filter (e.g. "brightness(1.4) saturate(1.3)")
   - spinSelector / glowSelector / flickerSelector — default to "[data-spin]" etc.
   - overlay: "smoke" | "spark" | "flame" for burned state
- failures: ALWAYS include at least one realistic failure for active components. Examples: motor burns when \`voltage > 12\`; LED burns when \`voltage > 5\`; OLED burns when \`voltage > 5.5\` or wrong I2C address (\`i2cAddress != "0x3C" && i2cAddress != "0x3D"\` → "no-response", not burned).
- notes: 1-2 sentence plain-English summary.

**Make components feel REAL.** For an I2C OLED (SSD1306), include the I2C address selector, treat \`text\` as the buffer being displayed, and tag the screen rect with \`data-screen="true"\` so the simulator can draw the text on it. For LCDs, expose line1/line2. For 7-segments, expose the digit. The user must be able to type into the params and see the display change instantly.

Passive components (resistor, capacitor, switch, button) can have empty behavior or just one state.

- behaviorNotes: 1-3 sentence summary describing real-world part, voltage range, communication protocol (I2C/SPI/PWM/analog), and typical wiring.
- Always emit the tool when the user says "build", "save", "generate", "create it", or after one or two clarifying turns.

Reply in plain text for chat turns; only call the tool when finalizing.`;

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface AIChatResult {
  reply: string;
  spec: (ComponentSpec & { svg: string }) | null;
}

export async function runBuilderChat(
  history: ChatMessage[],
  userMessage: string,
): Promise<AIChatResult> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    return {
      reply: "Lovable AI is not configured. Please enable the AI Gateway.",
      spec: null,
    };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userMessage },
  ];

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages,
      tools: [COMPONENT_SPEC_TOOL],
      tool_choice: "auto",
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 429) {
      return { reply: "AI rate limit reached — please wait a moment and retry.", spec: null };
    }
    if (res.status === 402) {
      return {
        reply: "AI credits exhausted. Add funds in Settings → Workspace → Usage.",
        spec: null,
      };
    }
    console.error("AI gateway error", res.status, text);
    return { reply: `AI gateway error (${res.status})`, spec: null };
  }

  const data = (await res.json()) as {
    choices: Array<{
      message: {
        role: string;
        content: string | null;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
  const msg = data.choices?.[0]?.message;
  const toolCall = msg?.tool_calls?.find((t) => t.function?.name === "emit_component_spec");

  if (toolCall) {
    try {
      const args = JSON.parse(toolCall.function.arguments) as ComponentSpec & { svg: string };
      return {
        reply:
          msg?.content?.toString().trim() ||
          `Designed **${args.name}** with ${args.pins.length} pins. Save to the library?`,
        spec: args,
      };
    } catch (e) {
      console.error("Failed to parse component spec args", e);
    }
  }

  return {
    reply: msg?.content?.toString() ?? "(no response)",
    spec: null,
  };
}

// ----- DB helpers -----

export async function dbListComponents() {
  const { data, error } = await supabaseAdmin
    .from("custom_components")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function dbGetComponent(id: string) {
  const { data, error } = await supabaseAdmin
    .from("custom_components")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export async function dbSaveComponent(spec: ComponentSpec & { svg: string }) {
  const row = {
    name: spec.name,
    slug: spec.slug,
    kind: spec.kind,
    description: spec.description ?? "",
    svg: spec.svg ?? "",
    spec: spec as unknown as never,
    behavior: spec.behaviorNotes ?? "",
  };
  // Upsert by slug
  const { data: existing } = await supabaseAdmin
    .from("custom_components")
    .select("id, version")
    .eq("slug", spec.slug)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabaseAdmin
      .from("custom_components")
      .update({ ...row, version: (existing.version ?? 1) + 1 } as never)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabaseAdmin
    .from("custom_components")
    .insert(row as never)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function dbDeleteComponent(id: string) {
  const { error } = await supabaseAdmin.from("custom_components").delete().eq("id", id);
  if (error) throw error;
  return { ok: true };
}
