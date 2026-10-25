"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function SignOutPage() {
  const { signOut } = useAuthActions();
  const started = useRef(false);
  const [error, setError] = useState(false);

  const finishSignOut = useCallback(async () => {
    setError(false);
    try {
      await signOut();
      window.location.replace("/auth/sign-in");
    } catch {
      started.current = false;
      setError(true);
    }
  }, [signOut]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void finishSignOut();
  }, [finishSignOut]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      {error ? (
        <>
          <p role="alert">Unable to sign out. Please try again.</p>
          <Button onClick={finishSignOut}>Try again</Button>
        </>
      ) : (
        <Spinner size={20} className="text-foreground/80" />
      )}
    </main>
  );
}

export default SignOutPage;
