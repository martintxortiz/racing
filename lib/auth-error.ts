import { ConvexError } from "convex/values";

export function getAuthErrorMessage(error: unknown, flow: "signIn" | "signUp") {
  const data = error instanceof ConvexError ? error.data : error;
  const message = data instanceof Error ? data.message : String(data ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("invalid credentials")) {
    return "Incorrect email or password.";
  }
  if (normalized.includes("username") && normalized.includes("taken")) {
    return "That username is already taken.";
  }
  if (flow === "signUp" && normalized.includes("already exists")) {
    return "An account with this email already exists.";
  }
  if (normalized.includes("invalid password")) {
    return "Password must be at least 8 characters.";
  }
  if (normalized.includes("valid email")) {
    return "Enter a valid email address.";
  }

  return flow === "signIn"
    ? "Unable to sign in. Please try again."
    : "Unable to create your account. Please try again.";
}
