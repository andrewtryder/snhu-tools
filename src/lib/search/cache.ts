/**
 * Search data changes only when one of the weekly catalog writers promotes new
 * data. Keep identical autocomplete queries at the edge long enough to avoid
 * repeatedly waking Neon while still allowing reasonably fresh search results.
 */
export const SEARCH_CACHE_CONTROL =
  "public, s-maxage=900, stale-while-revalidate=3600";
