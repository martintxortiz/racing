"use client"

import { useAuthActions } from "@convex-dev/auth/react"
import { useRouter } from "next/navigation"
import React, { useRef, useState } from "react"

import AuthField from "@/components/auth/auth-field"
import AuthShell from "@/components/auth/auth-shell"
import { getAuthErrorMessage } from "@/lib/auth-error"

const SignInPage = () => {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [invalidCredentials, setInvalidCredentials] = useState(false)
  const [loading, setLoading] = useState(false)
  const passwordInputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setInvalidCredentials(false)
    setLoading(true)

    try {
      await signIn("password", {
        flow: "signIn",
        email: email.trim().toLowerCase(),
        password,
      })
      router.replace("/dashboard")
    } catch (error) {
      const message = getAuthErrorMessage(error, "signIn")
      setError(message)
      const credentialsAreInvalid = message === "Incorrect email or password."
      setInvalidCredentials(credentialsAreInvalid)
      if (credentialsAreInvalid) passwordInputRef.current?.blur()
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      submitLabel="Sign in"
      footerText="Don't have an account?"
      footerLinkText="Sign up"
      footerLinkHref="/auth/sign-up"
      error={error}
      loading={loading}
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
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          setError(null)
          setInvalidCredentials(false)
        }}
        error={invalidCredentials || Boolean(error)}
      />

      <AuthField
        id="password"
        ref={passwordInputRef}
        label="Password"
        labelExtra={
          <button
            type="button"
            disabled
            aria-label="Forgot password (unavailable)"
            className="cursor-not-allowed text-xs font-medium text-white/20"
          >
            Forgot password?
          </button>
        }
        type="password"
        name="password"
        placeholder="Your Password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setError(null)
          setInvalidCredentials(false)
        }}
        error={invalidCredentials || Boolean(error)}
      />
    </AuthShell>
  )
}

export default SignInPage
