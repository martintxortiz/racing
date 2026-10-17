"use client"

import Link from "next/link"
import React, { useState } from "react"

import AuthField from "@/components/auth/auth-field"
import AuthShell from "@/components/auth/auth-shell"

const SignInPage = () => {
  const [hasError, setHasError] = useState(false)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setHasError(true)
  }

  return (
    <AuthShell
      submitLabel="Sign in"
      footerText="Don't have an account?"
      footerLinkText="Sign up"
      footerLinkHref="/auth/sign-up"
      error={hasError ? "Invalid Credentials" : null}
      onSubmit={handleSubmit}
    >
      <AuthField
        id="email"
        label="Email"
        type="email"
        name="email"
        placeholder="Your Email"
        autoComplete="email"
        required
        error={hasError}
      />

      <AuthField
        id="password"
        label="Password"
        type="password"
        name="password"
        placeholder="Your Password"
        autoComplete="current-password"
        required
        error={hasError}
        labelExtra={
          <Link
            href="/reset-password"
            className="text-xs font-medium text-white/20 transition-colors hover:text-white/80"
          >
            Forgot password?
          </Link>
        }
      />
    </AuthShell>
  )
}

export default SignInPage