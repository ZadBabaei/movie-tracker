import jwt from "jsonwebtoken";

export const TOKEN_ISSUER = "movie-tracker";
export const TOKEN_AUDIENCE = "movie-tracker-app";
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || "10d";

// Sessions slide: a token older than this is reissued on the next request, so
// a device in regular use is never signed out, while one left idle for the
// full token lifetime has to sign in again.
const parseSeconds = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const RENEW_AFTER_SECONDS = parseSeconds(
  process.env.JWT_RENEW_AFTER_SECONDS,
  24 * 60 * 60
);

export const REFRESHED_TOKEN_HEADER = "X-Refreshed-Token";

export interface AuthTokenPayload {
  id: string;
  name?: string;
  tokenVersion: number;
  iat?: number;
}

export const shouldRenewToken = (issuedAt?: number) => {
  if (!issuedAt) return false;
  return Math.floor(Date.now() / 1000) - issuedAt >= RENEW_AFTER_SECONDS;
};

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
};

export const signAuthToken = (user: {
  _id: unknown;
  name?: string;
  tokenVersion?: number;
}) =>
  jwt.sign(
    {
      id: String(user._id),
      name: user.name,
      tokenVersion: user.tokenVersion ?? 0,
    },
    getSecret(),
    {
      expiresIn: TOKEN_TTL,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
    } as jwt.SignOptions
  );

// Throws when the signature, issuer, audience or expiry does not check out.
export const verifyAuthToken = (token: string): AuthTokenPayload => {
  const decoded = jwt.verify(token, getSecret(), {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  }) as AuthTokenPayload;

  return { ...decoded, tokenVersion: decoded.tokenVersion ?? 0 };
};

export const readBearerToken = (authHeader?: string) => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return "";
  return authHeader.slice("Bearer ".length).trim();
};
