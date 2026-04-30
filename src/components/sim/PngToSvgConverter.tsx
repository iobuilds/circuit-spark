// PNG → SVG converter. Two strategies, user picks per upload:
//   1) "Embed PNG inside SVG" — instant, exact pixels (default).
//   2) "Vector trace (potrace)" — true SVG paths, monochrome silkscreen-friendly.
// Output: an SVG string ready to feed into the existing SvgPinEditor.

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
// esm-potrace-wasm: client-side bitmap → vector path tracing.
// The default export is an async function: potrace(blobOrUrl, options) -> svg string.
import { potrace } from "esm-potrace-wasm";

type Strategy = "embed" | "trace";

interface Props {
  onSvg: (svg: string) => void;
  onCancel?: () => void;
  /** Width/height of the preview pane. */
  width?: number;
  height?: number;
}

export function PngToSvgConverter({ onSvg, onCancel, width = 800, height = 480 }: Props) {
  const [strategy, setStrategy] = useState<Strategy>("embed");
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [pngDims, setPngDims] = useState<{ w: number; h: number } | null>(null);
  const [pngBlob, setPngBlob] = useState<Blob | null>(null);
  const [tracedSvg, setTracedSvg] = useState<string | null>(null);
  const [tracing, setTracing] = useState(false);
  const [threshold, setThreshold] = useState(180);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast.error("Please drop a PNG or JPG image");
      return;
    }
    const url = URL.createObjectURL(f);
    setPngUrl(url);
    setPngBlob(f);
    setTracedSvg(null);
    // Read intrinsic dimensions
    const img = new Image();
    img.onload = () => setPngDims({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = url;
    toast.success(`Loaded ${f.name}`);
  }, []);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) handleFile(f);
  };

  const buildEmbedSvg = (): string | null => {
    if (!pngUrl || !pngDims) return null;
    // We embed the object URL. Once the user confirms ("Use this SVG"), we
    // convert it to a data URL so the SVG is portable.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pngDims.w} ${pngDims.h}" preserveAspectRatio="xMidYMid meet"><image href="__IMG_HREF__" x="0" y="0" width="${pngDims.w}" height="${pngDims.h}" preserveAspectRatio="xMidYMid meet" /></svg>`;
  };

  const blobToDataUrl = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });

  const runTrace = async () => {
    if (!pngBlob) return;
    setTracing(true);
    try {
      const svg = await potrace(pngBlob, {
        turdsize: 2,
        alphamax: 1,
        threshold,
        optcurve: true,
        optTolerance: 0.2,
        extractcolors: false,
      });
      setTracedSvg(svg);
      toast.success("Traced to SVG paths");
    } catch (e) {
      console.error(e);
      toast.error("Tracing failed — try the embed strategy instead");
    } finally {
      setTracing(false);
    }
  };

  const accept = async () => {
    if (strategy === "embed") {
      const tmpl = buildEmbedSvg();
      if (!tmpl || !pngBlob) {
        toast.error("Upload an image first");
        return;
      }
      const dataUrl = await blobToDataUrl(pngBlob);
      onSvg(tmpl.replace("__IMG_HREF__", dataUrl));
    } else {
      if (!tracedSvg) {
        toast.error("Run trace first");
        return;
      }
      onSvg(tracedSvg);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-4 p-3 border border-border rounded-lg bg-card">
        <div className="space-y-2 min-w-[260px]">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Conversion strategy
          </Label>
          <RadioGroup
            value={strategy}
            onValueChange={(v) => setStrategy(v as Strategy)}
            className="space-y-2"
          >
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="embed" id="strat-embed" className="mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">Embed PNG inside SVG</div>
                <div className="text-xs text-muted-foreground">
                  Instant, pixel-exact. Best for board photos.
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <RadioGroupItem value="trace" id="strat-trace" className="mt-0.5" />
              <div className="text-sm">
                <div className="font-medium">Vector trace (potrace)</div>
                <div className="text-xs text-muted-foreground">
                  True SVG paths. Best for monochrome silkscreens / icons.
                </div>
              </div>
            </label>
          </RadioGroup>

          {strategy === "trace" && (
            <div className="pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Threshold</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{threshold}</span>
              </div>
              <Slider
                value={[threshold]}
                onValueChange={(v) => setThreshold(v[0] ?? 180)}
                min={0}
                max={255}
                step={1}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={runTrace}
                disabled={!pngBlob || tracing}
                className="w-full"
              >
                {tracing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Tracing…
                  </>
                ) : (
                  <>Run trace</>
                )}
              </Button>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-[300px]">
          {!pngUrl ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(false);
                handleFiles(e.dataTransfer.files);
              }}
              className={
                "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors p-8 " +
                (over ? "border-primary bg-primary/5" : "border-border bg-muted/20")
              }
              style={{ minHeight: height }}
            >
              <Upload className="h-10 w-10 text-muted-foreground" />
              <div className="text-sm font-medium">Drop a PNG/JPG image</div>
              <div className="text-xs text-muted-foreground">
                It will be converted to SVG using the selected strategy
              </div>
              <Button size="sm" className="mt-2" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1.5" /> Browse for image
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
          ) : (
            <div
              className="border border-border rounded-lg bg-muted/20 grid grid-cols-2 gap-2 p-2"
              style={{ minHeight: height }}
            >
              <PreviewPane title="Original PNG">
                <img
                  src={pngUrl}
                  alt="Source"
                  className="max-w-full max-h-full object-contain"
                />
              </PreviewPane>
              <PreviewPane
                title={strategy === "trace" ? "Traced SVG" : "SVG (embedded)"}
              >
                {strategy === "trace" ? (
                  tracedSvg ? (
                    <div
                      className="w-full h-full grid place-items-center [&>svg]:max-w-full [&>svg]:max-h-full"
                      dangerouslySetInnerHTML={{ __html: tracedSvg }}
                    />
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Click <em>Run trace</em> to vectorize.
                    </div>
                  )
                ) : (
                  <img
                    src={pngUrl}
                    alt="Embedded preview"
                    className="max-w-full max-h-full object-contain"
                  />
                )}
              </PreviewPane>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 mt-3">
            {onCancel && (
              <Button size="sm" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-1.5" /> Pick different image
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button
              size="sm"
              onClick={accept}
              disabled={!pngUrl || (strategy === "trace" && !tracedSvg)}
            >
              <Check className="h-4 w-4 mr-1.5" /> Use this SVG
            </Button>
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Tip: dimensions <span className="font-mono">{pngDims ? `${pngDims.w} × ${pngDims.h}` : "—"}</span>{" "}
        become the SVG viewBox, so pin coordinates map 1:1 to the source image.
      </p>
      <span hidden>{width}</span>
    </div>
  );
}

function PreviewPane({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-background/60 border border-border p-2 flex flex-col min-h-[200px]">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
        {title}
      </div>
      <div className="flex-1 grid place-items-center overflow-hidden">{children}</div>
    </div>
  );
}
