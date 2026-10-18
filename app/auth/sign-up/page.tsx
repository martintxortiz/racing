"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

import AuthField from "@/components/auth/auth-field";
import AuthShell from "@/components/auth/auth-shell";
import PasswordStrength from "@/components/auth/password-strength";
import { Spinner } from "@/components/ui/spinner";
import { api } from "@/convex/_generated/api";
import { normalizeUsername, usernamePattern } from "@/lib/auth-validation";
import { getAuthErrorMessage } from "@/lib/auth-error";
import { CheckmarkFilled, Close, CloseFilled } from "@carbon/icons-react";

const SignUpPage = () => {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountCreated, setAccountCreated] = useState(false);
  const [debouncedUsername, setDebouncedUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);

  const normalizedUsername = normalizeUsername(username);
  const validUsername = usernamePattern.test(normalizedUsername);

  useEffect(() => {
    if (!validUsername) return;
    const timeout = window.setTimeout(
      () => setDebouncedUsername(normalizedUsername),
      300,
    );
    return () => window.clearTimeout(timeout);
  }, [normalizedUsername, validUsername]);

  const usernameAvailable = useQuery(
    api.users.isUsernameAvailable,
    !accountCreated && validUsername && debouncedUsername === normalizedUsername
      ? { username: normalizedUsername }
      : "skip",
  );
  const checkingUsername =
    validUsername &&
    (debouncedUsername !== normalizedUsername ||
      usernameAvailable === undefined);
  const usernameTaken =
    !loading &&
    !accountCreated &&
    validUsername &&
    !checkingUsername &&
    usernameAvailable === false;
  const canSubmitUsername =
    validUsername && !checkingUsername && usernameAvailable === true;

  const usernameStatus =
    !loading &&
    !accountCreated &&
    username.length > 0 &&
    (checkingUsername ? (
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs text-muted-foreground"
      >
        <Spinner size={12} /> Checking…
      </span>
    ) : usernameTaken || error === "That username is already taken." ? (
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs text-destructive"
      >
        <CloseFilled size={12} /> Username taken
      </span>
    ) : usernameAvailable === true ? (
      <span
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400"
      >
        <CheckmarkFilled size={12} /> Available
      </span>
    ) : usernameTouched && !validUsername ? (
      <span
        role="status"
        aria-live="polite"
        className="text-xs text-destructive"
      >
        Use 3–20 letters, numbers, or underscores
      </span>
    ) : null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      await signIn("password", {
        flow: "signUp",
        username: normalizedUsername,
        email,
        password,
      });
      setAccountCreated(true);
      router.replace("/dashboard");
    } catch (error) {
      setError(getAuthErrorMessage(error, "signUp"));
      setLoading(false);
    }
  };

  return (
    <AuthShell
      mode="sign-up"
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
          setUsername(e.target.value);
          setUsernameTouched(false);
          setError(null);
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
        maxLength={128}
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          setError(null);
        }}
        labelExtra={<PasswordStrength password={password} />}
      />

      <AuthField
        id="confirmPassword"
        label="Confirm Password"
        type="password"
        name="confirmPassword"
        placeholder="Confirm your password"
        autoComplete="new-password"
        required
        maxLength={128}
        value={confirmPassword}
        onChange={(e) => {
          setConfirmPassword(e.target.value);
          setError(null);
        }}
        error={Boolean(error && password !== confirmPassword)}
      />
    </AuthShell>
  );
};

export default SignUpPage;
