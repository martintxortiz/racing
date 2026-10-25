"use client";
import type { ReactNode } from "react";
import type { Entity } from "@/derive/model";
import { useApp } from "@/state/app";
import { onColour, teamFill, TYRE } from "./colour";
import css from "./cells.module.css";

export type Tone = "none" | "sb" | "pb" | "good" | "bad" | "warn" | "info" | "neutral" | "flagYellow" | "flagRed" | "flagGreen" | "flagBlue" | "chequered";

/** A value in a table cell. Highlighted or not, it keeps the same box so columns align. */
export function Pill({ tone = "none", children, title, muted, block, style }: { tone?: Tone; children: ReactNode; title?: string; muted?: boolean; block?: boolean; style?: React.CSSProperties }) {
  const cls = [css.pill, tone !== "none" ? css[tone] : "", muted && tone === "none" ? css.muted : "", block ? css.block : ""].join(" ");
  return (
    <span className={cls} title={title} style={style}>
      {children}
    </span>
  );
}

/** Driver code on the team colour, in the same pill as every other highlighted value. */
export function DriverChip({ entity, title }: { entity: Entity; title?: string }) {
  const dark = useApp((s) => s.theme === "dark");
  const fill = teamFill(entity.colour, dark);
  return (
    <span className={`${css.pill} ${css.driver}`} style={{ background: fill, color: onColour(fill) }} title={title ?? `${entity.name}${entity.team ? ` · ${entity.team}` : ""}`}>
      {entity.code}
    </span>
  );
}

/** Compound ring with its letter: fixed width, centred in its column. */
export function TyreGlyph({ compound }: { compound: string | null }) {
  if (!compound) return <span className={css.muted}>—</span>;
  const ty = TYRE[compound];
  return (
    <span className={css.tyre} style={{ ["--c" as string]: ty?.css ?? "var(--text-3)" }} title={compound.charAt(0) + compound.slice(1).toLowerCase()}>
      {ty?.short ?? compound[0]}
    </span>
  );
}

/** Tone for a timed value: session best, personal best, or nothing. */
export function markTone(m: "sb" | "pb" | "good" | "bad" | null | undefined): Tone {
  return m ?? "none";
}
