"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

export type SidebarItem = {
  icon: ReactNode;
  label?: string;
  href?: string;
  exact?: boolean;
  onClick?: () => void;
};

const strip = (href: string) => href.replace(/\/+$/, "");

const SidebarNav = ({
  items,
  iconOnly = false,
  className,
}: {
  items: SidebarItem[];
  iconOnly?: boolean;
  className?: string;
}) => {
  const pathname = usePathname();
  const activeHref = items
    .flatMap((item) => {
      if (!item.href) return [];
      const href = strip(item.href);
      const matches =
        pathname === href || (!item.exact && pathname.startsWith(`${href}/`));
      return matches ? [href] : [];
    })
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className={cn("flex flex-col gap-px", className)}>
      {items.map((item) => {
        const isActive = item.href ? strip(item.href) === activeHref : false;
        const buttonClassName = cn(
          "h-9",
          iconOnly ? "w-9" : "w-full justify-start gap-2.5",
          isActive && "bg-primary/20 text-foreground hover:bg-primary/30",
        );
        const content = (
          <>
            {item.icon}
            {item.label ? (
              <span className="text-[16px] font-normal">{item.label}</span>
            ) : null}
          </>
        );
        const key = item.href ?? item.label;

        return item.href ? (
          <Link
            key={key}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
          >
            <Button variant="ghost" size="sm" className={buttonClassName}>
              {content}
            </Button>
          </Link>
        ) : (
          <Button
            key={key}
            variant="ghost"
            size="sm"
            onClick={item.onClick}
            className={buttonClassName}
          >
            {content}
          </Button>
        );
      })}
    </div>
  );
};

export default SidebarNav;
