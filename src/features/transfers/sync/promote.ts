import type { Client } from 'pg';
import { abortToIdle, countSyncItems, getSyncState, markCompleted } from './persist';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface PromoteOptions {
  /** Allow promote when staging shrinks live data by more than 25%. Cron never sets this. */
  allowLargeShrink?: boolean;
}

/** Refuse promote when staging drops more than 25% of live rows (unless overridden). */
const MIN_STAGE_RATIO = 0.75;

export async function validateStaging(
  client: Client,
  syncId: string,
  options: PromoteOptions = {}
): Promise<ValidationResult> {
  const errors: string[] = [];
  const allowLargeShrink = options.allowLargeShrink ?? false;

  const countResult = await client.query<{ count: number }>(
    'SELECT COUNT(*)::int AS count FROM transfer_courses_stage'
  );
  const stageCount = Number(countResult.rows[0]?.count ?? 0);

  if (stageCount === 0) {
    errors.push('transfer_courses_stage is empty');
  }

  const state = await getSyncState(client);
  const expected = state.expected_count;

  if (state.sync_id !== syncId || state.status !== 'running') {
    errors.push('transfer sync ownership was lost before staging validation');
  }

  if (expected === null) {
    errors.push('transfer_sync_state.expected_count is missing');
  } else if (state.cursor !== expected) {
    errors.push(
      `transfer_sync_state.cursor (${state.cursor}) !== expected_count (${expected})`
    );
  }

  if (state.failed_experience_count !== 0) {
    errors.push(
      `transfer_sync_state.failed_experience_count (${state.failed_experience_count}) !== 0`
    );
  }

  if (!state.sync_id) {
    errors.push('transfer_sync_state.sync_id is missing');
  } else if (expected !== null) {
    const snapshotCount = await countSyncItems(client, state.sync_id);
    if (snapshotCount !== expected) {
      errors.push(
        `transfer_sync_items count (${snapshotCount}) !== expected_count (${expected})`
      );
    }
  }

  if (!allowLargeShrink && stageCount > 0) {
    const liveResult = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM transfer_courses'
    );
    const liveCount = Number(liveResult.rows[0]?.count ?? 0);
    if (liveCount > 0) {
      const minStageCount = Math.ceil(liveCount * MIN_STAGE_RATIO);
      if (stageCount < minStageCount) {
        errors.push(
          `staging row count (${stageCount}) is below 75% of live transfer_courses (${liveCount}); pass allowLargeShrink to override`
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Atomically replace live transfer_courses from staging.
 */
export async function promoteStaging(
  client: Client,
  syncId: string,
  options: PromoteOptions = {}
): Promise<void> {
  const validation = await validateStaging(client, syncId, options);
  if (!validation.ok) {
    const message = `Validation failed: ${validation.errors.join('; ')}`;
    if (validation.errors.includes('transfer sync ownership was lost before staging validation')) {
      throw new Error(message);
    }
    await abortToIdle(client, message);
    throw new Error(message);
  }

  try {
    await client.query('BEGIN');

    const ownership = await client.query(
      `SELECT id
       FROM transfer_sync_state
       WHERE id = $1
         AND sync_id = $2::uuid
         AND status = 'running'
       FOR UPDATE`,
      ['transfer', syncId]
    );
    if (ownership.rows.length !== 1) {
      throw new Error('Transfer sync ownership lost before promotion');
    }

    await client.query('TRUNCATE transfer_courses');
    await client.query(`
      INSERT INTO transfer_courses (
        subjectprefix,
        coursenumber,
        title,
        pid,
        eligibilitytimeframe,
        groupfilter2name,
        academiclevel,
        coursepid
      )
      SELECT
        subjectprefix,
        coursenumber,
        title,
        pid,
        eligibilitytimeframe,
        groupfilter2name,
        academiclevel,
        coursepid
      FROM transfer_courses_stage
    `);

    await markCompleted(client, syncId);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }

  await enrichCoursePids(client);
}

/**
 * Best-effort: fill coursepid from shared catalog_course_lookup when available.
 * Missing view or lookup misses leave transfer rows valid.
 */
async function enrichCoursePids(client: Client): Promise<void> {
  try {
    await client.query(`
      UPDATE transfer_courses tc
      SET coursepid = lookup.pid
      FROM catalog_course_lookup lookup
      WHERE lookup.course_code = tc.coursenumber
    `);
  } catch (error) {
    if ((error as { code?: string }).code !== '42P01') {
      throw error;
    }
    console.warn(
      'Optional coursePID enrichment skipped (catalog_course_lookup unavailable):',
      error instanceof Error ? error.message : error
    );
  }
}
