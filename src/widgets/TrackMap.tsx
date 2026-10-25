"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { dominance, outlinePoint, poseAt } from "@/derive/trace";
import { sep, type MenuItem } from "@/menus/types";
import { useApp } from "@/state/app";
import { useHover } from "@/state/cursor";
import { openMenu } from "@/state/menu";
import { openEntityMenu, selectEntity } from "@/ui/actions";
import { ask } from "@/ui/Dialogs";
import { usePanel } from "@/ui/panelContext";
import { FS, useChartTheme } from "@/charts/theme";
import { poseTopic, useSelection, useT, useTiming, useTopics } from "./hooks";
import { useSelectionTraces } from "./traces";
import type { WidgetDef, WidgetProps } from "./types";
import css from "./map.module.css";

export interface MapConfig {
  colourBy?: "none" | "dominance";
  /** "auto" (default) turns the circuit to fill the panel; a number fixes the angle in degrees. */
  rotate?: number | "auto";
  labels?: "all" | "selected" | "none";
  corners?: boolean;
}

interface XF {
  px: (x: number, y: number) => number;
  py: (x: number, y: number) => number;
}

/** Rotate, fit with padding and flip y so the outline fills the panel. */
function makeXf(xs: Float64Array, ys: Float64Array, w: number, h: number, rot: number, pad: number): XF {
  const r = (rot * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const X = xs[i] * cos - ys[i] * sin;
    const Y = xs[i] * sin + ys[i] * cos;
    x0 = Math.min(x0, X); x1 = Math.max(x1, X);
    y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  const k = Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1));
  const ox = (w - (x1 - x0) * k) / 2;
  const oy = (h - (y1 - y0) * k) / 2;
  return {
    px: (x, y) => ox + (x * cos - y * sin - x0) * k,
    py: (x, y) => h - oy - (x * sin + y * cos - y0) * k,
  };
}

const FIT_PAD = 24;

/** Scale at which the outline, turned by `deg`, fits a w x h box with padding. */
function fitScale(xs: ArrayLike<number>, ys: ArrayLike<number>, deg: number, w: number, h: number, pad: number): number {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < xs.length; i++) {
    const X = xs[i] * cos - ys[i] * sin;
    const Y = xs[i] * sin + ys[i] * cos;
    if (X < x0) x0 = X;
    if (X > x1) x1 = X;
    if (Y < y0) y0 = Y;
    if (Y > y1) y1 = Y;
  }
  return Math.min((w - 2 * pad) / (x1 - x0 || 1), (h - 2 * pad) / (y1 - y0 || 1));
}

/**
 * The rotation that draws the circuit largest in the panel: every whole degree in a half turn
 * (a bounding box repeats every 180°), seeded with the outline's principal axis laid along the
 * panel's long side. Near-ties (within 3 %) go to the angle closest to the file's own orientation,
 * so the map does not flip between equally good fits as the panel is resized.
 */
