export const PRODUCTION_SITE_URL = "https://snhu-tools.vercel.app";
const PRODUCTION_HOST = "snhu-tools.vercel.app";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isAllowedSiteUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

    const host = parsed.hostname.toLowerCase();
    // Never treat Vercel preview deployment hosts as the canonical site.
    if (host.endsWith(".vercel.app") && host !== PRODUCTION_HOST) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Absolute canonical site origin used for metadataBase, sitemap, robots, and JSON-LD.
 * Prefers configured production URL; never returns a Preview Deployment URL.
 */
export function getSiteUrl(): string {
  const candidates = [process.env.NEXT_PUBLIC_SITE_URL, process.env.SITE_URL];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed) continue;
    const normalized = stripTrailingSlash(trimmed);
    if (isAllowedSiteUrl(normalized)) {
      return normalized;
    }
  }

  return PRODUCTION_SITE_URL;
}
