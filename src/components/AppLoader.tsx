import { useEffect, useState } from "react";

export function AppLoader() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const onReady = () => {
      setFading(true);
      setTimeout(() => setVisible(false), 400);
    };
    if (document.readyState === "complete") {
      // give React a tick to mount
      setTimeout(onReady, 250);
    } else {
      window.addEventListener("load", onReady, { once: true });
      return () => window.removeEventListener("load", onReady);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden={fading}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background transition-opacity duration-400 ${
        fading ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin" />
      </div>
      <p className="mt-6 text-sm font-medium text-foreground">Loading EmbedSim…</p>
      <p className="mt-1 text-xs text-muted-foreground">Preparing your workspace</p>
    </div>
  );
}
