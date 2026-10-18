import React from "react";
import DashboardSidebar from "@/components/dashboard/dashboard-sidebar";

const DashboardLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <DashboardSidebar />
      {children}
    </div>
  );
};

export default DashboardLayout;
