import { entityMenu, entityTitle } from "@/menus/build";
import { sep, type MenuItem } from "@/menus/types";
import { openMenu } from "@/state/menu";
import { useApp } from "@/state/app";
import { useCursor } from "@/state/cursor";

/** Click on an entity: plain click focuses, shift/cmd click sets the comparison. */
export function selectEntity(id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
  const st = useApp.getState();
  if (e.shiftKey || e.metaKey || e.ctrlKey) st.setCompare(st.compare === id ? null : id);
  else st.setFocus(id);
}

export function entityMenuItems(id: string, extra: MenuItem[] = []): MenuItem[] {
  const st = useApp.getState();
  const s = st.session;
  const e = s?.entityById.get(id);
  if (!s || !e) return extra;
  const laps = s.lapsByEntity.get(id) ?? [];
  const valid = laps.filter((l) => l.valid);
  const best = valid.reduce<(typeof valid)[number] | null>((m, l) => (!m || (l.time ?? Infinity) < (m.time ?? Infinity) ? l : m), null);
  return [
    ...entityMenu({
      entity: e,
      focus: st.focus,
      compare: st.compare,
      laps,
      bestLap: best,
      act: {
        focus: (lap) => st.setFocus(id, lap),
        compare: (lap) => st.setCompare(id, lap),
        clearCompare: () => st.setCompare(null),
        swap: () => st.swapSelection(),
        jump: (t) => useCursor.getState().setT(t),
      },
    }),
    ...(extra.length ? [sep, ...extra] : []),
  ];
}

export function openEntityMenu(e: React.MouseEvent | MouseEvent, id: string, extra: MenuItem[] = []) {
  const s = useApp.getState().session;
  const ent = s?.entityById.get(id);
  openMenu(e, entityMenuItems(id, extra), ent ? entityTitle(ent) : undefined);
}
