import type { Dir, LayoutNode, Path } from "./model";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Splitter {
  path: Path;
  dir: Dir;
  /** Rectangle of the split being resized. */
  area: Rect;
  /** Divider centre line, px. */
  at: number;
}

/** Pixel rectangles for every panel and splitter, with a gutter between panels. */
export function computeGeometry(root: LayoutNode | null, box: Rect, gutter: number): { panels: Map<string, Rect>; splitters: Splitter[] } {
  const panels = new Map<string, Rect>();
  const splitters: Splitter[] = [];
  const walk = (n: LayoutNode, r: Rect, path: Path) => {
    if (n.kind === "panel") {
      panels.set(n.id, r);
      return;
    }
    if (n.dir === "row") {
      const at = r.x + r.w * n.ratio;
      walk(n.a, { x: r.x, y: r.y, w: at - r.x - gutter / 2, h: r.h }, [...path, "a"]);
      walk(n.b, { x: at + gutter / 2, y: r.y, w: r.x + r.w - at - gutter / 2, h: r.h }, [...path, "b"]);
      splitters.push({ path, dir: "row", area: r, at });
    } else {
      const at = r.y + r.h * n.ratio;
      walk(n.a, { x: r.x, y: r.y, w: r.w, h: at - r.y - gutter / 2 }, [...path, "a"]);
      walk(n.b, { x: r.x, y: at + gutter / 2, w: r.w, h: r.y + r.h - at - gutter / 2 }, [...path, "b"]);
      splitters.push({ path, dir: "col", area: r, at });
    }
  };
  if (root) walk(root, box, []);
  return { panels, splitters };
}
