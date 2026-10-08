import { Client } from "pg";
import { StagingValidationResult } from "./types";

export async function validateStaging(
  client: Client,
  expectedCount: number,
  failedCount: number,
  allowLargeShrink = false
): Promise<StagingValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Failed program fetches
  if (failedCount > 0) {
    errors.push(`Staging validation failed: ${failedCount} program detail fetches failed.`);
  }

  // Check 2: Nonzero programs in staging
  const progRes = await client.query<{ count?: string }>("SELECT COUNT(*) as count FROM programs_stage;");
  const programCount = parseInt(progRes?.rows?.[0]?.count || "0", 10);
  if (programCount === 0) {
    errors.push("Staging validation failed: programs_stage table is empty.");
  }

  // Check 3: Material shrink comparison with live data
  const liveProgRes = await client.query<{ count?: string }>("SELECT COUNT(*) as count FROM programs;");
  const liveProgramCount = parseInt(liveProgRes?.rows?.[0]?.count || "0", 10);

  if (liveProgramCount > 0 && !allowLargeShrink) {
    const shrinkRatio = (liveProgramCount - programCount) / liveProgramCount;
    if (shrinkRatio > 0.2) {
      errors.push(
        `Staging validation failed: Material shrink detected! Live count=${liveProgramCount}, Staging count=${programCount} (${(
          shrinkRatio * 100
        ).toFixed(1)}% shrink). Pass allowLargeShrink=true to override.`
      );
    }
  }

  // Check 4: Duplicate program slugs in staging
  const dupSlugRes = await client.query<{ slug: string; count: string }>(`
    SELECT slug, COUNT(*) as count FROM programs_stage GROUP BY slug HAVING COUNT(*) > 1;
  `);
  if (dupSlugRes?.rows && dupSlugRes.rows.length > 0) {
    errors.push(
      `Staging validation failed: Duplicate program slugs found in staging: ${dupSlugRes.rows
        .map((r) => r.slug)
        .join(", ")}`
    );
  }

  // Check 5: Orphaned requirement groups in staging
  const orphanGroupsRes = await client.query<{ count?: string }>(`
    SELECT COUNT(*) as count FROM program_requirement_groups_stage
    WHERE program_id NOT IN (SELECT id FROM programs_stage);
  `);
  const orphanGroupCount = parseInt(orphanGroupsRes?.rows?.[0]?.count || "0", 10);
  if (orphanGroupCount > 0) {
    errors.push(`Staging validation failed: ${orphanGroupCount} requirement groups in staging do not belong to valid programs.`);
  }

  // Check 6: Orphaned requirement courses in staging
  const orphanCoursesRes = await client.query<{ count?: string }>(`
    SELECT COUNT(*) as count FROM program_requirement_courses_stage
    WHERE requirement_group_id NOT IN (SELECT id FROM program_requirement_groups_stage);
  `);
  const orphanCourseCount = parseInt(orphanCoursesRes?.rows?.[0]?.count || "0", 10);
  if (orphanCourseCount > 0) {
    errors.push(`Staging validation failed: ${orphanCourseCount} requirement courses in staging do not belong to valid groups.`);
  }

  // Check 7: Child requirement groups with invalid parents
  const orphanChildGroupsRes = await client.query<{ count?: string }>(`
    SELECT COUNT(*) as count FROM program_requirement_groups_stage
    WHERE parent_group_id IS NOT NULL
      AND parent_group_id NOT IN (SELECT id FROM program_requirement_groups_stage);
  `);
  const orphanChildGroupCount = parseInt(orphanChildGroupsRes?.rows?.[0]?.count || "0", 10);
  if (orphanChildGroupCount > 0) {
    errors.push(`Staging validation failed: ${orphanChildGroupCount} child requirement groups have invalid parent group references.`);
  }

  // Check 8: Programs without requirement groups
  const emptyProgRes = await client.query<{ slug: string; source_pid: string | null }>(`
    SELECT p.slug, p.source_pid FROM programs_stage p
    LEFT JOIN program_requirement_groups_stage g ON g.program_id = p.id
    WHERE g.id IS NULL;
  `);
  if (emptyProgRes?.rows && emptyProgRes.rows.length > 0) {
    const affected = emptyProgRes.rows
      .map((r) => `${r.slug}${r.source_pid ? ` (${r.source_pid})` : ""}`)
      .join(", ");
    errors.push(
      `Staging validation failed: ${emptyProgRes.rows.length} staged programs have zero requirement groups: ${affected}`
    );
  }

  // Check 9: Courses and edges count
  const courseRes = await client.query<{ count?: string }>("SELECT COUNT(*) as count FROM degree_courses_stage;");
  const courseCount = parseInt(courseRes?.rows?.[0]?.count || "0", 10);

  const edgeRes = await client.query<{ count?: string }>("SELECT COUNT(*) as count FROM degree_course_edges_stage;");
  const edgeCount = parseInt(edgeRes?.rows?.[0]?.count || "0", 10);

  const liveEdgeRes = await client.query<{ count?: string }>("SELECT COUNT(*) as count FROM degree_course_edges;");
  const liveEdgeCount = parseInt(liveEdgeRes?.rows?.[0]?.count || "0", 10);

  const stageResolvedRes = await client.query<{ total?: string; resolved?: string }>(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE resolution_status = 'resolved') as resolved FROM degree_courses_stage;"
  );
  const liveResolvedRes = await client.query<{ total?: string; resolved?: string }>(
    "SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE resolution_status = 'resolved') as resolved FROM degree_courses;"
  );
  const stageTotal = parseInt(stageResolvedRes?.rows?.[0]?.total || "0", 10);
  const stageResolved = parseInt(stageResolvedRes?.rows?.[0]?.resolved || "0", 10);
  const liveTotal = parseInt(liveResolvedRes?.rows?.[0]?.total || "0", 10);
  const liveResolved = parseInt(liveResolvedRes?.rows?.[0]?.resolved || "0", 10);
  const stagedResolvedCourseRate = stageTotal === 0 ? 0 : stageResolved / stageTotal;
  const liveResolvedCourseRate = liveTotal === 0 ? 0 : liveResolved / liveTotal;

  const regressionThreshold = 0.8;
  if (liveEdgeCount > 0 && edgeCount < liveEdgeCount * regressionThreshold) {
    errors.push(
      `Staging validation failed: edge count declined more than 20% (live=${liveEdgeCount}, staging=${edgeCount}).`
    );
  }
  if (liveTotal > 0 && stagedResolvedCourseRate < liveResolvedCourseRate * regressionThreshold) {
    errors.push(
      `Staging validation failed: resolved-course rate declined more than 20% (live=${(liveResolvedCourseRate * 100).toFixed(1)}%, staging=${(stagedResolvedCourseRate * 100).toFixed(1)}%).`
    );
  }

  const valid = errors.length === 0;

  return {
    valid,
    programCount,
    liveProgramCount,
    courseCount,
    edgeCount,
    liveEdgeCount,
    stagedResolvedCourseRate,
    liveResolvedCourseRate,
    errors,
    warnings,
  };
}

