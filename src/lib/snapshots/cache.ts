import { unstable_cache } from "next/cache";

/**
 * Tag-invalidated durable cache wrapper.
 * In Vitest / NODE_ENV=test, skip Next's unstable_cache (no incrementalCache).
 */
export function durableCache<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  keyParts: string[],
  options: { tags: string[]; revalidate: false | number },
): (...args: TArgs) => Promise<TResult> {
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return fn;
  }
  return unstable_cache(fn, keyParts, options);
}