export function bestRotation(xs: ArrayLike<number>, ys: ArrayLike<number>, w: number, h: number, pad = FIT_PAD): number {
  if (xs.length < 3 || w <= 2 * pad || h <= 2 * pad) return 0;
  // Score on at most ~400 points; the bounding box barely moves.
  const stride = Math.max(1, Math.floor(xs.length / 400));
  const sx: number[] = [];
  const sy: number[] = [];
  for (let i = 0; i < xs.length; i += stride) {
    sx.push(xs[i]);
    sy.push(ys[i]);
  }
  // Principal axis of the outline.
  let mx = 0, my = 0;
  for (let i = 0; i < sx.length; i++) { mx += sx[i]; my += sy[i]; }
  mx /= sx.length; my /= sx.length;
  let cxx = 0, cyy = 0, cxy = 0;
  for (let i = 0; i < sx.length; i++) {
    const dx = sx[i] - mx, dy = sy[i] - my;
    cxx += dx * dx; cyy += dy * dy; cxy += dx * dy;
  }
  const axis = (0.5 * Math.atan2(2 * cxy, cxx - cyy) * 180) / Math.PI;
  // Turning by -axis lays the long axis along x; add 90° for a tall panel.
  const pca = -axis + (h > w ? 90 : 0);
  const candidates = [pca];
  for (let d = -90; d < 90; d++) candidates.push(d);
  const norm = (d: number) => ((((d + 90) % 180) + 180) % 180) - 90;
  let best = 0;
  let bestK = -Infinity;
  const ks = candidates.map((d) => ({ d: norm(d), k: fitScale(sx, sy, d, w, h, pad) }));
  for (const c of ks) if (c.k > bestK) { bestK = c.k; best = c.d; }
  // Prefer the smallest turn among near-ties.
  for (const c of ks) if (c.k >= bestK * 0.97 && Math.abs(c.d) < Math.abs(best)) best = c.d;
  return Math.round(best * 10) / 10;
}

