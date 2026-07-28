import { AsyncLocalStorage } from "node:async_hooks";

type SsrRequestCache = Map<string, Promise<unknown>>;

const ssrRequestCacheStorage = new AsyncLocalStorage<SsrRequestCache>();

/** Wrap each Astro SSR request so identical API calls share one in-flight promise. */
export function runWithSsrRequestCache<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return ssrRequestCacheStorage.run(new Map(), fn);
}

export function getSsrRequestCache(): SsrRequestCache | undefined {
  return ssrRequestCacheStorage.getStore();
}

function cacheKey(prefix: string, cookieHeader?: string | null): string {
  return `${prefix}:${cookieHeader ?? ""}`;
}

/** Deduplicate identical fetches within the same SSR request (e.g. layout + page). */
export async function dedupeSsrFetch<T>(
  prefix: string,
  cookieHeader: string | null | undefined,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cache = getSsrRequestCache();
  const key = cacheKey(prefix, cookieHeader);

  if (cache) {
    const existing = cache.get(key);
    if (existing) {
      return existing as Promise<T>;
    }

    const promise = fetcher();
    cache.set(key, promise);
    return promise;
  }

  return fetcher();
}
