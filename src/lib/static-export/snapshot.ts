import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isValidTransferCourseCode } from "@/features/transfers/lib/courseCode";
import type { CourseReconciliation, CourseSourceCoverage, CoursesExport } from "./courses";
import type { ProgramsExport } from "./programs";
import type { SearchExport } from "./search";
import type { TransfersExport } from "./transfers";

export type DomainName = "programs" | "courses" | "transfers" | "search";
export type SnapshotBundles = { programs: ProgramsExport; courses: CoursesExport; transfers: TransfersExport; search: SearchExport };
export type SnapshotProvenance = { kind: "fixture" | "json-import" | "postgres"; source: string; sourceDigest: string; approvalReference: string | null; approved: boolean };
export type SnapshotManifest = { schemaVersion: 1; createdAt: string; fixture: boolean; provenance?: SnapshotProvenance; domains: Record<DomainName, { file: string; sha256: string; required: true; counts: Record<string, number> }> };
export type SnapshotReport = { fixture: boolean; provenance: SnapshotProvenance; baseline: "none" | "fixture" | "approved"; counts: Record<DomainName, number>; rawBytes: Record<DomainName, number>; reconciliation: { courses: CourseReconciliation | null }; sourceCoverage?: { courses: CourseSourceCoverage | null }; warnings: string[] };
export type StageOptions = { fixture: boolean; provenance: SnapshotProvenance; baseline?: SnapshotManifest | null; minimumRetention?: number };

const names: readonly DomainName[] = ["programs", "courses", "transfers", "search"];
const stable = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fixtureDigests = { programs: "96cf88587e9425c5adf24e8e657ccef560e8297a679c9e69fa5af0bee37f3357", courses: "e54ec42808fcd35015a7f70b10f84062d477990fda7743a82370c333e4822c18", transfers: "dd2c0c34d171e1cff2b4b6a532b84828bf6739176a750cd6dddaf37181a8e062", search: "5e014d5329498de55fa38a7a1b84059763ac5e757a11f26062937ecd707120fe" } as const;

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const hasText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const validDate = (value: unknown) => hasText(value) && !Number.isNaN(new Date(value).getTime());
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const sortedUnique = (values: string[]) => [...new Set(values)].sort();
const count = (name: DomainName, bundle: SnapshotBundles[DomainName]) => name === "programs" ? (bundle as ProgramsExport).directory.length : name === "courses" ? (bundle as CoursesExport).ids.length : name === "transfers" ? (bundle as TransfersExport).rows.length : (bundle as SearchExport).meta.counts.entries;
const countsFor = (name: DomainName, bundle: SnapshotBundles[DomainName]) => {
  if (name === "programs") return { programs: (bundle as ProgramsExport).directory.length };
  if (name === "courses") { const courses = bundle as CoursesExport; return { ids: courses.ids.length, records: Object.keys(courses.records).length, edges: courses.edges.length }; }
  if (name === "transfers") return { rows: (bundle as TransfersExport).rows.length };
  const search = bundle as SearchExport; return { entries: search.programs.length + search.courses.length + search.transfers.length };
};
const containsSecret = (value: unknown, pathName = "root"): string | undefined => { if (!value || typeof value !== "object") return; for (const [key, child] of Object.entries(value as Record<string, unknown>)) { if (/password|secret|token|postgres|connection|string/i.test(key) && !/description/i.test(key)) return `${pathName}.${key}`; const found = containsSecret(child, `${pathName}.${key}`); if (found) return found; } };
const canonicalRows = (rows: unknown[]) => rows.map((row) => JSON.stringify(row)).sort();
const knownFixture = (bundles: SnapshotBundles) => names.every((name) => hash(bundles[name]) === fixtureDigests[name]);

