"use client"

import { Information } from "@carbon/icons-react"
import React, { useState } from "react"

import AuthField from "@/components/auth/auth-field"
import AuthShell from "@/components/auth/auth-shell"
import { cn } from "@/lib/utils"

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
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const score = getPasswordStrength(password)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }
    setError(null)
  }

  return (
    <AuthShell
      submitLabel="Sign up"
      footerText="Already have an account?"
      footerLinkText="Sign in"
      footerLinkHref="/auth/sign-in"
      error={error}
      onSubmit={handleSubmit}
    >
      <AuthField
        id="username"
        label="Username"
        name="username"
        placeholder="Your Username"
        autoComplete="username"
        required
      />

      <AuthField
        id="email"
        label="Email"
        type="email"
        name="email"
        placeholder="Your Email"
        autoComplete="email"
        required
      />

      <AuthField
        id="password"
        label="Password"
        type="password"
        name="password"
        placeholder="Create a password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
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
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={Boolean(error && password !== confirmPassword)}
      />
    </AuthShell>
  )
}

export default SignUpPage