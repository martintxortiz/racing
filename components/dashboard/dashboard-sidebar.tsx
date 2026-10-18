"use client";

import {
  ChartRelationship,
  Grid,
  Notification,
  PackageLibrary,
  Plan,
  Search,
  Template,
  Tools,
} from "@carbon/icons-react";

import { Button } from "../ui/button";
import AccountMenu from "./account-menu";
import SidebarNav from "./sidebar-nav";

const sidebarLinks = [
  { href: "/dashboard", icon: <Grid className="size-4" />, exact: true },
  { href: "/dashboard/search", icon: <Search className="size-4" /> },
  { href: "/dashboard/library", icon: <PackageLibrary className="size-4" /> },
  {
    href: "/dashboard/analysis",
    icon: <ChartRelationship className="size-4" />,
  },
  { href: "/dashboard/layouts", icon: <Template className="size-4" /> },
  { href: "/dashboard/setup", icon: <Tools className="size-4" /> },
  { href: "/dashboard/tracks", icon: <Plan className="size-4" /> },
];

const DashboardSidebar = () => {
  return (
    <div className="h-full w-11 shrink-0 border-r flex flex-col items-center justify-between">
      <SidebarNav items={sidebarLinks} iconOnly className="p-1" />

      <div className="p-1 flex flex-col gap-px">
        <Button variant="ghost" size="sm" className="h-9 w-9">
          <Notification className="size-4 text-foreground" />
        </Button>
        <AccountMenu />
      </div>
    </div>
  );
};

export default DashboardSidebar;
