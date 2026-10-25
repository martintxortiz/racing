"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMenu } from "@/state/menu";
import type { MenuItem } from "@/menus/types";
import { tidy } from "@/menus/types";
import { IconCheck, IconChevronRight } from "./icons";
import css from "./Menu.module.css";

/** One menu list; submenus open to the side on hover or arrow right. */
function MenuList({ items, x, y, altX, title, onDone, depth, onBack }: { items: MenuItem[]; x: number; y: number; altX?: number; title?: string; onDone: () => void; depth: number; onBack?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<{ index: number; x: number; y: number; altX: number } | null>(null);
  const list = tidy(items);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (nx + r.width > vw - 4) nx = altX != null ? altX - r.width + 2 : vw - r.width - 4;
    if (ny + r.height > vh - 4) ny = Math.max(4, vh - r.height - 4);
    setPos({ x: Math.max(4, nx), y: ny });
  }, [x, y, altX]);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  const openSub = (i: number) => {
    const el = ref.current?.querySelectorAll<HTMLElement>("[data-idx]")[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSub({ index: i, x: r.right - 2, y: r.top - 5, altX: ref.current!.getBoundingClientRect().left });
  };

  const actionable = list.map((it, i) => ((it.kind === undefined || it.kind === "item" || it.kind === "sub") && !("disabled" in it && it.disabled) ? i : -1)).filter((i) => i >= 0);

  const onKey = (e: React.KeyboardEvent) => {
    if (sub) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const k = actionable.indexOf(active);
      const next = e.key === "ArrowDown" ? actionable[(k + 1) % actionable.length] : actionable[(k - 1 + actionable.length) % actionable.length];
      setActive(next ?? -1);
    } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      const it = list[active];
      if (!it) return;
      if (it.kind === "sub") openSub(active);
      else if ((it.kind === undefined || it.kind === "item") && e.key !== "ArrowRight") {
        onDone();
        it.run();
      }
    } else if (e.key === "ArrowLeft" && onBack) {
      e.preventDefault();
      onBack();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (onBack) onBack();
      else onDone();
    }
  };

  const subItem = sub ? list[sub.index] : null;
  return (
    <>
      <div ref={ref} className={css.menu} style={{ left: pos.x, top: pos.y }} role="menu" tabIndex={-1} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()} data-menu>
        {title && <div className={css.title}>{title}</div>}
        {list.map((it, i) => {
          if (it.kind === "sep") return <div key={`s${i}`} className={css.sep} />;
          if (it.kind === "label") return <div key={`l${i}`} className={css.group}>{it.label}</div>;
          const isSub = it.kind === "sub";
          return (
            <button
              key={it.id}
              data-idx={i}
              className={css.item}
              role="menuitem"
              disabled={it.disabled}
              data-active={active === i || sub?.index === i}
              data-danger={!isSub && it.danger}
              onMouseEnter={() => {
                setActive(i);
                if (isSub) openSub(i);
                else setSub(null);
              }}
              onClick={() => {
                if (isSub) return openSub(i);
                onDone();
                it.run();
              }}
            >
              <span className={css.check}>{!isSub && it.checked ? <IconCheck size={14} /> : null}</span>
              {!isSub && it.swatch && <span className={css.swatch} style={{ background: it.swatch }} />}
              <span className={css.label}>{it.label}</span>
              {!isSub && it.hint && <span className={`${css.hint} num`}>{it.hint}</span>}
              {isSub && <IconChevronRight size={14} />}
            </button>
          );
        })}
      </div>
      {sub && subItem?.kind === "sub" && (
        <MenuList
          key={sub.index}
          items={subItem.items}
          x={sub.x}
          y={sub.y}
          altX={sub.altX}
          depth={depth + 1}
          onDone={onDone}
          onBack={() => {
            setSub(null);
            ref.current?.focus();
          }}
        />
      )}
    </>
  );
}

export function ContextMenu() {
  const open = useMenu((s) => s.open);
  const close = useMenu((s) => s.close);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-menu]")) close();
    };
    const blur = () => close();
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
    };
  }, [open, close]);
  if (!open) return null;
  return <MenuList key={`${open.x},${open.y},${open.items.length}`} items={open.items} x={open.x} y={open.y} title={open.title} onDone={close} depth={0} />;
}
