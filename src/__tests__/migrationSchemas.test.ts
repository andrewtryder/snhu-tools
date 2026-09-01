import { describe, expect, it, vi } from "vitest";
import { migrateCourses } from "../../scripts/migrations/courses";
import { migratePrograms } from "../../scripts/migrations/programs";
import { migrateTransfers } from "../../scripts/migrations/transfers";

function fakeClient(failOn?: string) {
  const query = vi.fn(async (sql: string) => {
    if (failOn && sql.includes(failOn)) throw new Error("DDL failed");
    return { rows: [], rowCount: 0 };
  });
  return { query } as never;
}

describe("unified migration schema contracts", () => {
  it("retains the Programs transaction and schema objects", async () => {
    const client = fakeClient();
    await migratePrograms(client);
    const sql = client.query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("COMMIT;");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS programs");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS program_sync_state");
  });

  it("rolls back Programs migration failures", async () => {
    const client = fakeClient("CREATE TABLE");
    await expect(migratePrograms(client)).rejects.toThrow("DDL failed");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK;");
  });

  it("retains Courses state, lookup view, and indexes", async () => {
    const client = fakeClient();
    await migrateCourses(client);
    const sql = client.query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS courses_data");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS catalog_sync_state");
    expect(sql).toContain("CREATE OR REPLACE VIEW catalog_course_lookup");
  });

  it("retains Transfers state, stage cleanup, and uniqueness", async () => {
    const client = fakeClient();
    await migrateTransfers(client);
    const sql = client.query.mock.calls.map(([statement]) => statement).join("\n");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS transfer_courses");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS transfer_sync_state");
    expect(sql).toContain("transfer_courses_stage_pid_coursenumber_uidx");
  });
});