function TrackMap({ session, config, setConfig, width, height }: WidgetProps<MapConfig>) {
  const t = useT(20);
  const th = useChartTheme();
  const theme = useApp((s) => s.theme);
  const hoverD = useHover((s) => s.d);
  const panel = usePanel();
  const sel = useSelection(session, t);
  const focus = sel.a?.entity ?? null;
  const compare = sel.b?.entity ?? null;
  const explicit = !sel.auto;
  const timing = useTiming(session, t);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hits = useRef<{ id: string; x: number; y: number }[]>([]);
  const [hoverCar, setHoverCar] = useState<string | null>(null);
  const colourBy = config.colourBy ?? "dominance";
  const labels = config.labels ?? "all";
  const auto = config.rotate == null || config.rotate === "auto";

  const poseTopics = useMemo(() => session.entities.map((e) => poseTopic(e.id)).filter((x): x is string => !!x), [session]);
  const { cols } = useTopics(poseTopics);
  const traces = useSelectionTraces(session, colourBy === "dominance" ? sel : { a: null, b: null, auto: false }, []);
  const dom = useMemo(() => (traces.a?.trace && traces.b?.trace ? dominance(traces.a.trace, traces.b.trace, 30) : null), [traces.a, traces.b]);

  const o = session.outline;
  // Re-fit on resize; the angle only depends on the panel's shape, so round it to keep the memo warm.
  const shape = Math.round((width / Math.max(1, height)) * 50) / 50;
  const autoRot = useMemo(() => (o && auto ? bestRotation(o.x, o.y, 1000 * shape, 1000) : 0), [o, auto, shape]);
  const rot = auto ? autoRot : (config.rotate as number);
  const xf = useMemo(() => (o ? makeXf(o.x, o.y, width, height, rot, FIT_PAD) : null), [o, width, height, rot]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !o || !xf) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(width * dpr);
    cv.height = Math.round(height * dpr);
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    const P = (x: number, y: number): [number, number] => [xf.px(x, y), xf.py(x, y)];
    const path = (i0: number, i1: number) => {
      g.beginPath();
      for (let i = i0; i <= i1; i++) {
        const [X, Y] = P(o.x[i], o.y[i]);
        if (i === i0) g.moveTo(X, Y);
        else g.lineTo(X, Y);
      }
    };
    // Track body.
    g.lineJoin = "round";
    g.lineCap = "round";
    path(0, o.x.length - 1);
    g.closePath();
    g.strokeStyle = theme === "dark" ? "#333333" : "#e0e0e0";
    g.lineWidth = 9;
    g.stroke();
    g.strokeStyle = theme === "dark" ? "#525252" : "#a8a8a8";
    g.lineWidth = 1.5;
    g.stroke();

    // Dominance overlay.
    if (dom) {
      for (const c of dom) {
        if (c.who === 0) continue;
        let i0 = -1, i1 = -1;
        for (let i = 0; i < o.d.length; i++) {
          if (o.d[i] >= c.d0 && i0 < 0) i0 = Math.max(0, i - 1);
          if (o.d[i] <= c.d1) i1 = Math.min(o.d.length - 1, i + 1);
        }
        if (i0 < 0 || i1 <= i0) continue;
        path(i0, i1);
        g.strokeStyle = c.who < 0 ? th.a : th.b;
        g.lineWidth = 4;
        g.stroke();
      }
    }

    // Start / finish.
    {
      const [X, Y] = P(o.x[0], o.y[0]);
      const [X2, Y2] = P(o.x[1], o.y[1]);
      const ang = Math.atan2(Y2 - Y, X2 - X) + Math.PI / 2;
      g.beginPath();
      g.moveTo(X - Math.cos(ang) * 8, Y - Math.sin(ang) * 8);
      g.lineTo(X + Math.cos(ang) * 8, Y + Math.sin(ang) * 8);
      g.strokeStyle = th.text;
      g.lineWidth = 2;
      g.stroke();
    }

    // Corners.
    if (config.corners !== false && session.corners.length) {
      g.font = `500 ${FS.xs}px ${th.mono}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = th.text3;
      const cx = width / 2, cy = height / 2;
      for (const c of session.corners) {
        const [X, Y] = P(c.x, c.y);
        // Push the label outward from the map centre.
        const dx = X - cx, dy = Y - cy;
        const L = Math.hypot(dx, dy) || 1;
        g.fillText(`${c.number}${c.letter ?? ""}`, X + (dx / L) * 14, Y + (dy / L) * 14);
      }
    }

    // North: the file's +y axis, turned with the map.
    {
      const r = (rot * Math.PI) / 180;
      const ux = -Math.sin(r);
      const uy = -Math.cos(r);
      const cx = width - 20, cy = 22;
      g.beginPath();
      g.arc(cx, cy, 11, 0, Math.PI * 2);
      g.strokeStyle = th.text3;
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      g.moveTo(cx + ux * 9, cy + uy * 9);
      g.lineTo(cx - uy * 3.5, cy + ux * 3.5);
      g.lineTo(cx + uy * 3.5, cy - ux * 3.5);
      g.closePath();
      g.fillStyle = th.text2;
      g.fill();
      g.font = `600 ${FS.xs}px ${th.sans}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = th.text2;
      g.fillText("N", cx + ux * 19, cy + uy * 19);
    }

    // Hover point from distance charts.
    if (hoverD != null) {
      const p = outlinePoint(o, hoverD);
      const [X, Y] = P(p.x, p.y);
      g.beginPath();
      g.arc(X, Y, 5, 0, Math.PI * 2);
      g.fillStyle = th.text;
      g.fill();
      g.strokeStyle = th.panel;
      g.lineWidth = 2;
      g.stroke();
    }

    // Cars, back to front so the leader is drawn last.
    const hl: typeof hits.current = [];
    const tags: { code: string; x: number; y: number; rank: number; colour: string; strong: boolean }[] = [];
    const rows = [...timing.rows].reverse();
    for (const r of rows) {
      const tp = poseTopic(r.entity.id);
      const p = tp ? poseAt(cols[tp], t) : null;
      if (!p) continue;
      const [X, Y] = P(p.x, p.y);
      hl.push({ id: r.entity.id, x: X, y: Y });
      const isA = r.entity.id === focus;
      const isB = r.entity.id === compare;
      const dim = explicit && (focus || compare) && !isA && !isB;
      g.globalAlpha = dim ? 0.55 : r.state === "retired" ? 0.35 : 1;
      if (isA || isB) {
        g.beginPath();
        g.arc(X, Y, 9, 0, Math.PI * 2);
        g.strokeStyle = isA ? th.a : th.b;
        g.lineWidth = 2.5;
        g.stroke();
      }
      g.beginPath();
      g.arc(X, Y, 5.5, 0, Math.PI * 2);
      g.fillStyle = r.entity.colour;
      g.fill();
      g.strokeStyle = th.panel;
      g.lineWidth = 1.5;
      g.stroke();
      const show = labels === "all" || (labels === "selected" && (isA || isB)) || hoverCar === r.entity.id;
      if (show) tags.push({ code: r.entity.code, x: X, y: Y, rank: isA || isB || hoverCar === r.entity.id ? 0 : 1, colour: isA ? th.a : isB ? th.b : th.text2, strong: isA || isB });
      g.globalAlpha = 1;
    }
    drawTags(g, tags, th.sans, th.panel, [...hl], width, height);
    hits.current = hl;
    cv.dataset.cars = String(hl.length);
    cv.dataset.rows = String(rows.length);
  }, [o, xf, rot, width, height, t, cols, timing, focus, compare, explicit, hoverD, th, theme, dom, labels, hoverCar, config.corners, session.corners]);

  const hit = (e: React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best: string | null = null;
    let bd = 12;
    for (const h of hits.current) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = h.id; }
    }
    return best;
  };

  const mapMenu = (): MenuItem[] => [
    { kind: "sub", id: "colour", label: "Colour track by", items: [
      { id: "c-none", label: "Nothing", checked: colourBy === "none", run: () => setConfig({ colourBy: "none" }) },
      { id: "c-dom", label: "Faster of A and B", checked: colourBy === "dominance", run: () => setConfig({ colourBy: "dominance" }) },
    ] },
    { kind: "sub", id: "labels", label: "Car labels", items: [
      { id: "l-all", label: "All cars", checked: labels === "all", run: () => setConfig({ labels: "all" }) },
      { id: "l-sel", label: "A and B only", checked: labels === "selected", run: () => setConfig({ labels: "selected" }) },
      { id: "l-none", label: "None", checked: labels === "none", run: () => setConfig({ labels: "none" }) },
    ] },
    { id: "corners", label: "Corner numbers", checked: config.corners !== false, run: () => setConfig({ corners: config.corners === false }) },
    { kind: "sub", id: "rotation", label: "Rotation", items: rotationMenu(config, setConfig, rot) },
  ];

  if (!o) return null;
  return (
    <div className={css.wrap}>
      <canvas
        ref={canvas}
        className={css.canvas}
        style={{ width, height, cursor: hoverCar ? "pointer" : "default" }}
        data-testid="track-map"
        onMouseMove={(e) => setHoverCar(hit(e))}
        onMouseLeave={() => setHoverCar(null)}
        onClick={(e) => {
          const id = hit(e);
          if (id) selectEntity(id, e);
        }}
        onContextMenu={(e) => {
          const id = hit(e);
          if (id) openEntityMenu(e, id, [{ kind: "sub", id: "map", label: "Map", items: mapMenu() }]);
          else openMenu(e, [...mapMenu(), sep, { kind: "sub", id: "panel", label: "Panel", items: panel.panelMenu() }], "Track map");
        }}
      />
      {dom && (
        <div className={css.legend}>
          <span className={css.key}><span className={css.swatch} style={{ background: th.a }} />{session.entityById.get(sel.a!.entity)?.code} faster</span>
          <span className={css.key}><span className={css.swatch} style={{ background: th.b }} />{session.entityById.get(sel.b!.entity)?.code} faster</span>
        </div>
      )}
    </div>
  );
}

