import "server-only";
import { cache } from "react";
import { getStaticSnapshot } from "@/lib/staticSnapshots";
import { getCourseCodeKey, normalizeCourseCode } from "@/lib/courseCode";
import { rankRelatedPrograms, type RelatedProgramCandidate } from "@/lib/relatedPrograms";
import type { DegreeLevel, DegreeProgram } from "@/types/program";

export function toIsoDateString(value: Date | string | null | undefined): string | undefined { if (!value) return undefined; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? undefined : date.toISOString(); }
export interface ProgramSummary { slug: string; title: string; degreeLevel: DegreeLevel; credential: string; catalogYear: string; totalCredits: number | null; requiredCourseCount: number; description: string; sourceCatalogUrl: string | null; }
export interface SitemapProgram { slug: string; updatedAt: Date | null; }
type ProgramsBundle = { directory: ProgramSummary[]; bySlug: Record<string, DegreeProgram>; sitemap: Array<{ slug: string; updatedAt: string | null }>; catalogYears: string[]; lastUpdated: string | null } & { meta: { domain: "programs"; counts: Record<string, number> } };
const data = () => getStaticSnapshot<ProgramsBundle>("programs");
export const getPrograms = cache(async (options?: { level?: string; year?: string }): Promise<DegreeProgram[]> => Object.values(data().bySlug).filter((program) => (!options?.level || options.level === "ALL" || program.degreeLevel === options.level) && (!options?.year || program.catalogYear === options.year)).sort((a, b) => a.title.localeCompare(b.title)));
export const getProgramBySlug = cache(async (slug: string) => data().bySlug[slug] ?? null);
export async function searchPrograms(query: string, options?: { limit?: number; level?: string }) { const q = query.trim().toLowerCase(); if (q.length < 2) return []; const key = getCourseCodeKey(q); const limit = Math.min(options?.limit ?? 15, 30); return data().directory.filter((program) => (!options?.level || options.level === "ALL" || program.degreeLevel === options.level) && [program.title, program.credential, program.slug].some((field) => field.toLowerCase().includes(q)) || (data().bySlug[program.slug]?.nodes ?? []).some((node) => normalizeCourseCode(node.code) === key)).slice(0, limit).map((program) => ({ slug: program.slug, title: program.title, credential: program.credential, degreeLevel: program.degreeLevel, matchedText: program.title })); }
export const getCatalogYears = cache(async () => [...data().catalogYears]);
export const getPopularPrograms = cache(async () => (await getPrograms()).slice(0, 3));
export const getProgramsForCourse = cache(async (courseCode: string) => { const key = normalizeCourseCode(courseCode); return (await getPrograms()).filter((program) => program.nodes.some((node) => normalizeCourseCode(node.code) === key)); });
export const getProgramSyncState = cache(async (): Promise<{ status: string; last_error: string | null; completed_at: string | null; next_due_at: string | null } | null> => null);
export const getSitemapPrograms = cache(async (): Promise<SitemapProgram[]> => data().sitemap.map((entry) => ({ slug: entry.slug, updatedAt: entry.updatedAt ? new Date(entry.updatedAt) : null })));
export const getRelatedPrograms = cache(async (slug: string, limit = 6): Promise<RelatedProgramCandidate[]> => { const current = await getProgramBySlug(slug); if (!current) return []; const courseCodes = new Set(current.nodes.map((node) => normalizeCourseCode(node.code))); return rankRelatedPrograms(current, data().directory.map((program) => ({ slug: program.slug, title: program.title, credential: program.credential, degreeLevel: program.degreeLevel, sharedCourseCount: (data().bySlug[program.slug]?.nodes ?? []).filter((node) => courseCodes.has(normalizeCourseCode(node.code))).length })), limit); });
export const getCatalogLastUpdated = cache(async () => { const raw = data().lastUpdated; return raw ? new Date(raw) : null; });
