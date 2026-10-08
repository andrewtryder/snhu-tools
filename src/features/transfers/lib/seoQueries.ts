import { cache } from "react";
import { getStaticSnapshot } from "@/lib/staticSnapshots";
import { normalizeCourseNumber, slugify } from "./slug";
export type TransferRow = { subjectPrefix: string | null; courseNumber: string | null; title: string | null; pid: string | null; eligibilityTimeframe: string | null; groupFilter2Name: string | null; academicLevel: string | null; coursePID: string | null; };
export type FacetSummary = { value: string; count: number; slug: string; };
export type DirectoryEntry = FacetSummary;
export type CourseDirectoryEntry = DirectoryEntry & { subjectPrefix: string; };
type TransfersBundle = { rows: TransferRow[]; lastModified: string | null } & { meta: { domain: "transfers"; counts: Record<string, number> } };
const rows = () => getStaticSnapshot<TransfersBundle>("transfers").rows;
const distinct = (get: (row: TransferRow) => string | null) => [...new Set(rows().map(get).filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))].sort();
const directory = (get: (row: TransferRow) => string | null): DirectoryEntry[] => { const counts = new Map<string, number>(); for (const row of rows()) { const value = get(row)?.trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); } return [...counts].map(([value, count]) => ({ value, count, slug: slugify(value) })).sort((a, b) => a.value.localeCompare(b.value)); };
export const getAllTransferRows = cache(async () => [...rows()]);
export const getDistinctSubjects = cache(async () => distinct((row) => row.subjectPrefix));
export const getDistinctOrganizations = cache(async () => distinct((row) => row.groupFilter2Name));
export const getDistinctLevels = cache(async () => distinct((row) => row.academicLevel));
export const getDistinctCourseNumbers = cache(async () => distinct((row) => row.courseNumber));
export const getSubjectDirectoryEntries = cache(async () => directory((row) => row.subjectPrefix));
export const getOrganizationDirectoryEntries = cache(async () => directory((row) => row.groupFilter2Name));
export const getLevelDirectoryEntries = cache(async () => directory((row) => row.academicLevel));
export const getCourseDirectoryEntries = cache(async (): Promise<CourseDirectoryEntry[]> => directory((row) => row.courseNumber).map((entry) => ({ ...entry, subjectPrefix: rows().find((row) => row.courseNumber?.trim() === entry.value)?.subjectPrefix?.trim() ?? "" })));
export const getTransferLastModified = cache(async () => { const value = getStaticSnapshot<TransfersBundle>("transfers").lastModified; return value ? new Date(value) : null; });
export const getRowsBySubject = cache(async (subject: string) => rows().filter((row) => row.subjectPrefix?.trim() === subject.trim()));
export const getRowsByOrganization = cache(async (organization: string) => rows().filter((row) => row.groupFilter2Name?.trim() === organization.trim()));
export const getRowsByLevel = cache(async (level: string) => rows().filter((row) => row.academicLevel?.trim() === level.trim()));
export const getRowsByCourseNumber = cache(async (course: string) => rows().filter((row) => normalizeCourseNumber(row.courseNumber ?? "") === normalizeCourseNumber(course)));
export function buildFacetSummaries(source: TransferRow[], limit = 20) { const build = (values: Array<string | null>): FacetSummary[] => { const counts = new Map<string, number>(); values.forEach((raw) => { const value = raw?.trim(); if (value) counts.set(value, (counts.get(value) ?? 0) + 1); }); return [...counts].map(([value, count]) => ({ value, count, slug: slugify(value) })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)).slice(0, limit); }; return { subjects: build(source.map((row) => row.subjectPrefix)), organizations: build(source.map((row) => row.groupFilter2Name)), levels: build(source.map((row) => row.academicLevel)), courses: build(source.map((row) => row.courseNumber)) }; }
export function getRelatedFacets(source: TransferRow[]) { const values = (get: (row: TransferRow) => string | null) => [...new Set(source.map(get).filter((value): value is string => Boolean(value)))].sort(); return { subjects: values((row) => row.subjectPrefix), organizations: values((row) => row.groupFilter2Name), levels: values((row) => row.academicLevel), courses: values((row) => row.courseNumber) }; }
const resolve = (get: (row: TransferRow) => string | null, slug: string) => distinct(get).find((value) => slugify(value) === slugify(slug)) ?? null;
export const resolveSubjectBySlug = cache(async (slug: string) => resolve((row) => row.subjectPrefix, slug));
export const resolveOrganizationBySlug = cache(async (slug: string) => resolve((row) => row.groupFilter2Name, slug));
export const resolveLevelBySlug = cache(async (slug: string) => resolve((row) => row.academicLevel, slug));
export async function getTransferSitemapData() { return { courseNumbers: await getDistinctCourseNumbers(), subjects: await getDistinctSubjects(), organizations: await getDistinctOrganizations(), levels: await getDistinctLevels(), lastModified: await getTransferLastModified() }; }