export const mapWidget: WidgetDef<MapConfig> = {
  type: "map",
  name: "Track map",
  description: "Circuit outline with car positions, corners and where A or B is faster",
  group: "Track",
  unavailable: (s) => (s.outline ? null : "This file has no track outline topic."),
  Component: TrackMap,
  menu: ({ config, setConfig }) => [
    { id: "dom", label: "Colour by faster of A and B", checked: (config.colourBy ?? "dominance") === "dominance", run: () => setConfig({ colourBy: (config.colourBy ?? "dominance") === "dominance" ? "none" : "dominance" }) },
    { kind: "sub", id: "rotation", label: "Rotation", items: rotationMenu(config, setConfig, typeof config.rotate === "number" ? config.rotate : 0) },
  ],
};

function rotationMenu(config: MapConfig, setConfig: (c: Partial<MapConfig>) => void, current: number): MenuItem[] {
  const auto = config.rotate == null || config.rotate === "auto";
  const fixed = (d: number) => !auto && ((((config.rotate as number) % 360) + 360) % 360) === d;
  return [
    { id: "r-auto", label: "Auto-fit rotation", hint: auto ? `${Math.round(current)}°` : undefined, checked: auto, run: () => setConfig({ rotate: "auto" }) },
    sep,
    { kind: "label", label: "Fixed" },
    ...[0, 90, 180, 270].map((d) => ({ id: `r-${d}`, label: `${d}°`, checked: fixed(d), run: () => setConfig({ rotate: d }) })),
    {
      id: "r-custom",
      label: "Angle…",
      hint: !auto && ![0, 90, 180, 270].some(fixed) ? `${config.rotate}°` : undefined,
      run: async () => {
        const v = await ask("Rotation in degrees, anticlockwise", String(Math.round(current)), "Rotate");
        const n = v == null ? NaN : Number(v.replace("°", ""));
        if (Number.isFinite(n)) setConfig({ rotate: ((n % 360) + 360) % 360 });
      },
    },
    { id: "r-cw", label: "Turn 15° clockwise", run: () => setConfig({ rotate: (((Math.round(current) - 15) % 360) + 360) % 360 }) },
    { id: "r-ccw", label: "Turn 15° anticlockwise", run: () => setConfig({ rotate: (((Math.round(current) + 15) % 360) + 360) % 360 }) },
  ];
}