function assertCounts(name: DomainName, bundle: SnapshotBundles[DomainName], fixture: boolean) {
  if (!isObject(bundle) || !isObject(bundle.meta) || bundle.meta.domain !== name || !isObject(bundle.meta.counts)) throw new Error(`Invalid ${name} metadata`);
  const expected = countsFor(name, bundle);
  const actual = bundle.meta.counts;
  const required = name === "courses" && fixture && !("edges" in actual) ? ["ids", "records"] : Object.keys(expected);
  const expectedRecord = expected as unknown as Record<string, number>;
  const actualRecord = actual as Record<string, number>;
  if (Object.keys(actual).length !== required.length || required.some((key) => actualRecord[key] !== expectedRecord[key] || !Number.isInteger(actualRecord[key]) || actualRecord[key] < 0)) throw new Error(`Invalid ${name} counts`);
  if (Object.values(expected).some((value) => value <= 0)) throw new Error(`Incomplete ${name} dataset`);
}

function assertPrograms(programs: ProgramsExport) {
  const directorySlugs = programs.directory.map((program) => program.slug);
  if (!directorySlugs.length || sortedUnique(directorySlugs).length !== directorySlugs.length) throw new Error("Program directory has duplicate or empty slugs");
  if (!same(sortedUnique(directorySlugs), sortedUnique(Object.keys(programs.bySlug)))) throw new Error("Program directory and details disagree");
  const sitemap = new Map<string, string | null>();
  for (const entry of programs.sitemap) { if (!hasText(entry.slug) || sitemap.has(entry.slug) || !directorySlugs.includes(entry.slug) || (entry.updatedAt !== null && !validDate(entry.updatedAt))) throw new Error("Program sitemap is invalid"); sitemap.set(entry.slug, entry.updatedAt); }
  if (!same(sortedUnique(directorySlugs), sortedUnique([...sitemap.keys()]))) throw new Error("Program sitemap and directory disagree");
  for (const directory of programs.directory) {
    const detail = programs.bySlug[directory.slug];
    if (!detail || !hasText(directory.title) || !hasText(directory.credential) || !hasText(directory.catalogYear) || !Number.isInteger(directory.requiredCourseCount) || directory.requiredCourseCount < 0 || !same(directory, { slug: detail.slug, title: detail.title, degreeLevel: detail.degreeLevel, credential: detail.credential, catalogYear: detail.catalogYear, totalCredits: detail.totalCredits, requiredCourseCount: detail.requiredCourseCount, description: detail.description, sourceCatalogUrl: detail.sourceCatalogUrl })) throw new Error(`Program ${directory.slug} detail does not match directory`);
    if (!Array.isArray(detail.groups) || !detail.groups.length || !Array.isArray(detail.nodes) || !Array.isArray(detail.edges)) throw new Error(`Program ${directory.slug} is structurally incomplete`);
    const nodeIds = new Set(detail.nodes.map((node) => node.id));
    for (const group of detail.groups) if (!hasText(group.id) || !hasText(group.title) || !Array.isArray(group.items)) throw new Error(`Program ${directory.slug} has malformed requirements`);
    for (const edge of detail.edges) if ((edge.type !== "prerequisite" && edge.type !== "corequisite") || !nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error(`Program ${directory.slug} has invalid graph edge`);
    if (directory.sourceCatalogUrl !== null && !hasText(directory.sourceCatalogUrl)) throw new Error(`Program ${directory.slug} has invalid source URL`);
  }
  const years = sortedUnique(programs.directory.map((program) => program.catalogYear)).sort().reverse();
  if (!same(programs.catalogYears, years)) throw new Error("Program catalog years are inconsistent");
  if (programs.lastUpdated !== null && !validDate(programs.lastUpdated)) throw new Error("Program lastUpdated is invalid");
}

function assertCourses(courses: CoursesExport, fixture: boolean) {
  if (!Array.isArray(courses.ids) || !Array.isArray(courses.summaries) || !isObject(courses.records) || !Array.isArray(courses.edges)) throw new Error("Course bundle is structurally invalid");
  if (sortedUnique(courses.ids).length !== courses.ids.length || courses.ids.some((id) => !hasText(id))) throw new Error("Course identifiers are invalid");
  if (!same(sortedUnique(courses.ids), sortedUnique(Object.keys(courses.records)))) throw new Error("Course identifiers and records disagree");
  const summaries = new Map<string, string>();
  for (const summary of courses.summaries) { if (!hasText(summary.catalog_course_id) || !hasText(summary.title) || summaries.has(summary.catalog_course_id)) throw new Error("Course summaries are invalid"); summaries.set(summary.catalog_course_id, summary.title); }
  if (!same(sortedUnique(courses.ids), sortedUnique([...summaries.keys()]))) throw new Error("Course identifiers and summaries disagree");
  for (const id of courses.ids) { const record = courses.records[id]; if (!record || record.catalog_course_id !== id || !hasText(record.title) || record.title !== summaries.get(id)) throw new Error(`Course ${id} is invalid`); }
  const children = new Map<string, string[]>(); const edgeKeys = new Set<string>();
  for (const edge of courses.edges) { const key = `${edge.parentId}\0${edge.childId}`; if (!hasText(edge.parentId) || !hasText(edge.childId) || !hasText(edge.parentTitle) || !hasText(edge.childTitle) || !courses.records[edge.parentId] || edge.parentTitle !== courses.records[edge.parentId].title || edgeKeys.has(key)) throw new Error("Course graph has an invalid edge"); edgeKeys.add(key); children.set(edge.parentId, [...(children.get(edge.parentId) ?? []), edge.childId]); }
  const visit = (id: string, path: Set<string>) => { if (path.has(id)) return; for (const child of children.get(id) ?? []) visit(child, new Set(path).add(id)); };
  for (const id of courses.ids) visit(id, new Set());
  if (courses.lastModified !== null && !validDate(courses.lastModified)) throw new Error("Course lastModified is invalid");
  if (!fixture && !validDate(courses.lastModified)) throw new Error("Non-fixture courses require lastModified");
  const reconciliation = courses.reconciliation;
  if (!reconciliation) { if (!fixture) throw new Error("Non-fixture courses require source reconciliation"); return; }
  const records = reconciliation.records; const edgesReconciliation = reconciliation.prerequisiteEdges;
  if (![records.sourceRows, records.exportedRecords, records.duplicateRows, records.rejectedRows, edgesReconciliation.sourceRows, edgesReconciliation.exportedEdges, edgesReconciliation.duplicateRows, edgesReconciliation.rejectedRows, edgesReconciliation.externalReferences, edgesReconciliation.duplicateExternalRows].every(Number.isInteger) || records.sourceRows !== records.exportedRecords + records.duplicateRows + records.rejectedRows || edgesReconciliation.sourceRows !== edgesReconciliation.exportedEdges + edgesReconciliation.duplicateRows + edgesReconciliation.rejectedRows || records.exportedRecords !== courses.ids.length || edgesReconciliation.exportedEdges !== courses.edges.length || edgesReconciliation.rejectedRows !== 0 || records.rejectedRows !== 0 || edgesReconciliation.externalReferences < 0 || edgesReconciliation.externalReferences > courses.edges.length || edgesReconciliation.duplicateExternalRows < 0 || edgesReconciliation.duplicateExternalRows > edgesReconciliation.duplicateRows) throw new Error("Course source reconciliation is invalid");
  if (!fixture && !reconciliation.sourceCoverage) throw new Error("Approved real-data snapshots require course source coverage reconciliation");
  if (reconciliation.sourceCoverage) {
    const { coursesData, prerequisites } = reconciliation.sourceCoverage;
    const cd = coursesData.excluded;
    const pr = prerequisites.excluded;
    const un = prerequisites.unmatched;
    const allInts = [
      coursesData.totalRows, coursesData.candidateRows, cd.missingCatalogCourseId,
      prerequisites.totalRows, prerequisites.candidateRows,
      pr.orphanClassId, pr.parentMissingCatalogCourseId, pr.missingPrerequisiteCourseId, pr.selfReference,
      un.externalPrerequisites,
    ].every((n) => Number.isInteger(n) && n >= 0);
    if (!allInts) throw new Error("Course source coverage contains invalid counts");
    if (coursesData.totalRows !== coursesData.candidateRows + cd.missingCatalogCourseId) {
      throw new Error("courses_data source coverage does not balance");
    }
    if (coursesData.candidateRows !== records.sourceRows) {
      throw new Error("courses_data candidate rows do not match reconciliation source rows");
    }
    if (prerequisites.totalRows !== prerequisites.candidateRows + pr.orphanClassId + pr.parentMissingCatalogCourseId + pr.missingPrerequisiteCourseId + pr.selfReference) {
      throw new Error("prerequisites source coverage does not balance");
    }
    if (prerequisites.candidateRows !== edgesReconciliation.sourceRows) {
      throw new Error("prerequisites candidate rows do not match reconciliation source rows");
    }
    if (un.externalPrerequisites !== edgesReconciliation.externalReferences + edgesReconciliation.duplicateExternalRows) {
      throw new Error("prerequisites external references do not match reconciliation count");
    }
  }
}

function assertTransfers(transfers: TransfersExport, fixture: boolean) {
  if (!Array.isArray(transfers.rows) || !transfers.rows.length) throw new Error("Transfers are empty");
  for (const row of transfers.rows) { if (!hasText(row.courseNumber) || !isValidTransferCourseCode(row.courseNumber)) throw new Error("Transfer has invalid course identifier"); for (const key of ["subjectPrefix", "title", "pid", "eligibilityTimeframe", "groupFilter2Name", "academicLevel", "coursePID"] as const) if (!(key in row) || (row[key] !== null && typeof row[key] !== "string")) throw new Error("Transfer has malformed metadata"); }
  if (transfers.lastModified !== null && !validDate(transfers.lastModified)) throw new Error("Transfer lastModified is invalid");
  if (!fixture && !validDate(transfers.lastModified)) throw new Error("Non-fixture transfers require lastModified");
}

function assertSearch(bundles: SnapshotBundles) {
  const { programs, courses, transfers, search } = bundles;
  const actual = search.programs.length + search.courses.length + search.transfers.length;
  if (search.meta.counts.entries !== actual || !same(canonicalRows(search.programs), canonicalRows(programs.directory)) || !same(canonicalRows(search.courses), canonicalRows(courses.summaries)) || !same(canonicalRows(search.transfers), canonicalRows(transfers.rows))) throw new Error("Search index does not exactly match source domains");
}

function approved(manifest: SnapshotManifest | null | undefined) { return Boolean(manifest && !manifest.fixture && manifest.provenance?.approved); }
function assertProvenance(provenance: SnapshotProvenance, fixture: boolean) { if (!hasText(provenance.source) || !/^[a-f0-9]{64}$/i.test(provenance.sourceDigest) || (fixture !== (provenance.kind === "fixture")) || provenance.approved === fixture || (!fixture && !hasText(provenance.approvalReference))) throw new Error("Invalid snapshot provenance"); }

export function validateSnapshot(bundles: SnapshotBundles, options: Pick<StageOptions, "fixture" | "provenance" | "baseline" | "minimumRetention">): SnapshotReport {
  const { fixture, provenance, baseline, minimumRetention = 0.5 } = options;
  if (minimumRetention <= 0 || minimumRetention > 1) throw new Error("Invalid retention threshold");
  assertProvenance(provenance, fixture);
  if (!fixture && knownFixture(bundles)) throw new Error("Known fixture bundles cannot be relabeled as production data");
  for (const name of names) { assertCounts(name, bundles[name], fixture); const secret = containsSecret(bundles[name]); if (secret) throw new Error(`Potential secret in ${name} at ${secret}`); }
  assertPrograms(bundles.programs); assertCourses(bundles.courses, fixture); assertTransfers(bundles.transfers, fixture); assertSearch(bundles);
  const baselineKind = baseline?.fixture ? "fixture" : approved(baseline) ? "approved" : "none";
  const warnings: string[] = [];
  if (baselineKind === "approved") for (const name of names) { const before = baseline!.domains[name]?.counts; const after = countsFor(name, bundles[name]) as unknown as Record<string, number>; const primary = name === "programs" ? "programs" : name === "courses" ? "ids" : name === "transfers" ? "rows" : "entries"; const beforePrimary = before?.[primary]; if (!before || !Number.isInteger(beforePrimary) || Object.keys(before).some((key) => after[key] === undefined)) throw new Error(`Approved baseline has invalid ${name} counts`); if (beforePrimary > 0 && after[primary] / beforePrimary < minimumRetention) throw new Error(`${name} count fell below ${minimumRetention * 100}% of approved baseline`); } else warnings.push("No approved production baseline was available for count comparison");
  const counts = Object.fromEntries(names.map((name) => [name, count(name, bundles[name])])) as SnapshotReport["counts"];
  const rawBytes = Object.fromEntries(names.map((name) => [name, Buffer.byteLength(stable(bundles[name]))])) as SnapshotReport["rawBytes"];
  return { fixture, provenance, baseline: baselineKind, counts, rawBytes, reconciliation: { courses: bundles.courses.reconciliation ?? null }, ...(bundles.courses.reconciliation?.sourceCoverage ? { sourceCoverage: { courses: bundles.courses.reconciliation.sourceCoverage } } : {}), warnings };
}

export function createManifest(bundles: SnapshotBundles, fixture: boolean, provenance: SnapshotProvenance, createdAt = new Date().toISOString()): SnapshotManifest { if (!validDate(createdAt)) throw new Error("Invalid manifest creation timestamp"); return { schemaVersion: 1, createdAt, fixture, provenance, domains: Object.fromEntries(names.map((name) => [name, { file: `${name}.json`, sha256: hash(bundles[name]), required: true, counts: countsFor(name, bundles[name]) }])) as unknown as SnapshotManifest["domains"] }; }
export function verifyManifest(bundles: SnapshotBundles, manifest: SnapshotManifest) {
  if (manifest.schemaVersion !== 1 || !validDate(manifest.createdAt) || typeof manifest.fixture !== "boolean") throw new Error("Invalid snapshot manifest");
  if (manifest.provenance) assertProvenance(manifest.provenance, manifest.fixture);
  for (const name of names) {
    const entry = manifest.domains?.[name];
    const expected = countsFor(name, bundles[name]);
    const legacyFixtureCourses = Boolean(entry && manifest.fixture && name === "courses" && !("edges" in entry.counts) && entry.counts.ids === (expected as { ids?: number }).ids && entry.counts.records === (expected as { records?: number }).records);
    const countMatches = Boolean(entry && same(entry.counts, bundles[name].meta.counts) && (same(entry.counts, expected) || legacyFixtureCourses));
    if (!entry?.required || entry.file !== `${name}.json` || entry.sha256 !== hash(bundles[name]) || !countMatches) throw new Error(`Manifest validation failed for ${name}`);
  }
}
export async function loadBundles(directory: string): Promise<SnapshotBundles> { const result = {} as SnapshotBundles; for (const name of names) result[name] = JSON.parse(await readFile(path.join(directory, `${name}.json`), "utf8")); return result; }
export async function loadManifest(directory: string): Promise<SnapshotManifest | null> { try { return JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")) as SnapshotManifest; } catch { return null; } }

async function writeJsonAtomic(filename: string, value: unknown) { const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`; await writeFile(temporary, stable(value)); await rename(temporary, filename); }
const journalFor = (active: string) => path.join(path.dirname(active), ".snapshot-promotion.json");
type PromotionJournal = { active: string; stage: string; backup: string; phase: "prepared" | "active-moved" | "activated" };
function safeSibling(candidate: string, active: string, prefix: string) { const resolved = path.resolve(candidate); if (path.dirname(resolved) !== path.dirname(path.resolve(active)) || !path.basename(resolved).startsWith(prefix)) throw new Error("Snapshot path is outside the controlled staging area"); return resolved; }
async function exists(directory: string) { try { await lstat(directory); return true; } catch { return false; } }

/** Restore a complete active directory after an interrupted rename-based promotion. Safe to run repeatedly. */
export async function recoverSnapshotPromotion(active: string): Promise<"none" | "restored" | "finalized"> { const journal = journalFor(active); let state: PromotionJournal; try { state = JSON.parse(await readFile(journal, "utf8")) as PromotionJournal; } catch { return "none"; } if (path.resolve(state.active) !== path.resolve(active)) throw new Error("Promotion journal targets a different active directory"); safeSibling(state.stage, active, ".snapshot-stage-"); safeSibling(state.backup, active, ".snapshots.previous-"); if (await exists(active)) { await unlink(journal); return "finalized"; } if (await exists(state.backup)) { await rename(state.backup, active); await unlink(journal); return "restored"; } throw new Error("Interrupted promotion has no recoverable active snapshot"); }

export async function stageSnapshot(bundles: SnapshotBundles, activeDirectory: string, options: StageOptions): Promise<{ directory: string; manifest: SnapshotManifest; report: SnapshotReport }> {
  const report = validateSnapshot(bundles, options);
  // Legacy fixtures predate the edge count. Every newly staged bundle has the complete current schema.
  const stagedBundles: SnapshotBundles = { ...bundles, courses: { ...bundles.courses, meta: { ...bundles.courses.meta, counts: { ...bundles.courses.meta.counts, edges: bundles.courses.edges.length } } } };
  const manifest = createManifest(stagedBundles, options.fixture, options.provenance);
  const stage = await mkdtemp(path.join(path.dirname(activeDirectory), ".snapshot-stage-"));
  try { for (const name of names) await writeFile(path.join(stage, `${name}.json`), stable(stagedBundles[name])); await writeFile(path.join(stage, "manifest.json"), stable(manifest)); await writeFile(path.join(stage, "report.json"), stable(report)); const reread = await loadBundles(stage); const remanifest = await loadManifest(stage); if (!remanifest) throw new Error("Staged snapshot manifest is missing"); verifyManifest(reread, remanifest); validateSnapshot(reread, { ...options, baseline: options.baseline }); return { directory: stage, manifest, report }; } catch (error) { await rm(stage, { recursive: true, force: true }); throw error; }
}

export async function verifyReviewedStage(stage: string, active: string, baseline: SnapshotManifest | null | undefined, acknowledgeFirstBaseline: boolean, minimumRetention = 0.5) { const resolved = safeSibling(stage, active, ".snapshot-stage-"); const info = await lstat(resolved); if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Reviewed stage must be a real staging directory"); const bundles = await loadBundles(resolved); const manifest = await loadManifest(resolved); if (!manifest) throw new Error("Reviewed stage has no manifest"); verifyManifest(bundles, manifest); if (manifest.fixture || !manifest.provenance?.approved) throw new Error("Fixture or unapproved snapshots cannot be promoted"); const report = validateSnapshot(bundles, { fixture: false, provenance: manifest.provenance, baseline, minimumRetention }); if (report.baseline !== "approved" && !acknowledgeFirstBaseline) throw new Error("First approved baseline requires --acknowledge-first-baseline"); return { bundles, manifest, report }; }

/** A journal makes the non-atomic directory swap recoverable after a process interruption. */
export async function promoteReviewedStage(stage: string, active: string, baseline: SnapshotManifest | null | undefined, acknowledgeFirstBaseline: boolean, minimumRetention = 0.5): Promise<string> { await recoverSnapshotPromotion(active); await verifyReviewedStage(stage, active, baseline, acknowledgeFirstBaseline, minimumRetention); const resolved = safeSibling(stage, active, ".snapshot-stage-"); const backup = path.join(path.dirname(active), `.snapshots.previous-${Date.now()}`); const journal = journalFor(active); const state: PromotionJournal = { active: path.resolve(active), stage: resolved, backup, phase: "prepared" }; await writeJsonAtomic(journal, state); try { await rename(active, backup); state.phase = "active-moved"; await writeJsonAtomic(journal, state); await rename(resolved, active); state.phase = "activated"; await writeJsonAtomic(journal, state); await unlink(journal); return backup; } catch (error) { if (!(await exists(active)) && await exists(backup)) { try { await rename(backup, active); await unlink(journal); } catch { throw new Error("Promotion failed; run --recover-promotion before using snapshots"); } } throw error; } }
