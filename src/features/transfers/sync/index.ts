import type { Client } from 'pg';
import { createPgClient } from '@/lib/db/client';
import { reportSyncError } from '@/lib/syncReporting';
import { fetchExperienceDetail, fetchExperiences } from './fetch';
import { parseExperienceDetail, type ParsedTransferCourse } from './parse';
import {
  abortToIdle,
  advanceCursor,
  getSyncItems,
  getSyncState,
  insertStagedTransfer,
  setSyncError,
  startRefresh,
  tryClaimLease,
  type TransferSyncState,
} from './persist';
import { promoteStaging } from './promote';

export const CRON_BATCH_SIZE = 20;
export const CRON_CONCURRENCY = 5;
export const BOOTSTRAP_CONCURRENCY = 8;

export type TransferSyncResult =
  | { action: 'skipped'; reason: string; state: TransferSyncState }
  | {
      action: 'batch';
      processed: number;
      imported: number;
      cursor: number;
      expected: number;
      done: false;
    }
  | {
      action: 'promoted';
      processed: number;
      imported: number;
      expected: number;
      done: true;
    }
  | { action: 'error'; error: string };

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function fetchAndParsePids(
  pids: string[],
  concurrency: number
): Promise<ParsedTransferCourse[]> {
  const nested = await mapWithConcurrency(pids, concurrency, async (pid) => {
    const detail = await fetchExperienceDetail(pid);
    if (!detail) {
      throw new Error(`Failed to fetch experience detail for PID: ${pid}`);
    }
    // Successful detail with zero course mappings is valid → [].
    return parseExperienceDetail(detail);
  });
  return nested.flat();
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.POSTGRES_URL;
  if (!connectionString) {
    throw new Error('POSTGRES_URL is required');
  }

  const client = createPgClient(connectionString);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function processSnapshotBatch(
  client: Client,
  state: TransferSyncState,
  batchSize: number,
  concurrency: number,
  options: { allowLargeShrink?: boolean } = {}
): Promise<TransferSyncResult> {
  if (!state.sync_id) {
    const message =
      'Running transfer sync is missing sync_id; aborting incompatible mid-flight state. Re-run after migrate.';
    await abortToIdle(client, message);
    return { action: 'error', error: message };
  }

  const expected = state.expected_count ?? 0;
  const cursor = state.cursor;
  const promoteOptions = { allowLargeShrink: options.allowLargeShrink };
  const syncId = state.sync_id;

  if (cursor >= expected) {
    await promoteStaging(client, syncId, promoteOptions);
    return {
      action: 'promoted',
      processed: 0,
      imported: state.imported_count,
      expected,
      done: true,
    };
  }

  const items = await getSyncItems(client, state.sync_id, cursor, batchSize);
  if (items.length === 0) {
    const message = `Snapshot corruption: no transfer_sync_items at cursor ${cursor} (expected ${expected})`;
    await abortToIdle(client, message);
    return { action: 'error', error: message };
  }

  const parsed = await fetchAndParsePids(
    items.map((item) => item.pid),
    concurrency
  );

  for (const row of parsed) {
    await insertStagedTransfer(client, row);
  }

  const lastOrdinal = items[items.length - 1].ordinal;
  const newCursor = lastOrdinal + 1;
  await advanceCursor(client, syncId, newCursor, parsed.length);
  const importedTotal = state.imported_count + parsed.length;

  if (newCursor >= expected) {
    await promoteStaging(client, syncId, promoteOptions);
    return {
      action: 'promoted',
      processed: items.length,
      imported: importedTotal,
      expected,
      done: true,
    };
  }

  return {
    action: 'batch',
    processed: items.length,
    imported: parsed.length,
    cursor: newCursor,
    expected,
    done: false,
  };
}

/**
 * Full local bootstrap: snapshot experience PIDs, fill staging from that list, promote.
 */
export async function bootstrapTransfer(
  options: {
    concurrency?: number;
    batchSize?: number;
    allowLargeShrink?: boolean;
  } = {}
): Promise<{ imported: number; expected: number }> {
  const concurrency = options.concurrency ?? BOOTSTRAP_CONCURRENCY;
  const batchSize = options.batchSize ?? CRON_BATCH_SIZE;
  const allowLargeShrink = options.allowLargeShrink ?? false;
  const batchOptions = { allowLargeShrink };

  return withClient(async (client) => {
    console.log('Fetching complete experience list...');
    const experiences = await fetchExperiences();
    const pids = experiences
      .map((exp) => exp.pid)
      .filter((pid): pid is string => Boolean(pid));

    console.log(`Found ${pids.length} experiences. Starting staging import...`);
    await startRefresh(client, pids);

    let state = await getSyncState(client);
    const expected = state.expected_count ?? pids.length;

    while (state.cursor < expected) {
      const result = await processSnapshotBatch(
        client,
        state,
        batchSize,
        concurrency,
        batchOptions
      );
      if (result.action === 'error') {
        throw new Error(result.error);
      }
      if (result.action === 'promoted') {
        console.log('Bootstrap complete');
        return {
          imported: result.imported,
          expected: result.expected,
        };
      }
      if (result.action !== 'batch') {
        throw new Error(`Unexpected sync action during bootstrap: ${result.action}`);
      }
      console.log(
        `Staged batch: ${result.imported} rows, cursor ${result.cursor}/${result.expected}`
      );
      state = await getSyncState(client);
      if (state.cursor < expected) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    state = await getSyncState(client);
    console.log(
      `Validating and promoting (${state.imported_count} staged rows from ${state.expected_count} experiences)...`
    );
    if (!state.sync_id) {
      throw new Error('Transfer sync ownership lost before bootstrap promotion');
    }
    await promoteStaging(client, state.sync_id, batchOptions);
    console.log('Bootstrap complete');

    return {
      imported: state.imported_count,
      expected: state.expected_count ?? expected,
    };
  });
}

/**
 * One cron/local sync tick:
 * - if running: process next batch from the persisted snapshot (and promote when finished)
 * - else if due: fetch Kuali once, snapshot PIDs, process first batch
 * - else: skip
 */
export async function runTransferSync(
  options: {
    batchSize?: number;
    concurrency?: number;
    ignoreLease?: boolean;
    allowLargeShrink?: boolean;
  } = {}
): Promise<TransferSyncResult> {
  const batchSize = options.batchSize ?? CRON_BATCH_SIZE;
  const concurrency = options.concurrency ?? CRON_CONCURRENCY;
  const ignoreLease = options.ignoreLease ?? false;
  const allowLargeShrink = options.allowLargeShrink ?? false;

  return withClient(async (client) => {
    let syncContext: TransferSyncState | null = null;

    try {
      let state = await getSyncState(client);
      syncContext = state;
      const now = new Date();
      const wasRunning = state.status === 'running';

      if (!wasRunning) {
        const due =
          state.next_due_at === null || state.next_due_at.getTime() <= now.getTime();
        if (!due) {
          return {
            action: 'skipped',
            reason: 'not_due',
            state,
          };
        }
      }

      const claimed = await tryClaimLease(client, { force: ignoreLease });
      if (!claimed) {
        return {
          action: 'skipped',
          reason: 'lease_held',
          state,
        };
      }

      if (!wasRunning) {
        console.log('Transfer refresh due; fetching experience list once...');
        const experiences = await fetchExperiences();
        const pids = experiences
          .map((exp) => exp.pid)
          .filter((pid): pid is string => Boolean(pid));
        await startRefresh(client, pids);
        state = await getSyncState(client);
        syncContext = state;
      } else {
        state = claimed;
        syncContext = state;
      }

      return await processSnapshotBatch(client, state, batchSize, concurrency, {
        allowLargeShrink,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await reportSyncError(error, { component: 'transfer-sync', state: syncContext });
      } catch {
        // Honeybadger failures must not escape into sync control flow.
      }
      try {
        await setSyncError(client, message);
      } catch {
        // ignore secondary failure
      }
      return { action: 'error', error: message };
    }
  });
}