type Tag = { code: string; x: number; y: number; rank: number; colour: string; strong: boolean };
type Box = { x0: number; y0: number; x1: number; y1: number };

/** Car labels without overlaps: A, B and hovered first, then race order; each tries four spots or is skipped. */
function drawTags(g: CanvasRenderingContext2D, tags: Tag[], font: string, halo: string, dots: { x: number; y: number }[], width: number, height: number) {
  const placed: Box[] = dots.map((d) => ({ x0: d.x - 6, y0: d.y - 6, x1: d.x + 6, y1: d.y + 6 }));
  const hit = (b: Box) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  // Leader is last in the draw order; prefer it among equals.
  const order = tags.map((tag, i) => ({ tag, i })).sort((a, b) => a.tag.rank - b.tag.rank || b.i - a.i);
  g.textBaseline = "middle";
  g.lineWidth = 3;
  for (const { tag } of order) {
    g.font = `${tag.strong ? 600 : 500} ${FS.sm}px ${font}`;
    const w = g.measureText(tag.code).width;
    const spots = [
      [9, -8, "left"],
      [9, 8, "left"],
      [-9, -8, "right"],
      [-9, 8, "right"],
    ] as const;
    for (const [dx, dy, align] of spots) {
      const x0 = align === "left" ? tag.x + dx : tag.x + dx - w;
      const box = { x0: x0 - 1, y0: tag.y + dy - 7, x1: x0 + w + 1, y1: tag.y + dy + 7 };
      const out = box.x0 < 2 || box.x1 > width - 2 || box.y0 < 2 || box.y1 > height - 2;
      if (out || (tag.rank > 0 && hit(box))) continue;
      placed.push(box);
      g.textAlign = align;
      g.strokeStyle = halo;
      g.strokeText(tag.code, tag.x + dx, tag.y + dy);
      g.fillStyle = tag.colour;
      g.fillText(tag.code, tag.x + dx, tag.y + dy);
      break;
    }
  }
}
