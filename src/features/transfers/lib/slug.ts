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

/** Canonical local route for a transfer-equivalency course page. */
export function transferCoursePath(courseCode: string): string {
  return `/transfers/courses/${slugify(normalizeCourseNumber(courseCode))}`;
}

export function canonicalPath(pathname: string, baseUrl: string): string {
  return new URL(pathname, baseUrl).toString();
}
