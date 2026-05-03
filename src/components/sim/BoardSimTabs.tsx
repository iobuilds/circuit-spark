import { useSimStore } from "@/sim/store";
import { useEffect } from "react";

/**
 * Tab strip listing all placed boards. Lets the user switch which board's
 * Pin States + Serial output are shown in the bottom panels.
 *
 * Hidden when there is only one (or zero) board on the canvas.
 */
export function BoardSimTabs() {
  const components = useSimStore((s) => s.components);
  const active = useSimStore((s) => s.activeSimBoardId);
  const setActive = useSimStore((s) => s.setActiveSimBoard);
  const statusByBoard = useSimStore((s) => s.statusByBoard);

  const boards = components.filter((c) => c.kind === "board");

  // Auto-pick the first board whenever the active id is missing or stale.
  useEffect(() => {
    if (boards.length === 0) {
      if (active !== null) setActive(null);
      return;
    }
    if (!active || !boards.some((b) => b.id === active)) {
      setActive(boards[0].id);
    }
  }, [boards, active, setActive]);

  if (boards.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/20 text-xs overflow-x-auto scrollbar-thin">
      <span className="text-muted-foreground mr-1 shrink-0">Board:</span>
      {boards.map((b, idx) => {
        const isActive = b.id === active;
        const st = statusByBoard[b.id] ?? "idle";
        const dot = st === "running" ? "bg-success animate-pulse"
          : st === "error" ? "bg-destructive"
          : st === "paused" ? "bg-warning"
          : "bg-muted-foreground/50";
        const label = String(b.props.boardId ?? "uno").toUpperCase();
        return (
          <button
            key={b.id}
            onClick={() => setActive(b.id)}
            className={`shrink-0 px-2 py-0.5 rounded font-mono flex items-center gap-1.5 transition-colors ${
              isActive
                ? "bg-primary/15 text-foreground border border-primary/40"
                : "text-muted-foreground hover:text-foreground hover:bg-accent border border-transparent"
            }`}
            title={`${label} sketch on board #${idx + 1}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
            {label} #{idx + 1}
          </button>
        );
      })}
    </div>
  );
}
