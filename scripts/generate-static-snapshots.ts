import { createHash } from "node:crypto";
import { Pool } from "pg";
import path from "node:path";
import { exportCoursesFromDatabase } from "../src/lib/static-export/courses";
import { buildFixtureSnapshot } from "../src/lib/static-export/fixtureSource";
import { exportProgramsFromDatabase } from "../src/lib/static-export/programs";
import { transformSearch } from "../src/lib/static-export/search";
import { loadBundles, loadManifest, promoteReviewedStage, recoverSnapshotPromotion, stageSnapshot, validateSnapshot, verifyManifest, type SnapshotBundles, type SnapshotProvenance } from "../src/lib/static-export/snapshot";
import { exportTransfersFromDatabase } from "../src/lib/static-export/transfers";

type SourceMode = { kind: "fixture" } | { kind: "json"; directory: string; approvalReference: string } | { kind: "postgres"; approvalReference: string };
type Command = { kind: "stage"; source: SourceMode; retention: number } | { kind: "promote"; stage: string; acknowledgeFirstBaseline: boolean; retention: number } | { kind: "recover" };
const active = path.resolve("src/data/snapshots");
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const valueAfter = (argv: string[], flag: string) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; };

export function parseStaticExportArgs(argv: string[]): Command {
  const fixture = argv.includes("--fixture"); const postgres = argv.includes("--from-postgres"); const json = valueAfter(argv, "--from-json"); const promoteStage = valueAfter(argv, "--promote-stage"); const recover = argv.includes("--recover-promotion"); const retentionText = valueAfter(argv, "--minimum-retention"); const retention = retentionText === undefined ? 0.5 : Number(retentionText);
  if (!Number.isFinite(retention) || retention <= 0 || retention > 1) throw new Error("--minimum-retention must be between 0 and 1");
  if (recover) { if (fixture || postgres || json || promoteStage) throw new Error("--recover-promotion cannot be combined with a source or promotion"); return { kind: "recover" }; }
  if (promoteStage) { if (fixture || postgres || json) throw new Error("--promote-stage cannot re-export a source"); return { kind: "promote", stage: path.resolve(promoteStage), acknowledgeFirstBaseline: argv.includes("--acknowledge-first-baseline"), retention }; }
  if ([fixture, postgres, Boolean(json)].filter(Boolean).length !== 1) throw new Error("Choose exactly one: --fixture, --from-json <directory>, or --from-postgres");
  if (argv.includes("--promote")) throw new Error("Review a stage first, then use --promote-stage <directory>");
  if (json === "") throw new Error("--from-json requires a directory");
  const approvalReference = valueAfter(argv, "--approval-reference");
  if (!fixture && !approvalReference?.trim()) throw new Error("Non-fixture exports require --approval-reference <review-ticket-or-change-id>");
  return { kind: "stage", source: fixture ? { kind: "fixture" } : postgres ? { kind: "postgres", approvalReference: approvalReference!.trim() } : { kind: "json", directory: path.resolve(json!), approvalReference: approvalReference!.trim() }, retention };
}

async function markers(pool: Pool) { const client = await pool.connect(); try { const result = await client.query<{ catalog: string | null; programs: string | null; transfers: string | null }>("SELECT (SELECT completed_at::text FROM catalog_sync_state WHERE id='catalog') AS catalog, (SELECT completed_at::text FROM program_sync_state WHERE id='program_sync') AS programs, (SELECT completed_at::text FROM transfer_sync_state WHERE id='transfer') AS transfers"); return result.rows[0] ?? { catalog: null, programs: null, transfers: null }; } finally { client.release(); } }

async function bundlesFor(mode: SourceMode): Promise<{ bundles: SnapshotBundles; provenance: SnapshotProvenance }> {
  if (mode.kind === "fixture") { const bundles = buildFixtureSnapshot(); return { bundles, provenance: { kind: "fixture", source: "source-controlled-fixture-v1", sourceDigest: digest(bundles), approvalReference: null, approved: false } }; }
  if (mode.kind === "json") { const manifest = await loadManifest(mode.directory); if (!manifest || manifest.fixture) throw new Error("--from-json requires a complete non-fixture manifest"); const bundles = await loadBundles(mode.directory); verifyManifest(bundles, manifest); validateSnapshot(bundles, { fixture: false, provenance: manifest.provenance ?? { kind: "json-import", source: "unapproved-import", sourceDigest: digest(manifest), approvalReference: mode.approvalReference, approved: true } }); return { bundles, provenance: { kind: "json-import", source: mode.directory, sourceDigest: digest(manifest), approvalReference: mode.approvalReference, approved: true } }; }
  if (process.env.STATIC_EXPORT_APPROVED !== "true" || !process.env.POSTGRES_URL) throw new Error("--from-postgres requires STATIC_EXPORT_APPROVED=true and POSTGRES_URL");
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 1, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 5_000, statement_timeout: 60_000, application_name: "snhu-static-export" });
  try { const before = await markers(pool); const programs = await exportProgramsFromDatabase(pool); const courses = await exportCoursesFromDatabase(pool); const transfers = await exportTransfersFromDatabase(pool); const after = await markers(pool); if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Cross-domain source timestamps changed during export; retry in a synchronization-safe window"); const bundles = { programs, courses, transfers, search: transformSearch(programs, courses, transfers) }; return { bundles, provenance: { kind: "postgres", source: "postgres-readonly-export", sourceDigest: digest(before), approvalReference: mode.approvalReference, approved: true } }; } finally { await pool.end(); }
}

export async function runStaticExport(argv: string[]) {
  const command = parseStaticExportArgs(argv);
  if (command.kind === "recover") return { recovered: await recoverSnapshotPromotion(active) };
  const baseline = await loadManifest(active);
  if (command.kind === "promote") { const backup = await promoteReviewedStage(command.stage, active, baseline, command.acknowledgeFirstBaseline, command.retention); return { promoted: true, backup }; }
  const source = await bundlesFor(command.source);
  const staged = await stageSnapshot(source.bundles, active, { fixture: command.source.kind === "fixture", provenance: source.provenance, baseline, minimumRetention: command.retention });
  return { ...staged, promoted: false };
}

if (process.argv[1]?.endsWith("generate-static-snapshots.ts")) runStaticExport(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
