/**
 * Shared SNHU transfer course-code normalization and validation.
 *
 * Live `transfer_courses.coursenumber` values are uppercase alphanumeric codes
 * without spaces or hyphens (e.g. CS110, BIO120L, ACC1ELE). Callers may supply
 * spaced, hyphenated, or lowercase variants; we canonicalize before querying.
 */

import { MAX_TRANSFER_COVERAGE_COURSES } from "./constants";

/** Letters, digits, optional letter suffix (labs / electives such as L or ELE). */
const TRANSFER_COURSE_CODE_PATTERN = /^[A-Z]{1,12}\d{1,5}[A-Z]{0,4}$/;

/**
 * Canonical database form: trim, uppercase, strip spaces and hyphens.
 * Example: "cs 110" | "CS-110" | "CS110" → "CS110"
 */
export function normalizeTransferCourseCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]+/g, "");
}

/**
 * Human-readable display form when spacing is unambiguous.
 * Example: "CS110" → "CS 110", "BIO120L" → "BIO 120L"
 * Falls back to the canonical value when the shape is unexpected.
 */
export function formatTransferCourseCode(value: string): string {
  const canonical = normalizeTransferCourseCode(value);
  const match = canonical.match(/^([A-Z]+)(\d+[A-Z]*)$/);
  if (!match) return canonical;
  return `${match[1]} ${match[2]}`;
}

/**
 * True when the value normalizes to a course code shape observed in
 * `transfer_courses` (subject letters + digits + optional letter suffix).
 */
export function isValidTransferCourseCode(value: string): boolean {
  const canonical = normalizeTransferCourseCode(value);
  if (!canonical) return false;
  return TRANSFER_COURSE_CODE_PATTERN.test(canonical);
}

export type ParsedCoursesQuery =
  | { ok: true; courseCodes: string[] }
  | { ok: false; error: "MISSING_COURSES" }
  | { ok: false; error: "INVALID_COURSE_CODE"; invalidCourseCodes: string[] }
  | { ok: false; error: "TOO_MANY_COURSES" };

/**
 * Parse a comma-separated `courses` query value into unique canonical codes,
 * preserving first-seen order. Rejects empty, malformed, or oversized input.
 */
export function parseCoursesQuery(raw: string | null): ParsedCoursesQuery {
  if (raw == null) {
    return { ok: false, error: "MISSING_COURSES" };
  }

  const segments = raw.split(",").map((segment) => segment.trim());
  const nonempty = segments.filter((segment) => segment.length > 0);

  if (nonempty.length === 0) {
    return { ok: false, error: "MISSING_COURSES" };
  }

  const invalidCourseCodes: string[] = [];
  const seen = new Set<string>();
  const courseCodes: string[] = [];

  for (const segment of nonempty) {
    if (!isValidTransferCourseCode(segment)) {
      invalidCourseCodes.push(segment);
      continue;
    }

    const canonical = normalizeTransferCourseCode(segment);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    courseCodes.push(canonical);
  }

  if (invalidCourseCodes.length > 0) {
    return { ok: false, error: "INVALID_COURSE_CODE", invalidCourseCodes };
  }

  if (courseCodes.length > MAX_TRANSFER_COVERAGE_COURSES) {
    return { ok: false, error: "TOO_MANY_COURSES" };
  }

  return { ok: true, courseCodes };
}
