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
  /\b(?:api[ _-]?key|api[ _-]?secret|client[ _-]?secret|access[ _-]?token|refresh[ _-]?token|key|secret|token|password|passwd|cookie)\b["']?\s*[:=]/i,
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s/]+@/i, // credentials in a URL
  /[A-Za-z0-9+/_=-]{32,}/, // long opaque run
];

const SENSITIVE_ENV_NAME = /(?:^|_)(?:KEYS?|SECRETS?|TOKENS?|PASSWORDS?|PASS|PASSWD|CREDENTIALS?|URI|DSN)(?:_|$)/i;

const read = (source: unknown, key: string): unknown => {
  try {
    return (source as Record<string, unknown> | null)?.[key];
  } catch {
    return undefined;
  }
};

const containsConfiguredSecret = (text: string) =>
  Object.entries(process.env).some(([name, raw]) => {
    if (!SENSITIVE_ENV_NAME.test(name)) return false;
    const value = raw?.trim();
    return !!value && text.includes(value);
  });

const containsCredential = (text: string) =>
  CREDENTIAL_PATTERNS.some((pattern) => pattern.test(text)) || containsConfiguredSecret(text);

const sanitizeMessage = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  if (containsCredential(raw)) {
    return REDACTED_MESSAGE;
  }
  // Collapse control characters so a message cannot forge extra log lines.
  const oneLine = raw.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim();
  return oneLine.length > MAX_MESSAGE_LENGTH ? `${oneLine.slice(0, MAX_MESSAGE_LENGTH)}...` : oneLine;
};

const safeName = (raw: unknown) =>
  typeof raw === "string" && raw.length <= MAX_NAME_LENGTH && SAFE_IDENTIFIER.test(raw) && !containsCredential(raw)
    ? raw
    : "Error";

const safeCode = (raw: unknown): string | number | undefined => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.length <= MAX_CODE_LENGTH && SAFE_IDENTIFIER.test(raw) && !containsCredential(raw)) return raw;
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
