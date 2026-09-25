import { cache } from "react";
import { classifyDbAvailabilityError } from "./availability";
import {
  readCurrentManifest,
  readDomainBundle,
  versionForDomain,
} from "./manifest";
import type { SnapshotDomain } from "./types";

export interface ReadThroughSnapshotOptions<T> {
  domain: SnapshotDomain;
  /** Logical name for logs (e.g. programs.directory). */
  cacheKey: string;
  /** Load from Postgres when a refresh is needed / no snapshot yet. */
  loadFromDatabase: () => Promise<T>;
  /** Extract the typed slice from a domain bundle. */
  fromBundle: (bundle: unknown) => T | null | undefined;
  /** Reject empty/invalid values so they are never treated as authoritative. */
  validate?: (value: T) => boolean;
  /**
   * When true (default), prefer the durable snapshot and only hit the DB if
   * no snapshot exists. Public frontend traffic should keep this true.
   */
  preferSnapshot?: boolean;
}

function isValidValue<T>(value: T, validate?: (value: T) => boolean): boolean {
  if (value == null) return false;
  if (validate) return validate(value);
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
}

function logFallback(context: {
  domain: SnapshotDomain;
  cacheKey: string;
  reason: string;
  snapshotVersion: string | null;
  publishedAt: string | null;
}): void {
  const ageSeconds = context.publishedAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(context.publishedAt)) / 1000))
    : null;
  console.error("[data-fallback]", {
    domain: context.domain,
    cacheKey: context.cacheKey,
    reason: context.reason,
    snapshotVersion: context.snapshotVersion,
    snapshotAgeSeconds: ageSeconds,
  });
}

/**
 * Snapshot-first public read helper.
 *
 * Hierarchy:
 * 1. durable last-known-good snapshot (when present)
 * 2. database (bootstrap / optional refresh)
 * 3. availability error → snapshot if present
 * 4. otherwise degrade (caller decides empty/null)
 */
export async function readThroughSnapshot<T>(
  options: ReadThroughSnapshotOptions<T>,
): Promise<{ value: T | null; source: "snapshot" | "database" | "none"; version: string | null }> {
  const preferSnapshot = options.preferSnapshot !== false;
  const manifest = await readCurrentManifest();
  const version = versionForDomain(manifest, options.domain);
  let snapshotValue: T | null = null;

  if (version) {
    try {
      const bundle = await readDomainBundle(options.domain, version);
      if (bundle) {
        const extracted = options.fromBundle(bundle);
        if (extracted != null && isValidValue(extracted, options.validate)) {
          snapshotValue = extracted;
        }
      }
    } catch (error) {
      console.error("[snapshots] Failed to read durable snapshot", {
        domain: options.domain,
        cacheKey: options.cacheKey,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  if (preferSnapshot && snapshotValue != null) {
    return { value: snapshotValue, source: "snapshot", version };
  }

  try {
    const fresh = await options.loadFromDatabase();
    if (isValidValue(fresh, options.validate)) {
      return { value: fresh, source: "database", version };
    }
    // DB returned empty/invalid — keep snapshot if we have one.
    if (snapshotValue != null) {
      return { value: snapshotValue, source: "snapshot", version };
    }
    return { value: null, source: "none", version };
  } catch (error) {
    const availability = classifyDbAvailabilityError(error);
    if (availability && snapshotValue != null) {
      logFallback({
        domain: options.domain,
        cacheKey: options.cacheKey,
        reason: availability.reason,
        snapshotVersion: version,
        publishedAt: manifest?.publishedAt ?? null,
      });
      return { value: snapshotValue, source: "snapshot", version };
    }

    if (availability) {
      logFallback({
        domain: options.domain,
        cacheKey: options.cacheKey,
        reason: availability.reason,
        snapshotVersion: version,
        publishedAt: manifest?.publishedAt ?? null,
      });
      return { value: null, source: "none", version };
    }

    // Programmer/schema errors: do not hide.
    throw error;
  }
}

/** Request-memoized manifest reader for RSC trees. */
export const getRequestManifest = cache(async () => readCurrentManifest());
