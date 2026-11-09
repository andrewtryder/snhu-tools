/** Maximum number of course IDs accepted in a batch (API or SSR). */
export const MAX_COURSE_IDS = 10;

/** Catalog course IDs look like CS250, MATH142, ENG122H, IT-140. */
const COURSE_ID_PATTERN = /^[A-Z]{1,6}\d{2,4}[A-Z]{0,2}$/;

/** Letters, digits, optional letter suffix (labs / electives such as L or ELE). */
const TRANSFER_COURSE_CODE_PATTERN = /^[A-Z]{1,12}\d{1,5}[A-Z]{0,4}$/;

export type CourseIdParseErrorCode = "empty" | "invalid" | "too_many";

export interface CourseIdParseError {
  id?: string;
  code: CourseIdParseErrorCode;
  message: string;
}

export interface ParseCourseIdListResult {
  ids: string[];
  errors: CourseIdParseError[];
}

/** Convert catalog course-code variants into the display form used everywhere. */
export function normalizeCourseCode(value: string | null | undefined): string {
  const source = value?.replace(/\u00a0/g, " ").trim() || "";
  if (!source) return "";

  const match = source.match(/\b([a-z]{2,4})[\s-]*(\d{3}[a-z]?)\b/i);
  if (!match) return source.replace(/\s+/g, " ").toUpperCase();

  return `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
}

/** Stable identity for graph nodes and comparisons, e.g. `ACC 201` -> `ACC201`. */
export function getCourseCodeKey(value: string | null | undefined): string {
  return normalizeCourseCode(value).replace(/[^A-Z0-9]/g, "");
}

export const getCourseNodeId = getCourseCodeKey;

export function extractNormalizedCourseCodes(value: string): string[] {
  const codes = new Set<string>();
  const pattern = /\b([a-z]{2,4})[\s\u00a0-]*(\d{3}[a-z]?)\b/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const code = normalizeCourseCode(match[0]);
    if (code) codes.add(code);
  }

  return [...codes];
}

/** Canonical compact course identifier: trim, uppercase, strip spaces and hyphens. */
export function normalizeCourseId(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, "");
}

export const normalizeTransferCourseCode = normalizeCourseId;

/** Canonical local route for a normalized Courses course ID. */
export function coursePath(courseId: string): string {
  return `/courses/${encodeURIComponent(normalizeCourseId(courseId))}`;
}

export function isValidCourseId(id: string): boolean {
  return COURSE_ID_PATTERN.test(id);
}

/**
 * Human-readable display form when spacing is unambiguous.
 * Example: "CS110" → "CS 110", "BIO120L" → "BIO 120L"
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

/**
 * Split a comma-separated list, normalize, validate, and deduplicate.
 * Malformed tokens and over-limit lists are reported in `errors`.
 */
export function parseCourseIdList(
  input: string,
  options: { max?: number } = {},
): ParseCourseIdListResult {
  const max = options.max ?? MAX_COURSE_IDS;
  const errors: CourseIdParseError[] = [];
  const seen = new Set<string>();
  const ids: string[] = [];

  const tokens = input
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return {
      ids: [],
      errors: [{ code: "empty", message: "No course IDs provided." }],
    };
  }

  for (const token of tokens) {
    const id = normalizeCourseId(token);
    if (!isValidCourseId(id)) {
      errors.push({
        id: token,
        code: "invalid",
        message: `Invalid course ID: ${token}`,
      });
      continue;
    }
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }

  if (ids.length > max) {
    errors.push({
      code: "too_many",
      message: `At most ${max} course IDs are allowed (got ${ids.length}).`,
    });
    return { ids: ids.slice(0, max), errors };
  }

  return { ids, errors };
}
