import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const AVATAR_SRC = "https://api.dicebear.com/10.x/loops/svg?seed=f7k01ooo";

export default function AccountAvatar({ className }: { className?: string }) {
  return (
    <Avatar
      className={cn(
        "relative inline-flex overflow-hidden rounded-[2px] border",
        className,
      )}
    >
      <AvatarFallback className="flex size-full items-center justify-center rounded-[2px] bg-foreground/10 text-sm font-medium text-muted-foreground">
        MO
      </AvatarFallback>
      <AvatarImage
        src={AVATAR_SRC}
        alt=""
        className="block size-full rounded-[2px] object-cover"
      />
    </Avatar>
  );
}
