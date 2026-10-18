"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import React, { Suspense, useState } from "react";
import { FcGoogle } from "react-icons/fc";

import { Button, buttonVariants } from "@/components/ui/button";
import { getAuthErrorMessage } from "@/lib/auth-error";
// import Logo from "../logo";
import PrismLogo from "../logo-prism";

type AuthMode = "sign-in" | "sign-up";

const SHELL_COPY = {
  "sign-in": {
    heading: "Sign In To Prisma",
    submitLabel: "Sign in",
    footerText: "Don't have an account?",
    footerLinkText: "Sign up",
    footerLinkHref: "/auth/sign-up",
  },
  "sign-up": {
    heading: "Sign Up To Prisma",
    submitLabel: "Sign up",
    footerText: "Already have an account?",
    footerLinkText: "Sign in",
    footerLinkHref: "/auth/sign-in",
  },
} as const;

interface AuthShellProps {
  children: React.ReactNode;
  mode: AuthMode;
  error?: string | null;
  loading?: boolean;
  submitDisabled?: boolean;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
}

function StatusMessage({
  error,
  mode,
}: {
  error?: string | null;
  mode: AuthMode;
}) {
  const searchParams = useSearchParams();
  const paramError = searchParams.get("error");
  const errorText =
    error ??
    (paramError
      ? getAuthErrorMessage(
          paramError,
          mode === "sign-in" ? "signIn" : "signUp",
        )
      : null);

  if (errorText) {
    return (
      <div
        role="alert"
        className="inline-flex h-9 items-center rounded-[2px] border-l-3 border-l-destructive bg-muted px-3 text-sm font-medium text-foreground"
      >
        {errorText}
      </div>
    );
  }

  return null;
}

const AuthShell = ({
  children,
  mode,
  error,
  loading = false,
  submitDisabled = false,
  onSubmit,
}: AuthShellProps) => {
  const { heading, submitLabel, footerText, footerLinkText, footerLinkHref } =
    SHELL_COPY[mode];
  const { signIn } = useAuthActions();
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      await signIn("google", { redirectTo: "/dashboard" });
    } catch {
      setGoogleError("Unable to sign in with Google. Please try again.");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center px-4 py-20">
      <div className="absolute top-6 right-6">
        <Suspense fallback={null}>
          <StatusMessage error={error ?? googleError} mode={mode} />
        </Suspense>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-8">
        <div className="flex flex-col items-center gap-4 mb-2">
          <Link
            href="/"
            aria-label="Go to home"
            className="flex items-center text-foreground"
          >
            {/* <Logo className="h-10 w-10" /> */}
            <PrismLogo className="h-10 w-10" />
          </Link>

          <h1 className="text-center text-foreground/80 text-xl font-semibold tracking-tight">
            {heading}
          </h1>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">{children}</div>

          <div className="flex flex-col gap-4">
            <Button
              type="submit"
              variant="primary"
              className="w-full text-sm font-medium"
              loading={loading}
              disabled={submitDisabled}
            >
              {submitLabel}
            </Button>

            {/* Keep this control; do not remove unless the user explicitly asks. */}
            <Button
              type="button"
              variant="secondary"
              className="w-full gap-2"
              loading={googleLoading}
              onClick={handleGoogleSignIn}
            >
              <FcGoogle size={16} />
              Continue with Google
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              {footerText}{" "}
              <Link
                href={footerLinkHref}
                className={buttonVariants({ variant: "link", size: null })}
              >
                {footerLinkText}
              </Link>
            </p>
          </div>
        </form>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <Link
          href="/privacy"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          Terms of Service
        </Link>
      </div>
    </div>
  );
};

export default AuthShell;
