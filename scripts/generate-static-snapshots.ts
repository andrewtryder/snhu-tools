/* Build-only snapshot generator. It is deliberately separate from deployment. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fixturePrograms } from "../src/data/fixturePrograms";

const output = path.resolve("src/data/snapshots");
const stable = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const sha256 = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const now = process.env.SNAPSHOT_CREATED_AT ?? new Date().toISOString();
function assertNoSecrets(value: unknown, path = "root"): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/(password|secret|token|postgres|connection)/i.test(key)) throw new Error(`Refusing possible secret at ${path}.${key}`);
    assertNoSecrets(child, `${path}.${key}`);
  }
}

async function main() {
  const approvedSource = process.env.STATIC_SNAPSHOT_SOURCE_DIR;
  if (approvedSource) {
    // Approved exports are supplied as four already-serialized domain bundles. This keeps
    // database access out of both the build and deployment environments.
    const names = ["programs", "courses", "transfers", "search"] as const;
    const bundles = Object.fromEntries(
      await Promise.all(names.map(async (name) => [name, JSON.parse(await readFile(path.join(approvedSource, `${name}.json`), "utf8"))] as const)),
    ) as Record<(typeof names)[number], { meta?: { domain?: string; counts?: Record<string, number> } }>;
    for (const name of names) {
      const bundle = bundles[name];
      if (bundle.meta?.domain !== name || !bundle.meta.counts || Object.values(bundle.meta.counts).some((count) => !Number.isFinite(count) || count <= 0)) throw new Error(`Refusing incomplete approved ${name} snapshot`);
      assertNoSecrets(bundle);
    }
    await mkdir(output, { recursive: true });
    for (const name of names) await writeFile(path.join(output, `${name}.json`), stable(bundles[name]));
    const manifest = { schemaVersion: 1, createdAt: now, fixture: false, domains: Object.fromEntries(names.map((name) => [name, { file: `${name}.json`, sha256: sha256(bundles[name]), required: true, counts: bundles[name].meta!.counts! }])) };
    await writeFile(path.join(output, "manifest.json"), stable(manifest));
    console.log(`Generated approved static snapshots in ${output}`);
    return;
  }
  // Fixture input only: production exports are intentionally not attempted without approval.
  const courseSamples = JSON.parse(await readFile("src/data/fixtures/course-detail.sample.json", "utf8")) as Array<Record<string, unknown>>;
  const records = Object.fromEntries(courseSamples.map((course) => [String(course.code).replace(/\s/g, "").toUpperCase(), {
    title: course.title, pid: course.pid, catalog_course_id: String(course.code).replace(/\s/g, "").toUpperCase(),
    description: course.description ?? null, academic_level: "Undergraduate", credits: String(course.credits ?? ""), subject_code: String(course.code).split(" ")[0],
  }]));
  records.PSY321 = { title: "Research Methods in Psychology II", pid: "fixture-psy321", catalog_course_id: "PSY321", description: "Fixture catalog course.", academic_level: "Undergraduate", credits: "3", subject_code: "PSY" };
  const ids = Object.keys(records).sort();
  const courseEdges = [{ parentId: "PSY321", childId: "PSY222", parentTitle: "Research Methods in Psychology II", childTitle: "Research Methods in Psychology I" }];
  const courses = { meta: { domain: "courses", counts: { ids: ids.length, records: ids.length } }, ids, summaries: ids.map((id) => ({ catalog_course_id: id, title: records[id].title })), records, edges: courseEdges, lastModified: now };
  const transferRows = [{ subjectPrefix: "PSY", courseNumber: "PSY321", title: "Research Methods in Psychology II", pid: "fixture-transfer-psy321", eligibilityTimeframe: null, groupFilter2Name: "Fixture College", academicLevel: "Undergraduate", coursePID: "fixture-psy321" }];
  const transfers = { meta: { domain: "transfers", counts: { rows: transferRows.length } }, rows: transferRows, lastModified: now };
  const directory = fixturePrograms.map((p) => ({ slug: p.slug, title: p.title, degreeLevel: p.degreeLevel, credential: p.credential, catalogYear: p.catalogYear, totalCredits: p.totalCredits, requiredCourseCount: p.requiredCourseCount, description: p.description, sourceCatalogUrl: p.sourceCatalogUrl ?? null }));
  const programs = { meta: { domain: "programs", counts: { programs: fixturePrograms.length } }, directory, bySlug: Object.fromEntries(fixturePrograms.map((p) => [p.slug, p])), sitemap: fixturePrograms.map((p) => ({ slug: p.slug, updatedAt: now })), catalogYears: [...new Set(fixturePrograms.map((p) => p.catalogYear))], lastUpdated: now };
  const search = { meta: { domain: "search", counts: { entries: directory.length + ids.length + transferRows.length } }, programs: directory, courses: courses.summaries, transfers: transferRows };
  const bundles = { programs, courses, transfers, search };
  await mkdir(output, { recursive: true });
  for (const [name, value] of Object.entries(bundles)) await writeFile(path.join(output, `${name}.json`), stable(value));
  const manifest = { schemaVersion: 1, createdAt: now, fixture: true, domains: Object.fromEntries(Object.entries(bundles).map(([name, value]) => [name, { file: `${name}.json`, sha256: sha256(value), required: true, counts: value.meta.counts }])) };
  await writeFile(path.join(output, "manifest.json"), stable(manifest));
  console.log(`Generated fixture static snapshots in ${output}`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
