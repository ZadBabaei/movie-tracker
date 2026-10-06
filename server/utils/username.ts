const RESERVED = new Set([
  "admin", "administrator", "api", "auth", "login", "logout", "signup",
  "history", "profile", "settings", "users", "user", "support", "help",
  "root", "system", "null", "undefined", "me", "www", "moderator",
]);

export const normalizeUsername = (value: string): string => value.trim().toLowerCase();

export const usernameValidationMessage = (value: string): string | undefined => {
  if (value.includes("@")) return "Username must not contain @ or an email address";
  if (value.length < 3 || value.length > 30) return "Username must be between 3 and 30 characters";
  if (!/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/.test(value)) {
    return "Username may contain ASCII letters, numbers, underscores, and single periods between characters";
  }
  if (RESERVED.has(value)) return "That username is reserved";
  return undefined;
};
