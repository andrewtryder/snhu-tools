export const TRANSFER_SYNC_ID = "transfer";
export const TRANSFER_CACHE_TAG = "transfer-data";
/**
 * Event-driven transfer cache: durable snapshots + tag invalidation after promote.
 * Formerly 7 days (604800s). A TTL must not erase last-known-good data on outage;
 * keep false and rely on tag invalidation. Historical 7-day value retained only
 * as documentation of the old secondary safety net.
 */
export const TRANSFER_CACHE_REVALIDATE = false as const;
/** @deprecated Documented former fallback: 7 * 24 * 60 * 60 (seconds). */
export const TRANSFER_CACHE_REVALIDATE_LEGACY_SECONDS = 7 * 24 * 60 * 60;
export const TRANSFER_COVERAGE_CACHE_TAG = "transfer-data";
// Transfer coverage changes only when the weekly transfer writer promotes new data.
// Tag invalidation refreshes it immediately after promotion.
export const TRANSFER_COVERAGE_REVALIDATE_SECONDS = TRANSFER_CACHE_REVALIDATE;
export const MAX_TRANSFER_COVERAGE_COURSES = 100;
export const MAX_COURSES_QUERY_CHARS = 2_000;
