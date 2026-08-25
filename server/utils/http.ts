export const DEFAULT_FETCH_TIMEOUT_MS = 8000;

// Every outbound call needs a deadline: without one a slow third party holds a
// request handler (and its database connection) open indefinitely.
export const fetchWithTimeout = async (
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Insert into a Map that must not grow without bound, evicting the oldest
// entries once the cap is reached.
export const setCapped = <K, V>(
  store: Map<K, V>,
  key: K,
  value: V,
  maxEntries: number
): void => {
  store.delete(key);
  store.set(key, value);

  while (store.size > maxEntries) {
    const oldest = store.keys().next().value as K | undefined;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
};
