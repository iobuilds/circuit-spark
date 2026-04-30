// Component pack ZIP utilities — runs in the browser.
// A pack contains:
//   manifest.json   — { name, slug, kind, description, version, width, height, pins, defaults, behaviorNotes }
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
}

export async function exportComponentZip(comp: CustomComponentRow): Promise<Blob> {
  const zip = new JSZip();

  const manifest = {
    name: comp.name,
    slug: comp.slug,
    kind: comp.kind,
    description: comp.description ?? "",
    version: comp.version,
    width: comp.spec?.width ?? 100,
    height: comp.spec?.height ?? 80,
    pins: comp.spec?.pins ?? [],
    defaults: comp.spec?.defaults ?? {},
    behaviorNotes: comp.spec?.behaviorNotes ?? comp.behavior ?? "",
    exportedAt: new Date().toISOString(),
    formatVersion: 1,
  };

  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.folder("svg")?.file("main.svg", wrapAsStandaloneSvg(comp.svg, manifest.width, manifest.height));
  zip.file("behavior.js", `// Behavior notes for ${comp.name}\n// ${manifest.behaviorNotes}\n`);
  zip.folder("assets");
  zip.file(
    "README.md",
    `# ${comp.name}\n\n${comp.description ?? ""}\n\n**Pins:** ${manifest.pins
      .map((p) => `\`${p.id}\` (${p.label})`)
      .join(", ")}\n\nExported from EmbedSim Admin.\n`,
  );

  return zip.generateAsync({ type: "blob" });
}

export async function importComponentZip(file: File | Blob): Promise<ImportedComponent> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("Missing manifest.json in pack");
  const manifest = JSON.parse(await manifestEntry.async("string"));

  const svgEntry = zip.file("svg/main.svg") ?? zip.file("main.svg");
  let svgInner = "";
  if (svgEntry) {
    const raw = await svgEntry.async("string");
    svgInner = unwrapStandaloneSvg(raw);
  }

  return {
    name: String(manifest.name ?? "Imported"),
    slug: String(manifest.slug ?? slugify(manifest.name ?? "imported")),
    kind: manifest.kind === "board" ? "board" : "component",
    description: String(manifest.description ?? ""),
    svg: svgInner,
    width: Number(manifest.width ?? 100),
    height: Number(manifest.height ?? 80),
    pins: Array.isArray(manifest.pins) ? manifest.pins : [],
    defaults: manifest.defaults ?? {},
    behaviorNotes: String(manifest.behaviorNotes ?? ""),
  };
}

function wrapAsStandaloneSvg(inner: string, width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">\n${inner}\n</svg>`;
}

function unwrapStandaloneSvg(raw: string): string {
  // Extract content between <svg ...> and </svg>
  const match = raw.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
  return match ? match[1].trim() : raw;
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