export async function promoteStagingToLive(client: Client, syncId: string): Promise<void> {
  try {
    await client.query("BEGIN;");

    // 1. Lock the sync state row and verify ownership and lease
    const checkOwnerRes = await client.query(
      "SELECT 1 FROM program_sync_state WHERE id = 'program_sync' AND sync_id = $1 AND (lease_expires_at IS NULL OR lease_expires_at > NOW()) FOR UPDATE;",
      [syncId]
    );

    if (checkOwnerRes.rowCount === 0) {
      throw new Error(`Sync lease ownership lost or expired for syncId ${syncId} during promotion transaction.`);
    }

    // Atomically replace live tables from staging tables within one single transaction
    await client.query(
      "TRUNCATE TABLE programs, program_requirement_groups, program_requirement_courses, program_text_requirements, degree_courses, degree_course_edges CASCADE;"
    );

    await client.query(`
      INSERT INTO programs (id, catalog_id, source_pid, slug, title, credential, total_credits, description_summary, source_url, source_hash, warning_count, synced_at)
      SELECT id, catalog_id, source_pid, slug, title, credential, total_credits, description_summary, source_url, source_hash, warning_count, synced_at
      FROM programs_stage;
    `);
    
    await client.query(`
      INSERT INTO program_requirement_groups (id, program_id, parent_group_id, source_path, title, category, rule_type, minimum_selections, maximum_selections, minimum_credits, sort_order, warning_count, raw_excerpt, rule_metadata)
      SELECT id, program_id, parent_group_id, source_path, title, category, rule_type, minimum_selections, maximum_selections, minimum_credits, sort_order, warning_count, raw_excerpt, rule_metadata
      FROM program_requirement_groups_stage;
    `);
    
    await client.query(`
      INSERT INTO program_requirement_courses (id, requirement_group_id, source_path, source_pid, course_code, title, credits, is_optional, sort_order)
      SELECT id, requirement_group_id, source_path, source_pid, course_code, title, credits, is_optional, sort_order
      FROM program_requirement_courses_stage;
    `);
    
    await client.query(`
      INSERT INTO program_text_requirements (id, requirement_group_id, source_path, text, sort_order, is_unparsed)
      SELECT id, requirement_group_id, source_path, text, sort_order, is_unparsed
      FROM program_text_requirements_stage;
    `);
    
    await client.query(`
      INSERT INTO degree_courses (course_code, source_pid, title, credits, subject_code, source_hash, resolution_status, synced_at)
      SELECT course_code, source_pid, title, credits, subject_code, source_hash, resolution_status, synced_at
      FROM degree_courses_stage;
    `);
    
    await client.query(`
      INSERT INTO degree_course_edges (source_course_code, target_course_code, relationship_type, source_text)
      SELECT source_course_code, target_course_code, relationship_type, source_text
      FROM degree_course_edges_stage;
    `);

    // Mark the run completed and release the lease
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

    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  }
}
