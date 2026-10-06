import { jwtDecode } from "jwt-decode";

type SessionReset = () => void;
type SessionListener = () => void;

const resetters = new Set<SessionReset>();
const listeners = new Set<SessionListener>();
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
  for (const listener of listeners) listener();
};

const clearUserScopedSelections = () => {
  const localStorage = storage();
  for (const key of USER_SCOPED_STORAGE_KEYS) localStorage?.removeItem(key);
};

const clearUserScopedStorage = () => {
  const localStorage = storage();
  localStorage?.removeItem("user");
  localStorage?.removeItem("userId");
  clearUserScopedSelections();
};

export const registerUserScopedReset = (reset: SessionReset) => {
  resetters.add(reset);
  return () => resetters.delete(reset);
};

export const getSessionGeneration = () => generation;

export const isSessionGenerationCurrent = (candidate: number) => candidate === generation;

export const getSessionIdentity = (token: string | null) => tokenIdentity(token);

export const isSessionIdentityCurrent = (candidate: string | null) => (
  candidate === tokenIdentity(storage()?.getItem("token") ?? null)
);

export const subscribeSession = (listener: SessionListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const acceptAuthenticatedSession = (token: string) => {
  const previousToken = storage()?.getItem("token") ?? null;
  const nextIdentity = tokenIdentity(token);
  const accountChanged = authenticatedIdentity !== nextIdentity
    || (nextIdentity === null && previousToken !== token);

  if (accountChanged) {
    clearUserScopedStorage();
  }
  authenticatedIdentity = nextIdentity;
  storage()?.setItem("token", token);
  // Routing subscribers must see the accepted session when they re-render.
  if (accountChanged) resetUserScopedState();
};

export const endAuthenticatedSession = () => {
  authenticatedIdentity = null;
  const localStorage = storage();
  localStorage?.removeItem("token");
  clearUserScopedStorage();
  resetUserScopedState();
};

// localStorage is shared by every tab, while module state and Zustand stores
// are not. Synchronize account changes made in another tab so stale private
// state and in-flight responses cannot survive there.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (event) => {
    if (event.key !== "token") return;
    const nextIdentity = tokenIdentity(event.newValue);
    const accountChanged = authenticatedIdentity !== nextIdentity
      || (nextIdentity === null && event.oldValue !== event.newValue);
    authenticatedIdentity = nextIdentity;
    if (accountChanged) {
      // The tab accepting the new account owns the shared user metadata. Only
      // clear stale UI selections here so another tab cannot erase that data.
      clearUserScopedSelections();
      resetUserScopedState();
    }
  });
}
