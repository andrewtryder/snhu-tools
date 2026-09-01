import type { Client } from 'pg';
import type { ParsedTransferCourse } from './parse';

export const TRANSFER_SYNC_ID = 'transfer';

export type SyncStatus = 'idle' | 'running';

export interface TransferSyncState {
  id: string;
  status: SyncStatus;
  cursor: number;
  expected_count: number | null;
  imported_count: number;
  started_at: Date | null;
  completed_at: Date | null;
  next_due_at: Date | null;
  lease_expires_at: Date | null;
  last_error: string | null;
  sync_id: string | null;
  failed_experience_count: number;
}

export interface TransferSyncItem {
  ordinal: number;
  pid: string;
}

function asDate(value: unknown): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : new Date(String(value));
}

function mapSyncStateRow(row: Record<string, unknown>): TransferSyncState {
  return {
    id: row.id as string,
    status: row.status as SyncStatus,
    cursor: Number(row.cursor),
    expected_count:
      row.expected_count === null || row.expected_count === undefined
        ? null
        : Number(row.expected_count),
    imported_count: Number(row.imported_count),
    started_at: asDate(row.started_at),
    completed_at: asDate(row.completed_at),
    next_due_at: asDate(row.next_due_at),
    lease_expires_at: asDate(row.lease_expires_at),
    last_error: (row.last_error as string) ?? null,
    sync_id: (row.sync_id as string) ?? null,
    failed_experience_count: Number(row.failed_experience_count ?? 0),
  };
}

export async function getSyncState(client: Client): Promise<TransferSyncState> {
  const result = await client.query(
    `SELECT
      id,
      status,
      cursor,
      expected_count,
      imported_count,
      started_at,
      completed_at,
      next_due_at,
      lease_expires_at,
      last_error,
      sync_id,
      failed_experience_count
    FROM transfer_sync_state
    WHERE id = $1`,
    [TRANSFER_SYNC_ID]
  );

  if (result.rows.length === 0) {
    throw new Error('transfer_sync_state row missing; run db:migrate first');
  }

  return mapSyncStateRow(result.rows[0] as Record<string, unknown>);
}

export async function clearStaging(client: Client): Promise<void> {
  await client.query('TRUNCATE transfer_courses_stage');
}

export async function clearSyncItems(client: Client): Promise<void> {
  await client.query('TRUNCATE transfer_sync_items');
}

/**
 * Start a refresh by snapshotting experience PIDs into transfer_sync_items.
 * Later cron ticks resume from this immutable list — they do not re-fetch Kuali.
 */
