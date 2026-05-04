import type { CircuitComponent } from "./types";
import { COMPONENT_DEFS } from "./components";
import { UNO_WIDTH, UNO_HEIGHT } from "./uno-pins";

interface Box { id: string; x: number; y: number; w: number; h: number; }

function bbox(c: CircuitComponent): Box {
  if (c.kind === "board") {
    // Generic board fallback uses ComponentDef size; Uno uses real PCB size.
    const boardId = (c.props as { boardId?: string } | undefined)?.boardId;
    const w = boardId === "uno" ? UNO_WIDTH : COMPONENT_DEFS.board.width;
    const h = boardId === "uno" ? UNO_HEIGHT : COMPONENT_DEFS.board.height;
    return { id: c.id, x: c.x, y: c.y, w, h };
  }
  const def = COMPONENT_DEFS[c.kind];
  return { id: c.id, x: c.x, y: c.y, w: def?.width ?? 80, h: def?.height ?? 80 };
}

function overlaps(a: Box, b: Box, gap: number): boolean {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

const snap = (n: number) => Math.round(n / 10) * 10;

/**
 * Reposition components so every pair has at least `gap` units of clearance.
 * Boards stay anchored — peripherals shuffle around them. Within peripherals,
 * earlier-listed components stay put and later ones move to the first spot
 * that clears every previously-placed box.
 */
export function autoSpaceComponents(
  components: CircuitComponent[],
  gap: number,
): CircuitComponent[] {
  if (components.length === 0) return components;
  const boxes = components.map(bbox);
  const boards = boxes.filter((b, i) => components[i].kind === "board");
  const placed: Box[] = [...boards];

  // Stack boards vertically if they would overlap.
  for (let i = 1; i < boards.length; i++) {
    const cur = boards[i];
    let safe = false;
    while (!safe) {
      safe = true;
      for (let j = 0; j < i; j++) {
        if (overlaps(cur, boards[j], gap)) {
          cur.y = boards[j].y + boards[j].h + gap;
          cur.x = boards[j].x;
          safe = false;
          break;
        }
      }
    }
  }

  // Determine the right edge of the rightmost board — peripherals start there.
  const boardRight = boards.length
    ? Math.max(...boards.map((b) => b.x + b.w))
    : 0;
  const boardTop = boards.length ? Math.min(...boards.map((b) => b.y)) : 0;
  const startX = snap(boardRight + gap);
  const startY = snap(boardTop);

  for (let i = 0; i < boxes.length; i++) {
    if (components[i].kind === "board") continue;
    const cur = boxes[i];

    // Try the original position first; only relocate if it collides.
    const fits = (b: Box) => placed.every((p) => !overlaps(b, p, gap));
    if (fits(cur)) {
      placed.push(cur);
      continue;
    }

    // Sweep a column downward to the right of the board, then wrap to a
    // new column. Coordinates snap to a 10-unit grid.
    let col = 0;
    let placedThis = false;
    const colStep = snap(Math.max(cur.w, 100) + gap);
    const rowStep = snap(Math.max(cur.h, 80) + gap);
    while (!placedThis && col < 12) {
      const x = startX + col * colStep;
      let y = startY;
      for (let row = 0; row < 30; row++) {
        const trial: Box = { ...cur, x: snap(x), y: snap(y) };
        if (fits(trial)) {
          cur.x = trial.x;
          cur.y = trial.y;
          placed.push(cur);
          placedThis = true;
          break;
        }
        y += rowStep;
      }
      col++;
    }
    if (!placedThis) placed.push(cur); // fallback — keep last try
  }

  return components.map((c, i) => ({ ...c, x: boxes[i].x, y: boxes[i].y }));
}
