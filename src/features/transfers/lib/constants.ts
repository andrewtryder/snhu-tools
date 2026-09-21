export const TRANSFER_SYNC_ID = "transfer";
export const TRANSFER_CACHE_TAG = "transfer-data";
export const TRANSFER_CACHE_REVALIDATE = 7 * 24 * 60 * 60; // 7 days in seconds
export const TRANSFER_COVERAGE_CACHE_TAG = "transfer-data";
// Transfer coverage changes only when the weekly transfer writer promotes new data.
 // Tag invalidation refreshes it immediately after promotion; seven days is a
 // fallback in case an invalidation webhook is missed.
export const TRANSFER_COVERAGE_REVALIDATE_SECONDS = TRANSFER_CACHE_REVALIDATE;
export const MAX_TRANSFER_COVERAGE_COURSES = 100;
export const MAX_COURSES_QUERY_CHARS = 2_000;
