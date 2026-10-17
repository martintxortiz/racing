"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/dropdown-menu";

export function ModeToggle() {
  const { setTheme } = useTheme();

  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button>
            <Sun />
            <Moon />
            <span className="sr-only">Toggle theme</span>
          </Button>
        }
      />
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup>
            <Menu.Item onClick={() => setTheme("light")}>Light</Menu.Item>
            <Menu.Item onClick={() => setTheme("dark")}>Dark</Menu.Item>
            <Menu.Item onClick={() => setTheme("system")}>System</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
