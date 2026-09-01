import { randomUUID } from "node:crypto";
import { recordProgramSyncError, withProgramSyncConnection } from "./database";
import { fetchKualiProgramList, fetchKualiProgramDetail, fetchKualiCourseDetail, fetchKualiCourseList } from "./fetch";
import { parseProgramPayload, parseCoursePayload, extractCourseReferences, generatePrerequisiteEdges } from "./parse";
import { NormalizedCourseDetails } from "@/lib/kualiCourseParser";
import { persistProgramToStaging, persistCoursesToStaging, persistEdgesToStaging } from "./persist";
import { validateStaging, promoteStagingToLive } from "./promote";
import { SyncResult, SyncOptions, ProgramSyncState } from "./types";
import { kualiConfig } from "@/config/kualiConfig";
import { reportSyncError } from "@/lib/syncReporting";

export async function runProgramSync(options: SyncOptions = {}): Promise<SyncResult> {
  const catalogId = options.catalogId || kualiConfig.catalogId;
  const catalogYearLabel = process.env.KUALI_CATALOG_YEAR_LABEL;
  if (!catalogYearLabel) {
    throw new Error("KUALI_CATALOG_YEAR_LABEL environment variable is not set. Catalog year is unavailable.");
  }
  const batchSize = options.batchSize || 10;
  const maxConcurrency = options.maxConcurrency || 3;
  const syncId = randomUUID();

  try {
    return await withProgramSyncConnection(async (client) => {
      // 1. Atomic Lease Acquisition
      const leaseExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minute lease
      const leaseRes = await client.query<ProgramSyncState>(
        `
        UPDATE program_sync_state
        SET status = 'in_progress', sync_id = $1, started_at = NOW(),
            lease_expires_at = $2, last_error = NULL
        WHERE id = 'program_sync' AND (status != 'in_progress' OR lease_expires_at IS NULL OR lease_expires_at < NOW() OR $3 = true)
        RETURNING *;
        `,
        [syncId, leaseExpiresAt, !!options.ignoreLease]
      );

      if (leaseRes.rows.length === 0) {
        const stateRes = await client.query<ProgramSyncState>("SELECT * FROM program_sync_state WHERE id = 'program_sync';");
        const state = stateRes.rows[0];
        return {
          action: "skipped",
          status: "in_progress",
          cursor: state?.cursor || 0,
          importedCount: state?.imported_count || 0,
          skippedCount: state?.skipped_count || 0,
          failedCount: state?.failed_count || 0,
          message: "Sync currently in progress by another lease owner",
        };
      }

      // 2. Catalog Upsert
      const catalogDbId = `cat_${catalogId}`;
      await client.query(
        `
        INSERT INTO catalogs (id, external_catalog_id, title, year_label, source_url, is_active, synced_at)
        VALUES ($1, $2, 'SNHU Academic Catalog', $3, $4, true, NOW())
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          year_label = EXCLUDED.year_label,
          source_url = EXCLUDED.source_url,
          is_active = EXCLUDED.is_active,
          synced_at = NOW();
      `,
        [catalogDbId, catalogId, catalogYearLabel, `${kualiConfig.baseUrl}/api/v1/catalog/programs/${catalogId}`]
      );

      // 3. Fetch program list & Snapshot PIDs
      console.log(`[Program Sync] Fetching program list for catalog ${catalogId}...`);
      const rawProgramList = await fetchKualiProgramList(catalogId);

      // Reject empty program list before calculating skip rates or modifying staging data
      if (!rawProgramList || rawProgramList.length === 0) {
        throw new Error("Kuali program list returned zero items. Aborting synchronization prior to staging mutation.");
      }

      const uniquePids = Array.from(new Set(rawProgramList.map((p) => p.pid).filter((pid): pid is string => Boolean(pid))));

      console.log(`[Program Sync] Discovered ${uniquePids.length} programs in Kuali catalog.`);

      // Clear old staging tables
      await client.query("TRUNCATE TABLE programs_stage CASCADE;");
      await client.query("TRUNCATE TABLE degree_courses_stage CASCADE;");

      // Save sync items snapshot
      await client.query("DELETE FROM program_sync_items WHERE sync_id = $1;", [syncId]);
      for (let i = 0; i < uniquePids.length; i++) {
        await client.query(
          "INSERT INTO program_sync_items (sync_id, ordinal, source_pid, status) VALUES ($1, $2, $3, 'pending');",
          [syncId, i, uniquePids[i]]
        );
      }

      await client.query(
        "UPDATE program_sync_state SET expected_count = $1, cursor = 0, imported_count = 0, skipped_count = 0, failed_count = 0 WHERE id = 'program_sync' AND sync_id = $2;",
        [uniquePids.length, syncId]
      );

      // 4. Batch process program details
      let importedCount = 0;
      let failedCount = 0;
      let skippedCount = 0;
      const referencedCoursesMap = new Map<string, { code: string; pid?: string }>();

      for (let i = 0; i < uniquePids.length; i += batchSize) {
        const batchPids = uniquePids.slice(i, i + batchSize);

        const batchResults = await Promise.all(
          batchPids.map(async (pid) => {
            try {
              const rawDetail = await fetchKualiProgramDetail(pid, catalogId);
              if (!rawDetail) return { pid, success: false, error: "Not found" };
              const program = parseProgramPayload(rawDetail, catalogId);
              return { pid, success: true, program };
            } catch (err) {
              return { pid, success: false, error: (err as Error).message };
            }
          })
        );

        for (const res of batchResults) {
          if (res.success && res.program) {
            await persistProgramToStaging(client, res.program, catalogDbId);
            importedCount++;
            await client.query(
              "UPDATE program_sync_items SET status = 'imported', processed_at = NOW() WHERE sync_id = $1 AND source_pid = $2;",
              [syncId, res.pid]
            );

            // Collect course references
            const refs = extractCourseReferences(res.program);
            for (const ref of refs) {
              if (!referencedCoursesMap.has(ref.code)) {
                referencedCoursesMap.set(ref.code, ref);
              }
            }
          } else if (res.error === "Not found") {
            // Skipped non-program catalog entry or archived item
            skippedCount++;
            await client.query(
              "UPDATE program_sync_items SET status = 'skipped', reason = 'Not found (404)', processed_at = NOW() WHERE sync_id = $1 AND source_pid = $2;",
              [syncId, res.pid]
            );
          } else {
            failedCount++;
            console.warn(`[Program Sync Warning] Failed to fetch/parse PID ${res.pid}: ${res.error}`);
            await client.query(
              "UPDATE program_sync_items SET status = 'failed', reason = $3, processed_at = NOW() WHERE sync_id = $1 AND source_pid = $2;",
              [syncId, res.pid, res.error || "Unknown error"]
            );
          }
        }

        const currentCursor = i + batchPids.length;
        const renewedLease = new Date(Date.now() + 15 * 60 * 1000);
        const updateRes = await client.query(
          "UPDATE program_sync_state SET cursor = $1, imported_count = $2, skipped_count = $3, failed_count = $4, lease_expires_at = $5 WHERE id = 'program_sync' AND sync_id = $6;",
          [currentCursor, importedCount, skippedCount, failedCount, renewedLease, syncId]
        );

        if (updateRes.rowCount === 0) {
          throw new Error(`Sync lease ownership lost for syncId ${syncId} during program batch phase.`);
        }
      }

      // 5. Fetch referenced course details & edges
      console.log(`[Program Sync] Processing ${referencedCoursesMap.size} unique referenced courses...`);
      const courseRefs = Array.from(referencedCoursesMap.values());
      const rawCourseList = await fetchKualiCourseList(catalogId);
      const coursePidByCatalogId = new Map(
        rawCourseList.flatMap((course) => (course.id && course.pid ? [[course.id, course.pid] as const] : []))
      );
      const resolvedCourseRefs = courseRefs.map((ref) => ({
        ...ref,
        detailPid: ref.pid ? coursePidByCatalogId.get(ref.pid) : undefined,
      }));
      const parsedCourses: NormalizedCourseDetails[] = resolvedCourseRefs.map((ref) => ({
        pid: ref.detailPid || ref.pid || ref.code,
        code: ref.code,
        title: ref.code,
        credits: null,
        description: "",
        prerequisites: [],
        corequisites: [],
        resolutionStatus: ref.pid ? "unavailable" : "unavailable",
      }));

      // Fetch additional Kuali course detail metadata if PID is present with periodic lease renewal
      for (let i = 0; i < resolvedCourseRefs.length; i += maxConcurrency) {
        const chunk = resolvedCourseRefs.slice(i, i + maxConcurrency);
        await Promise.all(
          chunk.map(async (ref, idx) => {
            if (ref.detailPid) {
              try {
                const rawCourse = await fetchKualiCourseDetail(ref.detailPid, catalogId);
                if (rawCourse) {
                  const detail = parseCoursePayload(rawCourse, ref.code);
                  parsedCourses[i + idx] = detail;
                } else {
                  parsedCourses[i + idx].resolutionStatus = "not_found";
                }
              } catch {
                // Course detail fetch failure retained without silent fallback
                parsedCourses[i + idx].resolutionStatus = "failed";
              }
            }
          })
        );

        // Periodically renew lease during large course detail phases
        if (i > 0 && i % 30 === 0) {
          const renewedLease = new Date(Date.now() + 15 * 60 * 1000);
          const renewRes = await client.query(
            "UPDATE program_sync_state SET lease_expires_at = $1 WHERE id = 'program_sync' AND sync_id = $2;",
            [renewedLease, syncId]
          );
          if (renewRes.rowCount === 0) {
            throw new Error(`Sync lease ownership lost for syncId ${syncId} during course detail phase.`);
          }
        }
      }

      // Persist courses and edges to staging
      await persistCoursesToStaging(client, parsedCourses);
      const edges = generatePrerequisiteEdges(parsedCourses);
      await persistEdgesToStaging(client, edges);

      // 6. Validate Staging Database
      console.log(`[Program Sync] Validating staging tables before promotion...`);

      const processedCount = importedCount + skippedCount + failedCount;
      if (processedCount !== uniquePids.length) {
        throw new Error(`Sync snapshot accounting mismatch: processed ${processedCount} but expected ${uniquePids.length}`);
      }

      const skipRate = skippedCount / uniquePids.length;
      const maxSkipRate = 0.01; // 1% maximum skip threshold
      if (skipRate > maxSkipRate) {
        throw new Error(`Skipped program rate too high: ${(skipRate * 100).toFixed(1)}% (${skippedCount}/${uniquePids.length}). Exceeds 1% max skip threshold.`);
      }

      const validation = await validateStaging(
        client,
        uniquePids.length,
        failedCount,
        options.allowLargeShrink
      );

      if (!validation.valid) {
        const errorMsg = `Staging validation failed: ${validation.errors.join("; ")}`;
        await client.query(
          "UPDATE program_sync_state SET status = 'error', last_error = $1 WHERE id = 'program_sync' AND sync_id = $2;",
          [errorMsg, syncId]
        );
        return {
          action: "error",
          syncId,
          status: "error",
          cursor: uniquePids.length,
          expectedCount: uniquePids.length,
          importedCount,
          skippedCount,
          failedCount,
          promoted: false,
          error: errorMsg,
        };
      }

      // 7. Atomic Promotion to Live Database
      console.log(`[Program Sync] Renewing lease and promoting staging tables to live database...`);
      const prePromoteLease = new Date(Date.now() + 15 * 60 * 1000);
      const checkOwnerRes = await client.query(
        "UPDATE program_sync_state SET lease_expires_at = $1 WHERE id = 'program_sync' AND sync_id = $2;",
        [prePromoteLease, syncId]
      );
      if (checkOwnerRes.rowCount === 0) {
        throw new Error(`Sync lease ownership lost for syncId ${syncId} immediately prior to promotion.`);
      }

      await promoteStagingToLive(client, syncId);

      const nextDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await client.query(
        `
        UPDATE program_sync_state
        SET status = 'idle', completed_at = NOW(), next_due_at = $1,
            lease_expires_at = NULL, last_error = NULL
        WHERE id = 'program_sync' AND sync_id = $2;
      `,
        [nextDue, syncId]
      );

      console.log(`[Program Sync] Synchronization and atomic promotion completed successfully!`);

      return {
        action: "promoted",
        syncId,
        status: "idle",
        cursor: uniquePids.length,
        expectedCount: uniquePids.length,
        importedCount,
        skippedCount,
        failedCount,
        promoted: true,
        message: `Successfully synchronized and promoted ${importedCount} programs and ${parsedCourses.length} courses to live database.`,
      };
    });
  } catch (err: unknown) {
    const errorMsg = (err as Error).message;
    console.error("[Program Sync Error]", errorMsg);

    try {
      await reportSyncError(err, {
        component: "program-sync",
        action: "program-sync",
        context: { sync_id: syncId, catalog_id: catalogId, vercel_env: process.env.VERCEL_ENV ?? null },
        tags: ["cron", "program-sync"],
      });
    } catch {
      // Reporting must not alter the writer's terminal result.
    }
    await recordProgramSyncError(syncId, errorMsg);

    return {
      action: "error",
      status: "error",
      cursor: 0,
      importedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      promoted: false,
      error: errorMsg,
    };
  }
}
