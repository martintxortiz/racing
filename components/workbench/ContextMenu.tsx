"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { closeMenu, useWB, type MenuItem } from "./state";

/** One floating menu for the whole workbench (right-click, ⋯, chips, layout). */
export function ContextMenu() {
  const menu = useWB((s) => s.menu);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(menu.x, window.innerWidth - r.width - 4)),
      y: Math.max(4, Math.min(menu.y, window.innerHeight - r.height - 4)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeMenu();
    };
    const blur = () => closeMenu();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
    };
  }, [menu]);

  if (!menu) return null;
  return (
    <div
      ref={ref}
      className="wb-menu"
      role="menu"
      style={{ left: pos?.x ?? menu.x, top: pos?.y ?? menu.y, visibility: pos ? "visible" : "hidden" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {menu.items.map((it, i) => <Item key={i} it={it} />)}
    </div>
  );
}

function Item({ it }: { it: MenuItem }) {
  if ("separator" in it) return <div className="wb-menu__sep" role="separator" />;
  if ("heading" in it) return <div className="wb-menu__heading">{it.heading}</div>;
  return (
    <button
      type="button"
      role="menuitem"
      className="wb-menu__item"
      disabled={it.disabled}
      onClick={() => {
        closeMenu();
        it.onSelect();
      }}
    >
      <span className="wb-menu__check">{it.checked ? <span className="pw-icon pw-icon--checkmark" /> : null}</span>
      <span className="wb-menu__label">{it.label}</span>
      {it.hint ? <span className="wb-menu__hint">{it.hint}</span> : null}
    </button>
  );
}
