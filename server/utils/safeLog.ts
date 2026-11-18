// Safe diagnostics for logging errors. Errors raised by HTTP clients such as the
// Stream SDK carry the outgoing request (including its Authorization header)
// on properties that console.error prints, so never log an error object whole.

export interface SafeErrorDescription {
  name: string;
  code?: string | number;
  status?: number;
  message: string;
}

const MAX_MESSAGE_LENGTH = 200;
const MAX_NAME_LENGTH = 64;
const MAX_CODE_LENGTH = 64;
const REDACTED_MESSAGE = "[message withheld: possible credential content]";

const SAFE_IDENTIFIER = /^[A-Za-z0-9_.$:-]+$/;

// Anything that looks like a credential makes the whole message untrusted.
const CREDENTIAL_PATTERNS: RegExp[] = [
  /\beyJ[A-Za-z0-9_-]{4,}/, // JWT header or payload segment
  /[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}/, // any three-part token
  /\bBearer\s+\S/i,
  /\bBasic\s+[A-Za-z0-9+/=]{8,}/i,
  /\bauthori[sz]ation\b/i,
  /\bstream-auth-type\b/i,
  /\b(?:api[_-]?key|api[_-]?secret|secret|token|password|passwd|cookie)\b\s*[:=]/i,
  /[?&](?:api_key|token|key|secret|access_token|authorization)=/i,
  /[A-Za-z0-9+/_=-]{32,}/, // long opaque run
];

const ENV_SECRET_NAMES = [
  "STREAM_API_SECRET",
  "JWT_SECRET",
  "STREMIO_CREDENTIAL_KEY",
  "OPENAI_API_KEY",
  "TMDB_API_KEY",
  "WATCHMODE_API_KEY",
];

const read = (source: unknown, key: string): unknown => {
  try {
    return (source as Record<string, unknown> | null)?.[key];
  } catch {
    return undefined;
  }
};

const containsConfiguredSecret = (text: string) =>
  ENV_SECRET_NAMES.some((name) => {
    const value = process.env[name]?.trim();
    return !!value && value.length >= 8 && text.includes(value);
  });

const sanitizeMessage = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(raw)) || containsConfiguredSecret(raw)) {
    return REDACTED_MESSAGE;
  }
  // Collapse control characters so a message cannot forge extra log lines.
  const oneLine = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return oneLine.length > MAX_MESSAGE_LENGTH ? `${oneLine.slice(0, MAX_MESSAGE_LENGTH)}...` : oneLine;
};

const safeName = (raw: unknown) =>
  typeof raw === "string" && raw.length <= MAX_NAME_LENGTH && SAFE_IDENTIFIER.test(raw) ? raw : "Error";

const safeCode = (raw: unknown): string | number | undefined => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.length <= MAX_CODE_LENGTH && SAFE_IDENTIFIER.test(raw)) return raw;
  return undefined;
};

const safeStatus = (raw: unknown): number | undefined =>
  typeof raw === "number" && Number.isInteger(raw) && raw >= 100 && raw <= 599 ? raw : undefined;

export const describeError = (error: unknown): SafeErrorDescription => {
  if (typeof error === "string") {
    return { name: "Error", message: sanitizeMessage(error) };
  }
  if (error === null || typeof error !== "object") {
    return { name: "Error", message: "" };
  }

  const description: SafeErrorDescription = {
    name: safeName(read(error, "name")),
    message: sanitizeMessage(read(error, "message")),
  };
  const code = safeCode(read(error, "code"));
  if (code !== undefined) description.code = code;
  const status = safeStatus(read(error, "status")) ?? safeStatus(read(read(error, "response"), "status"));
  if (status !== undefined) description.status = status;
  return description;
};
