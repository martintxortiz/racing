"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import React, { Suspense } from "react"

import { Button } from "@/components/ui/button"
import Logo from "../logo"

interface AuthShellProps {
  children: React.ReactNode
  error?: string | null
  loading?: boolean
  submitDisabled?: boolean
  submitLabel: string
  footerText: string
  footerLinkText: string
  footerLinkHref: string
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}

function StatusMessage({
  error,
}: {
  error?: string | null
}) {
  const searchParams = useSearchParams()
  const errorText = error ?? searchParams.get("error")

  if (errorText) {
    return (
      <div
        role="alert"
        className="inline-flex h-9 items-center rounded-[2px] border-l-3 border-l-red-500 bg-muted px-3 text-sm font-medium text-white/90"
      >
        {errorText}
      </div>
    )
  }

  return null
}

const AuthShell = ({
  children,
  error,
  loading = false,
  submitDisabled = false,
  submitLabel,
  footerText,
  footerLinkText,
  footerLinkHref,
  onSubmit,
}: AuthShellProps) => {
  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center p-4">
      <Link
        href="/"
        aria-label="Go to home"
        className="absolute top-6 left-6 flex items-center text-white/90 transition-opacity hover:opacity-80 gap-1.5"
      >
        <Logo className="h-9 w-9" />
      </Link>

      <div className="absolute top-6 right-6">
        <Suspense fallback={null}>
          <StatusMessage error={error} />
        </Suspense>
      </div>

      <div className="w-full max-w-sm">
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

            <p className="text-center text-sm text-white/50">
              {footerText}{" "}
              <Link
                href={footerLinkHref}
                className="text-white underline-offset-4 hover:underline"
              >
                {footerLinkText}
              </Link>
            </p>
          </div>
        </form>
      </div>

      <div className="absolute bottom-6 flex items-center gap-6">
        <Link
          href="/privacy"
          className="text-xs text-white/20 transition-colors hover:text-white/50"
        >
          Privacy Policy
        </Link>
        <Link
          href="/terms"
          className="text-xs text-white/20 transition-colors hover:text-white/50"
        >
          Terms of Service
        </Link>
      </div>
    </div>
  )
}

export default AuthShell
