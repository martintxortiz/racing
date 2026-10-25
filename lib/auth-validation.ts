export const usernamePattern = /^[a-z0-9_]{3,20}$/;
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeUsername = (username: string) =>
  username.trim().toLowerCase();

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
