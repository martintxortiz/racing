"use client";

import SidebarNav, { type SidebarItem } from "./sidebar-nav";

const PageSidebar = ({ items }: { items: SidebarItem[] }) => {
  return <SidebarNav items={items} className="p-1 border-r h-full w-50" />;
};

export default PageSidebar;
