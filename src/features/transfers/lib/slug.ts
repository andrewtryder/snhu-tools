import { normalizeTransferCourseCode } from "./courseCode";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Canonical transfer course code (uppercase, no spaces/hyphens). */
export function normalizeCourseNumber(value: string): string {
  return normalizeTransferCourseCode(value);
}

export function canonicalPath(pathname: string, baseUrl: string): string {
  return new URL(pathname, baseUrl).toString();
}
