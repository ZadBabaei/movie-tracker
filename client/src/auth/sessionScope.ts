import { jwtDecode } from "jwt-decode";

type SessionReset = () => void;

const resetters = new Set<SessionReset>();
let generation = 0;
const USER_SCOPED_STORAGE_KEYS = ["history:activeTab", "watchlist:activeTab"];

const storage = (): Storage | null => {
  const candidate = typeof globalThis === "undefined"
    ? null
    : (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  return candidate && typeof candidate.getItem === "function" ? candidate : null;
};

const tokenIdentity = (token: string | null): string | null => {
  if (!token) return null;
  try {
    const payload = jwtDecode<{ id?: unknown; sub?: unknown }>(token);
    const identity = payload.id ?? payload.sub;
    return typeof identity === "string" && identity ? identity : null;
  } catch {
    return null;
  }
};

let authenticatedIdentity = tokenIdentity(storage()?.getItem("token") ?? null);

const resetUserScopedState = () => {
  generation += 1;
  for (const reset of resetters) reset();
};

export const registerUserScopedReset = (reset: SessionReset) => {
  resetters.add(reset);
  return () => resetters.delete(reset);
};

export const getSessionGeneration = () => generation;

export const isSessionGenerationCurrent = (candidate: number) => candidate === generation;

export const acceptAuthenticatedSession = (token: string) => {
  const previousToken = storage()?.getItem("token") ?? null;
  const nextIdentity = tokenIdentity(token);
  const accountChanged = authenticatedIdentity !== nextIdentity
    || (nextIdentity === null && previousToken !== token);

  if (accountChanged) resetUserScopedState();
  authenticatedIdentity = nextIdentity;
  storage()?.setItem("token", token);
};

export const endAuthenticatedSession = () => {
  authenticatedIdentity = null;
  const localStorage = storage();
  localStorage?.removeItem("token");
  localStorage?.removeItem("user");
  localStorage?.removeItem("userId");
  for (const key of USER_SCOPED_STORAGE_KEYS) localStorage?.removeItem(key);
  resetUserScopedState();
};
