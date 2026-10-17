"use client"

import { Information } from "@carbon/icons-react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useQuery } from "convex/react"
import { useRouter } from "next/navigation"
import React, { useEffect, useState } from "react"

import AuthField from "@/components/auth/auth-field"
import AuthShell from "@/components/auth/auth-shell"
import { Spinner } from "@/components/ui/spinner"
import { api } from "@/convex/_generated/api"
import { getAuthErrorMessage } from "@/lib/auth-error"
import { cn } from "@/lib/utils"

const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/

function getPasswordStrength(pass: string): number {
  if (!pass) return 0
  let score = 0
  if (pass.length >= 8) score++
  if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score++
  if (/\d/.test(pass)) score++
  if (/[^A-Za-z0-9]/.test(pass)) score++
  return score
}

const STRENGTH_COLORS = [
  "bg-white/15",
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-green-500",
]

const SignUpPage = () => {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [debouncedUsername, setDebouncedUsername] = useState("")
  const [usernameTouched, setUsernameTouched] = useState(false)

  const normalizedUsername = username.trim().toLowerCase()
  const validUsername = USERNAME_PATTERN.test(normalizedUsername)

  useEffect(() => {
    if (!validUsername) return
    const timeout = window.setTimeout(
      () => setDebouncedUsername(normalizedUsername),
      300
    )
    return () => window.clearTimeout(timeout)
  }, [normalizedUsername, validUsername])

  const usernameAvailable = useQuery(
    api.users.isUsernameAvailable,
    validUsername && debouncedUsername === normalizedUsername
      ? { username: normalizedUsername }
      : "skip"
  )
  const checkingUsername =
    validUsername &&
    (debouncedUsername !== normalizedUsername || usernameAvailable === undefined)
  const usernameTaken = validUsername && !checkingUsername && usernameAvailable === false
  const canSubmitUsername =
    validUsername && !checkingUsername && usernameAvailable === true

  const usernameStatus = username.length > 0 && (
    checkingUsername ? (
      <span role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-white/40">
        <Spinner size={12} /> Checking…
      </span>
    ) : usernameTaken || error === "That username is already taken." ? (
      <span role="status" aria-live="polite" className="text-xs text-red-400">
        Username taken
      </span>
    ) : usernameAvailable === true ? (
      <span role="status" aria-live="polite" className="text-xs text-green-400">
        Available
      </span>
    ) : usernameTouched && !validUsername ? (
      <span role="status" aria-live="polite" className="text-xs text-red-400">
        Use 3–20 letters, numbers, or underscores
      </span>
    ) : null
  )

  const score = getPasswordStrength(password)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    setError(null)
    setLoading(true)

    try {
      await signIn("password", {
        flow: "signUp",
        username: normalizedUsername,
        email: email.trim().toLowerCase(),
        password,
      })
      router.replace("/dashboard")
    } catch (error) {
      setError(getAuthErrorMessage(error, "signUp"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      submitLabel="Sign up"
      footerText="Already have an account?"
      footerLinkText="Sign in"
      footerLinkHref="/auth/sign-in"
      error={error}
      loading={loading}
      submitDisabled={!canSubmitUsername}
      onSubmit={handleSubmit}
    >
      <AuthField
        id="username"
        label="Username"
        name="username"
        placeholder="Your Username"
        autoComplete="username"
        required
        minLength={3}
        maxLength={20}
        value={username}
        labelExtra={usernameStatus}
        onBlur={() => setUsernameTouched(true)}
        onChange={(e) => {
          setUsername(e.target.value)
          setUsernameTouched(false)
          setError(null)
        }}
        error={usernameTaken || error === "That username is already taken."}
      />

      <AuthField
        id="email"
        label="Email"
        type="email"
        name="email"
        placeholder="Your Email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <AuthField
        id="password"
        label="Password"
        type="password"
        name="password"
        placeholder="Create a password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setError(null)
        }}
        labelExtra={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={cn(
                    "h-1 w-5.5 rounded-[1px] transition-colors duration-200",
                    password && step <= score ? STRENGTH_COLORS[score] : "bg-white/15"
                  )}
                />
              ))}
            </div>

            <div className="group relative flex items-center">
              <button
                type="button"
                className="text-white/30 hover:text-white/70 focus-visible:text-white/70 transition-colors cursor-pointer"
                aria-label="Password requirements"
              >
                <Information size={14} />
              </button>
              <div className="pointer-events-none absolute right-0 bottom-full mb-1.5 hidden w-48 rounded-[2px] border border-white/7 bg-muted px-2.5 py-2 text-xs text-white/80 group-hover:block group-focus-within:block z-50">
                <p className="font-semibold text-white/50 mb-1">Requirements</p>
                <ul className="space-y-0.5 list-disc list-inside text-white/40">
                  <li>8+ characters</li>
                  <li>Uppercase & lowercase</li>
                  <li>At least one number</li>
                  <li>Special character</li>
                </ul>
              </div>
            </div>
          </div>
        }
      />

      <AuthField
        id="confirmPassword"
        label="Confirm Password"
        type="password"
        name="confirmPassword"
        placeholder="Confirm your password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(e) => {
          setConfirmPassword(e.target.value)
          setError(null)
        }}
        error={Boolean(error && password !== confirmPassword)}
      />
    </AuthShell>
  )
}

export default SignUpPage
