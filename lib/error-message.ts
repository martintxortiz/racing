import { ConvexError } from "convex/values";

export function getErrorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "Something went wrong. Please try again.";
}
