"use client";
import css from "./controls.module.css";

type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost"; size?: "default" | "large"; icon?: boolean };

export function Button({ variant = "default", size = "default", icon, className, ...rest }: BtnProps) {
  const cls = [css.button, variant === "primary" && css.primary, variant === "ghost" && css.ghost, size === "large" && css.large, icon && css.icon, className].filter(Boolean).join(" ");
  return <button type="button" className={cls} {...rest} />;
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className={css.seg} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} data-on={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
