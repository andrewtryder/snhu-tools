import type { TransferRow } from "./seoQueries";

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => (value ?? "").trim())
        .filter(Boolean)
    )
  );
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

export function summarizeCoursePage(courseNumber: string, rows: TransferRow[]): string {
  const optionCount = rows.length;
  const organizations = uniqueNonEmpty(rows.map((row) => row.groupFilter2Name));
  const levels = uniqueNonEmpty(rows.map((row) => row.academicLevel));

  const parts = [
    `SNHU ${courseNumber} currently has ${optionCount} listed transfer ${pluralize(optionCount, "option")}`,
  ];

  if (organizations.length > 0) {
    parts.push(
      `from ${organizations.length} ${pluralize(organizations.length, "organization")}`
    );
  }

  if (levels.length > 0) {
    parts.push(
      `across ${levels.length} academic ${pluralize(levels.length, "level")}`
    );
  }

  return `${parts.join(" ")}.`;
}

export function summarizeSubjectPage(subject: string, rows: TransferRow[]): string {
  const optionCount = rows.length;
  const courses = uniqueNonEmpty(rows.map((row) => row.courseNumber));
  const organizations = uniqueNonEmpty(rows.map((row) => row.groupFilter2Name));

  const parts = [
    `The ${subject} subject includes ${optionCount} listed transfer ${pluralize(optionCount, "option")}`,
  ];

  if (courses.length > 0) {
    parts.push(
      `across ${courses.length} SNHU ${pluralize(courses.length, "course")}`
    );
  }

  if (organizations.length > 0) {
    parts.push(
      `from ${organizations.length} ${pluralize(organizations.length, "organization")}`
    );
  }

  return `${parts.join(" ")}.`;
}

export function summarizeOrganizationPage(organization: string, rows: TransferRow[]): string {
  const optionCount = rows.length;
  const courses = uniqueNonEmpty(rows.map((row) => row.courseNumber));
  const subjects = uniqueNonEmpty(rows.map((row) => row.subjectPrefix));

  const parts = [
    `${organization} currently has ${optionCount} listed transfer ${pluralize(optionCount, "option")}`,
  ];

  if (courses.length > 0) {
    parts.push(
      `mapping to ${courses.length} SNHU ${pluralize(courses.length, "course")}`
    );
  }

  if (subjects.length > 0) {
    parts.push(
      `across ${subjects.length} subject ${pluralize(subjects.length, "area")}`
    );
  }

  return `${parts.join(" ")}.`;
}

export function summarizeLevelPage(level: string, rows: TransferRow[]): string {
  const optionCount = rows.length;
  const courses = uniqueNonEmpty(rows.map((row) => row.courseNumber));
  const organizations = uniqueNonEmpty(rows.map((row) => row.groupFilter2Name));
  const label = level.trim();

  const parts = [
    `The ${label} directory contains ${optionCount} listed transfer ${pluralize(optionCount, "option")}`,
  ];

  if (courses.length > 0) {
    parts.push(
      `across ${courses.length} SNHU ${pluralize(courses.length, "course")}`
    );
  }

  if (organizations.length > 0) {
    parts.push(
      `from ${organizations.length} ${pluralize(organizations.length, "organization")}`
    );
  }

  return `${parts.join(" ")}.`;
}
