"use client";

import { useRouter } from "next/navigation";

import { ArrowLeft } from "@carbon/icons-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const router = useRouter();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground">
      <h1 className="font-mono text-7xl font-semibold tracking-widest text-white sm:text-9xl">
        404
      </h1>
      <Button
        type="button"
        variant="link"
        size={null}
        onClick={() =>
          window.history.length > 1 ? router.back() : router.push("/")
        }
      >
        <ArrowLeft size={16} />
        Go back
      </Button>
    </main>
  );
}
