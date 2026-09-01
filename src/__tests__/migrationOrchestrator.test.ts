import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = { connect: vi.fn(), end: vi.fn() };
  return {
    client,
    createPgClient: vi.fn(() => client),
    migratePrograms: vi.fn(),
    migrateCourses: vi.fn(),
    migrateTransfers: vi.fn(),
  };
});

vi.mock("@/lib/db/client", () => ({ createPgClient: mocks.createPgClient }));
vi.mock("../../scripts/migrations/programs", () => ({ migratePrograms: mocks.migratePrograms }));
vi.mock("../../scripts/migrations/courses", () => ({ migrateCourses: mocks.migrateCourses }));
vi.mock("../../scripts/migrations/transfers", () => ({ migrateTransfers: mocks.migrateTransfers }));

import { runMigrations } from "../../scripts/migrate";

describe("unified migration orchestrator", () => {
  beforeEach(() => {
    mocks.createPgClient.mockClear();
    mocks.client.connect.mockClear();
    mocks.client.end.mockClear();
    mocks.migratePrograms.mockReset();
    mocks.migrateCourses.mockReset();
    mocks.migrateTransfers.mockReset();
  });

  it("uses one direct client and runs Programs, Courses, Transfers in order", async () => {
    await runMigrations("postgresql://example.test/db");

    expect(mocks.createPgClient).toHaveBeenCalledTimes(1);
    expect(mocks.client.connect).toHaveBeenCalledTimes(1);
    expect(mocks.migratePrograms).toHaveBeenCalledBefore(mocks.migrateCourses);
    expect(mocks.migrateCourses).toHaveBeenCalledBefore(mocks.migrateTransfers);
    expect(mocks.client.end).toHaveBeenCalledTimes(1);
  });

  it("stops on a failure and still disconnects", async () => {
    mocks.migratePrograms.mockRejectedValueOnce(new Error("program migration failed"));

    await expect(runMigrations("postgresql://example.test/db")).rejects.toThrow("program migration failed");
    expect(mocks.migrateCourses).not.toHaveBeenCalled();
    expect(mocks.migrateTransfers).not.toHaveBeenCalled();
    expect(mocks.client.end).toHaveBeenCalledTimes(1);
  });

  it("does not run Transfers when Courses migration fails", async () => {
    mocks.migrateCourses.mockRejectedValueOnce(new Error("courses migration failed"));

    await expect(runMigrations("postgresql://example.test/db")).rejects.toThrow("courses migration failed");
    expect(mocks.migratePrograms).toHaveBeenCalledTimes(1);
    expect(mocks.migrateCourses).toHaveBeenCalledTimes(1);
    expect(mocks.migrateTransfers).not.toHaveBeenCalled();
    expect(mocks.client.end).toHaveBeenCalledTimes(1);
  });

  it("propagates Transfers failure after all migrations are reached", async () => {
    mocks.migrateTransfers.mockRejectedValueOnce(new Error("transfers migration failed"));

    await expect(runMigrations("postgresql://example.test/db")).rejects.toThrow("transfers migration failed");
    expect(mocks.migratePrograms).toHaveBeenCalledTimes(1);
    expect(mocks.migrateCourses).toHaveBeenCalledTimes(1);
    expect(mocks.migrateTransfers).toHaveBeenCalledTimes(1);
    expect(mocks.client.end).toHaveBeenCalledTimes(1);
  });
});
