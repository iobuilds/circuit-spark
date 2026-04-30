// Component pack ZIP utilities — runs in the browser.
// A pack contains:
//   manifest.json   — full spec including structured behavior model
//   svg/main.svg    — the component artwork
//   behavior.js     — optional JS notes (text, not executed)
//   assets/         — optional extra images
//   README.md       — human-friendly summary

import JSZip from "jszip";

export interface ComponentPin {
  id: string;
  label: string;
  x: number;
  y: number;
  role?: string;
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

export interface ComponentBehavior {
  params?: BehaviorParam[];
  states?: Array<{
    id: string;
    label: string;
    when?: string;
    visual?: Record<string, unknown>;
  }>;
  failures?: Array<{ when: string; state: string; reason: string }>;
  notes?: string;
}

export interface CustomComponentRow {
  id: string;
  name: string;
  slug: string;
  kind: "component" | "board";
  description: string | null;
  svg: string;
  spec: {
    width: number;
    height: number;
    pins: ComponentPin[];
    defaults?: Record<string, string | number | boolean>;
    behaviorNotes?: string;
    behavior?: ComponentBehavior;
  };
  behavior: string | null;
  version: number;
  thumbnail_url?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ImportedComponent {
  name: string;
  slug: string;
  kind: "component" | "board";
  description: string;
  svg: string;
  width: number;
  height: number;
  pins: ComponentPin[];
  defaults?: Record<string, string | number | boolean>;
  behaviorNotes?: string;
  behavior?: ComponentBehavior;
}

export async function exportComponentZip(comp: CustomComponentRow): Promise<Blob> {
  const zip = new JSZip();
  const spec = comp.spec ?? { width: 100, height: 80, pins: [] };

  const manifest = {
    formatVersion: 2,
    exportedAt: new Date().toISOString(),
    name: comp.name,
    slug: comp.slug,
    kind: comp.kind,
    description: comp.description ?? "",
    version: comp.version,
    width: spec.width ?? 100,
    height: spec.height ?? 80,
    pins: spec.pins ?? [],
    defaults: spec.defaults ?? {},
    behaviorNotes: spec.behaviorNotes ?? comp.behavior ?? "",
    behavior: spec.behavior ?? null,
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip
    .folder("svg")
    ?.file("main.svg", wrapAsStandaloneSvg(comp.svg, manifest.width, manifest.height));
  zip.file(
    "behavior.js",
    `// Behavior notes for ${comp.name}\n// ${manifest.behaviorNotes}\n` +
      (manifest.behavior
        ? `\n/* structured behavior:\n${JSON.stringify(manifest.behavior, null, 2)}\n*/\n`
        : ""),
  );
  zip.folder("assets");
  zip.file(
    "README.md",
    `# ${comp.name}\n\n${comp.description ?? ""}\n\n**Kind:** ${comp.kind}\n**Version:** ${comp.version}\n\n**Pins:** ${manifest.pins
      .map((p) => `\`${p.id}\` (${p.label})`)
      .join(", ")}\n\nExported from EmbedSim Admin.\n`,
  );

  return zip.generateAsync({ type: "blob" });
}

export async function importComponentZip(file: File | Blob): Promise<ImportedComponent> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (e) {
    throw new Error(`Not a valid ZIP archive: ${(e as Error).message}`);
  }
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("Missing manifest.json in pack");
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(await manifestEntry.async("string"));
  } catch (e) {
    throw new Error(`manifest.json is not valid JSON: ${(e as Error).message}`);
  }

  // SVG can live in a few places depending on which exporter produced the pack.
  const svgEntry =
    zip.file("svg/main.svg") ??
    zip.file("main.svg") ??
    zip.file("svg/component.svg") ??
    zip.file("component.svg");
  let svgInner = "";
  if (svgEntry) {
    const raw = await svgEntry.async("string");
    svgInner = unwrapStandaloneSvg(raw);
  } else if (typeof manifest.svg === "string") {
    svgInner = unwrapStandaloneSvg(manifest.svg as string);
  }
  if (!svgInner) {
    throw new Error("Pack has no SVG (svg/main.svg or manifest.svg required)");
  }

  const m = manifest as {
    name?: string;
    slug?: string;
    kind?: string;
    description?: string;
    width?: number;
    height?: number;
    pins?: unknown;
    defaults?: Record<string, string | number | boolean>;
    behaviorNotes?: string;
    behavior?: ComponentBehavior;
  };

  return {
    name: String(m.name ?? "Imported"),
    slug: String(m.slug ?? slugify(m.name ?? "imported")),
    kind: m.kind === "board" ? "board" : "component",
    description: String(m.description ?? ""),
    svg: svgInner,
    width: Number(m.width ?? 100),
    height: Number(m.height ?? 80),
    pins: Array.isArray(m.pins) ? (m.pins as ComponentPin[]) : [],
    defaults: m.defaults ?? {},
    behaviorNotes: String(m.behaviorNotes ?? ""),
    behavior: m.behavior ?? undefined,
  };
}

function wrapAsStandaloneSvg(inner: string, width: number, height: number): string {
  // If the inner already starts with <svg ...>, return it unchanged.
  if (/^\s*<svg[\s>]/i.test(inner)) return inner;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${inner}\n</svg>`;
}

function unwrapStandaloneSvg(raw: string): string {
  const match = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return match ? match[1].trim() : raw.trim();
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