export async function startRefresh(client: Client, pids: string[]): Promise<void> {
  const uniquePids = [...new Set(pids.filter((pid) => Boolean(pid)))];

  await clearSyncItems(client);
  await clearStaging(client);

  const syncIdResult = await client.query<{ sync_id: string }>(
    'SELECT gen_random_uuid()::text AS sync_id'
  );
  const syncId = syncIdResult.rows[0].sync_id;

  if (uniquePids.length > 0) {
    const values: unknown[] = [];
    const placeholders: string[] = [];
    uniquePids.forEach((pid, ordinal) => {
      const offset = ordinal * 3;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
      values.push(syncId, ordinal, pid);
    });

    await client.query(
      `INSERT INTO transfer_sync_items (sync_id, ordinal, pid)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  }

  // Preserve completed_at (last successful promote) until markCompleted() updates it.
  await client.query(
    `UPDATE transfer_sync_state
    SET
      status = 'running',
      cursor = 0,
      expected_count = $1,
      imported_count = 0,
      started_at = NOW(),
      lease_expires_at = NOW() + INTERVAL '5 minutes',
      last_error = NULL,
      sync_id = $2::uuid,
      failed_experience_count = 0
    WHERE id = $3`,
    [uniquePids.length, syncId, TRANSFER_SYNC_ID]
  );
}

export async function getSyncItems(
  client: Client,
  syncId: string,
  fromOrdinal: number,
  limit: number
): Promise<TransferSyncItem[]> {
  const result = await client.query<{ ordinal: number; pid: string }>(
    `SELECT ordinal, pid
     FROM transfer_sync_items
     WHERE sync_id = $1::uuid AND ordinal >= $2
     ORDER BY ordinal ASC
     LIMIT $3`,
    [syncId, fromOrdinal, limit]
  );

  return result.rows.map((row) => ({
    ordinal: Number(row.ordinal),
    pid: row.pid,
  }));
}

export async function countSyncItems(client: Client, syncId: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    `SELECT COUNT(*)::int AS count
     FROM transfer_sync_items
     WHERE sync_id = $1::uuid`,
    [syncId]
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Atomically claim the transfer sync lease. Returns the updated state row on
 * success, or null if another worker still holds an unexpired lease.
 * When force is true (local ignoreLease), take the lease regardless of expiry.
 */
export async function tryClaimLease(
  client: Client,
  options: { force?: boolean } = {}
): Promise<TransferSyncState | null> {
  const force = options.force ?? false;

  const result = force
    ? await client.query(
        `UPDATE transfer_sync_state
        SET lease_expires_at = NOW() + INTERVAL '5 minutes'
        WHERE id = $1
        RETURNING
          id,
          status,
          cursor,
          expected_count,
          imported_count,
          started_at,
          completed_at,
          next_due_at,
          lease_expires_at,
          last_error,
          sync_id,
          failed_experience_count`,
        [TRANSFER_SYNC_ID]
      )
    : await client.query(
        `UPDATE transfer_sync_state
        SET lease_expires_at = NOW() + INTERVAL '5 minutes'
        WHERE id = $1
          AND (
            lease_expires_at IS NULL
            OR lease_expires_at <= NOW()
          )
        RETURNING
          id,
          status,
          cursor,
          expected_count,
          imported_count,
          started_at,
          completed_at,
          next_due_at,
          lease_expires_at,
          last_error,
          sync_id,
          failed_experience_count`,
        [TRANSFER_SYNC_ID]
      );

  if (result.rows.length === 0) {
    return null;
  }

  return mapSyncStateRow(result.rows[0] as Record<string, unknown>);
}

export async function setSyncError(client: Client, error: string): Promise<void> {
  await client.query(
    `UPDATE transfer_sync_state
    SET last_error = $1
    WHERE id = $2`,
    [error, TRANSFER_SYNC_ID]
  );
}

export async function abortToIdle(client: Client, error: string): Promise<void> {
  await clearSyncItems(client);
  await client.query(
    `UPDATE transfer_sync_state
    SET
      status = 'idle',
      lease_expires_at = NULL,
      last_error = $1,
      sync_id = NULL,
      failed_experience_count = 0
    WHERE id = $2`,
    [error, TRANSFER_SYNC_ID]
  );
}

export async function insertStagedTransfer(
  client: Client,
  course: ParsedTransferCourse
): Promise<void> {
  if (!course.pid || !course.courseNumber) {
    throw new Error('Staged transfer rows require pid and courseNumber');
  }

  await client.query(
    `INSERT INTO transfer_courses_stage (
      subjectprefix,
      coursenumber,
      title,
      pid,
      eligibilitytimeframe,
      groupfilter2name,
      academiclevel,
      coursepid
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    ON CONFLICT (pid, coursenumber) DO UPDATE SET
      subjectprefix = EXCLUDED.subjectprefix,
      title = EXCLUDED.title,
      eligibilitytimeframe = EXCLUDED.eligibilitytimeframe,
      groupfilter2name = EXCLUDED.groupfilter2name,
      academiclevel = EXCLUDED.academiclevel,
      coursepid = EXCLUDED.coursepid`,
    [
      course.subjectPrefix,
      course.courseNumber,
      course.title,
      course.pid,
      course.eligibilityTimeframe,
      course.groupFilter2Name,
      course.academicLevel,
      course.coursePID,
    ]
  );
}

export async function advanceCursor(
  client: Client,
  syncId: string,
  newCursor: number,
  importedDelta: number
): Promise<void> {
  const result = await client.query(
    `UPDATE transfer_sync_state
    SET
      cursor = $1,
      imported_count = imported_count + $2,
      lease_expires_at = NOW() + INTERVAL '5 minutes'
    WHERE id = $3
      AND sync_id = $4::uuid
      AND status = 'running'
    RETURNING id`,
    [newCursor, importedDelta, TRANSFER_SYNC_ID, syncId]
  );

  if (result.rows.length !== 1) {
    throw new Error('Transfer sync ownership lost while advancing cursor');
  }
}

export async function markCompleted(client: Client, syncId: string): Promise<void> {
  const result = await client.query(
    `UPDATE transfer_sync_state
    SET
      status = 'idle',
      completed_at = NOW(),
      next_due_at = NOW() + INTERVAL '7 days',
      lease_expires_at = NULL,
      last_error = NULL,
      sync_id = NULL,
      failed_experience_count = 0
    WHERE id = $1
      AND sync_id = $2::uuid
      AND status = 'running'
    RETURNING id`,
    [TRANSFER_SYNC_ID, syncId]
  );

  if (result.rows.length !== 1) {
    throw new Error('Transfer sync ownership lost while marking completion');
  }

  await client.query('DELETE FROM transfer_sync_items WHERE sync_id = $1::uuid', [syncId]);
}
