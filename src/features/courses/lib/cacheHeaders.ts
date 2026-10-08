export const COURSE_API_CACHE_CONTROL =
  "public, s-maxage=86400, stale-while-revalidate=86400";
export const COURSE_API_CDN_CACHE_CONTROL =
  "public, s-maxage=86400, stale-while-revalidate=86400";
export const COURSE_API_NO_STORE = "no-store, no-cache, must-revalidate";

export const COURSE_API_SUCCESS_HEADERS = {
  "Cache-Control": COURSE_API_CACHE_CONTROL,
  "CDN-Cache-Control": COURSE_API_CDN_CACHE_CONTROL,
  "Vercel-CDN-Cache-Control": COURSE_API_CDN_CACHE_CONTROL,
} as const;

export const COURSE_API_ERROR_HEADERS = {
  "Cache-Control": COURSE_API_NO_STORE,
} as const;
