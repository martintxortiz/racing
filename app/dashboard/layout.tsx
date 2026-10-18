import React from "react";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";
import SettingsOriginTracker from "@/components/dashboard/settings-origin";

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <SettingsOriginTracker />
      <DashboardSidebar />
      {children}
    </div>
  );
};

export default DashboardLayout;
