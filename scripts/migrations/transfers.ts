import type { Client } from "pg";

/** Idempotent Transfers schema migration for the future authoritative write DB. */
export async function migrateTransfers(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS transfer_courses (id SERIAL PRIMARY KEY, subjectprefix VARCHAR(255), coursenumber VARCHAR(255), title TEXT, pid VARCHAR(255), eligibilitytimeframe TEXT, groupfilter2name VARCHAR(255), academiclevel VARCHAR(255), coursepid VARCHAR(255));
    CREATE TABLE IF NOT EXISTS transfer_courses_stage (id SERIAL PRIMARY KEY, subjectprefix VARCHAR(255), coursenumber VARCHAR(255) NOT NULL, title TEXT, pid VARCHAR(255) NOT NULL, eligibilitytimeframe TEXT, groupfilter2name VARCHAR(255), academiclevel VARCHAR(255), coursepid VARCHAR(255));
    DELETE FROM transfer_courses_stage WHERE pid IS NULL OR coursenumber IS NULL;
    DELETE FROM transfer_courses_stage a USING transfer_courses_stage b WHERE a.id > b.id AND a.pid = b.pid AND a.coursenumber = b.coursenumber;
    ALTER TABLE transfer_courses_stage ALTER COLUMN pid SET NOT NULL, ALTER COLUMN coursenumber SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS transfer_courses_stage_pid_coursenumber_uidx ON transfer_courses_stage (pid, coursenumber);
    CREATE TABLE IF NOT EXISTS transfer_sync_state (id TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'idle', cursor INTEGER NOT NULL DEFAULT 0, expected_count INTEGER, imported_count INTEGER NOT NULL DEFAULT 0, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, next_due_at TIMESTAMPTZ, lease_expires_at TIMESTAMPTZ, last_error TEXT, sync_id UUID, failed_experience_count INTEGER NOT NULL DEFAULT 0);
    ALTER TABLE transfer_sync_state ADD COLUMN IF NOT EXISTS sync_id UUID;
    ALTER TABLE transfer_sync_state ADD COLUMN IF NOT EXISTS failed_experience_count INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS transfer_sync_items (sync_id UUID NOT NULL, ordinal INTEGER NOT NULL, pid TEXT NOT NULL, PRIMARY KEY (sync_id, ordinal), UNIQUE (sync_id, pid));
    INSERT INTO transfer_sync_state (id, status, cursor, imported_count) VALUES ('transfer', 'idle', 0, 0) ON CONFLICT (id) DO NOTHING;
    CREATE INDEX IF NOT EXISTS transfer_courses_subject_idx ON transfer_courses (subjectprefix);
    CREATE INDEX IF NOT EXISTS transfer_courses_course_number_idx ON transfer_courses (coursenumber);
    CREATE INDEX IF NOT EXISTS transfer_courses_organization_idx ON transfer_courses (groupfilter2name);
    CREATE INDEX IF NOT EXISTS transfer_courses_academic_level_idx ON transfer_courses (academiclevel);
    CREATE INDEX IF NOT EXISTS transfer_courses_subject_course_idx ON transfer_courses (subjectprefix, coursenumber);
  `);
}
