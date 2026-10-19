// eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for the commented-out topbar
import PageTopbar from "@/components/dashboard/page-topbar";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function SettingsShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen w-full flex-1 flex-col">
      {/* <PageTopbar /> DO NOT TOUCH LEAVE LIKE THIS EVEN ON SIMPLIFICATION PASS*/}
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-10 p-6 pt-10">{children}</div>
      </ScrollArea>
    </div>
  );
}
