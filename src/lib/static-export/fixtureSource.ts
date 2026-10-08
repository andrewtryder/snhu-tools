import { fixturePrograms } from "@/data/fixturePrograms";
import { transformCourses, type CoursesExport } from "./courses";
import type { ProgramsExport } from "./programs";
import { transformSearch, type SearchExport } from "./search";
import { transformTransfers, type TransfersExport } from "./transfers";
import type { SnapshotBundles } from "./snapshot";

/**
 * Deliberately small, source-controlled test catalog. This is the only input
 * for `--fixture`; it never reads the active deployment snapshot directory.
 */
export function buildFixtureSnapshot(): SnapshotBundles {
  const directory = fixturePrograms.map((program) => ({ slug: program.slug, title: program.title, degreeLevel: program.degreeLevel, credential: program.credential, catalogYear: program.catalogYear, totalCredits: program.totalCredits, requiredCourseCount: program.requiredCourseCount, description: program.description, sourceCatalogUrl: program.sourceCatalogUrl ?? null })).sort((a, b) => a.slug.localeCompare(b.slug));
  const bySlug = Object.fromEntries(fixturePrograms.map((program) => [program.slug, program])) as ProgramsExport["bySlug"];
  const programs: ProgramsExport = { meta: { domain: "programs", counts: { programs: directory.length } }, directory, bySlug, sitemap: directory.map((program) => ({ slug: program.slug, updatedAt: null })), catalogYears: [...new Set(directory.map((program) => program.catalogYear))].sort().reverse(), lastUpdated: null };
  const courses: CoursesExport = transformCourses([
    { catalog_course_id: "CS210", title: "Programming Languages", pid: "fixture-cs210", description: "Fixture course", academic_level: "Undergraduate", credits: "3", subject_code: "CS" },
    { catalog_course_id: "IT140", title: "Introduction to Scripting", pid: "fixture-it140", description: "Fixture course", academic_level: "Undergraduate", credits: "3", subject_code: "IT" },
    { catalog_course_id: "IT145", title: "Intro to Software Development", pid: "fixture-it145", description: "Fixture course", academic_level: "Undergraduate", credits: "3", subject_code: "IT" },
    { catalog_course_id: "PSY321", title: "Research Methods in Psychology II", pid: "fixture-psy321", description: "Fixture course", academic_level: "Undergraduate", credits: "3", subject_code: "PSY" },
  ], [{ parent_id: "PSY321", parent_title: "Research Methods in Psychology II", child_id: "PSY222", child_title: "Research Methods in Psychology I" }], null);
  const transferRows = [
    { subjectPrefix: "PSY", courseNumber: "PSY321", title: "Research Methods in Psychology II", pid: "fixture-transfer-psy321", eligibilityTimeframe: null, groupFilter2Name: "Fixture College", academicLevel: "Undergraduate", coursePID: "fixture-psy321" },
    ...[0, 1].map((index) => ({ subjectPrefix: "CS", courseNumber: "CS210", title: "Programming Languages", pid: `fixture-transfer-cs210-${index}`, eligibilityTimeframe: null, groupFilter2Name: `Fixture Provider ${index}`, academicLevel: "Undergraduate", coursePID: "fixture-cs210" })),
    ...Array.from({ length: 13 }, (_, index) => ({ subjectPrefix: "ACC", courseNumber: "ACC201", title: "Financial Accounting", pid: `fixture-transfer-acc201-${index}`, eligibilityTimeframe: null, groupFilter2Name: `Fixture Provider ${index}`, academicLevel: "Undergraduate", coursePID: "fixture-acc201" })),
  ];
  const transfers: TransfersExport = transformTransfers(transferRows, null);
  const search: SearchExport = transformSearch(programs, courses, transfers);
  return { programs, courses, transfers, search };
}
