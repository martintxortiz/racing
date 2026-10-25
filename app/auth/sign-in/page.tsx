"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";

import AuthField from "@/components/auth/auth-field";
import AuthShell from "@/components/auth/auth-shell";
import { getAuthErrorMessage } from "@/lib/auth-error";

const SignInPage = () => {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn("password", {
        flow: "signIn",
        email,
        password,
      });
      router.replace("/dashboard");
    } catch (error) {
      setError(getAuthErrorMessage(error, "signIn"));
      setLoading(false);
    }
  };

  return (
    <AuthShell
      mode="sign-in"
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
          setEmail(e.target.value);
          setError(null);
        }}
        error={Boolean(error)}
      />

      <AuthField
        id="password"
        label="Password"
        labelExtra={
          // Keep this control; do not remove unless the user explicitly asks.
          <button
            type="button"
            disabled
            aria-label="Forgot password (unavailable)"
            className="cursor-not-allowed text-xs font-medium text-muted-foreground"
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
          setPassword(e.target.value);
          setError(null);
        }}
        error={Boolean(error)}
      />
    </AuthShell>
  );
};

export default SignInPage;
