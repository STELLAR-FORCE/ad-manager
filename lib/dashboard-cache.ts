type CacheEntry<T> = { value: T; expiresAt: number; fetchedAt: number };

export type CachedResult<T> = { value: T; fetchedAt: number; hit: boolean };

const store = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<CachedResult<unknown>>>();

const DEFAULT_TTL_MS = 60 * 60 * 1000;

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<CachedResult<T>> {
  const now = Date.now();
  const hit = store.get(key) as CacheEntry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return { value: hit.value, fetchedAt: hit.fetchedAt, hit: true };
  }

  const existing = inFlight.get(key) as Promise<CachedResult<T>> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    const value = await fn();
    const fetchedAt = Date.now();
    store.set(key, { value, expiresAt: fetchedAt + ttlMs, fetchedAt });
    return { value, fetchedAt, hit: false };
  })();
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

export function clearDashboardCache(): void {
  store.clear();
  inFlight.clear();
}
