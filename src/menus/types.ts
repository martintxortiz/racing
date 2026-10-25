export type MenuItem =
  | {
      kind?: "item";
      id: string;
      label: string;
      hint?: string;
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
      /** Colour swatch shown before the label (team colour). */
      swatch?: string;
      run: () => void;
    }
  | { kind: "sub"; id: string; label: string; items: MenuItem[]; disabled?: boolean }
  | { kind: "sep" }
  | { kind: "label"; label: string };

export const sep: MenuItem = { kind: "sep" };

/** Drop leading, trailing and doubled separators. */
export function tidy(items: MenuItem[]): MenuItem[] {
  const out: MenuItem[] = [];
  for (const it of items) {
    if (it.kind === "sep" && (!out.length || out[out.length - 1].kind === "sep")) continue;
    out.push(it);
  }
  while (out.length && out[out.length - 1].kind === "sep") out.pop();
  return out;
}
