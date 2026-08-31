import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const attachDatabasePoolMock = vi.fn();
const poolConstructorMock = vi.fn(function MockPool(this: { connect: unknown }) {
  this.connect = vi.fn();
});

vi.mock("@vercel/functions", () => ({
  attachDatabasePool: attachDatabasePoolMock,
}));

vi.mock("pg", () => ({
  Pool: poolConstructorMock,
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn((pool, options) => ({
    pool,
    options,
    select: vi.fn(),
    execute: vi.fn(),
  })),
}));

describe("Transfers database pool and lazy Drizzle client", () => {
  const originalEnv = process.env;

  const globalForTransfers = globalThis as typeof globalThis & {
    transfersPgPool?: unknown;
    transfersDrizzleDb?: unknown;
    pgPool?: unknown;
    coursesPgPool?: unknown;
  };

  beforeEach(() => {
    vi.resetModules();
    attachDatabasePoolMock.mockReset();
    poolConstructorMock.mockClear();
    process.env = { ...originalEnv };
    delete globalForTransfers.transfersPgPool;
    delete globalForTransfers.transfersDrizzleDb;
    delete globalForTransfers.pgPool;
    delete globalForTransfers.coursesPgPool;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("does not throw on import when TRANSFERS_POSTGRES_URL is unset (lazy proxy)", async () => {
    delete process.env.TRANSFERS_POSTGRES_URL;

    const { db } = await import("@/features/transfers/db");
    expect(db).toBeDefined();
  });

  it("throws fail-fast error when accessing db methods and TRANSFERS_POSTGRES_URL is missing", async () => {
    delete process.env.TRANSFERS_POSTGRES_URL;
    process.env.POSTGRES_URL = "postgres://wrong-user:wrong-pass@wrong-host:5432/programs_db";
    process.env.COURSES_POSTGRES_URL = "postgres://wrong-user:wrong-pass@wrong-host:5432/courses_db";

    const { db } = await import("@/features/transfers/db");
    expect(() => {
      void db.select;
    }).toThrow("TRANSFERS_POSTGRES_URL is required");
  });

  it("throws explicitly when getTransfersPool() is called without TRANSFERS_POSTGRES_URL", async () => {
    delete process.env.TRANSFERS_POSTGRES_URL;
    process.env.POSTGRES_URL = "postgres://wrong:5432/db";

    const { getTransfersPool } = await import("@/features/transfers/db/pool");
    expect(() => getTransfersPool()).toThrow("TRANSFERS_POSTGRES_URL is required");
    expect(poolConstructorMock).not.toHaveBeenCalled();
  });

  it("configures pool with max 1 and isolated global key", async () => {
    process.env.TRANSFERS_POSTGRES_URL =
      "postgres://transfers-user:secret@transfers-host:5432/transfers_db?sslmode=require";

    const { getTransfersPool, TRANSFERS_RUNTIME_POOL_MAX } = await import(
      "@/features/transfers/db/pool"
    );
    expect(TRANSFERS_RUNTIME_POOL_MAX).toBe(1);

    const pool = getTransfersPool();
    expect(pool).toBeDefined();
    expect(poolConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: "postgresql://transfers-user:secret@transfers-host:5432/transfers_db",
        max: 1,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 5000,
        ssl: true,
      }),
    );
    expect(attachDatabasePoolMock).toHaveBeenCalledWith(pool);
    expect(globalForTransfers.transfersPgPool).toBe(pool);
    expect(globalForTransfers.pgPool).toBeUndefined();
    expect(globalForTransfers.coursesPgPool).toBeUndefined();
  });

  it("supports explicit TRANSFERS_POSTGRES_CA_CERT", async () => {
    process.env.TRANSFERS_POSTGRES_URL =
      "postgres://transfers-user:secret@transfers-host:5432/transfers_db";
    process.env.TRANSFERS_POSTGRES_CA_CERT =
      "-----BEGIN CERTIFICATE-----\nTRANSFERS_TEST_CERT\n-----END CERTIFICATE-----";

    const { getTransfersPool } = await import("@/features/transfers/db/pool");
    const pool = getTransfersPool();
    expect(pool).toBeDefined();
    expect(poolConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        ssl: {
          ca: "-----BEGIN CERTIFICATE-----\nTRANSFERS_TEST_CERT\n-----END CERTIFICATE-----",
          rejectUnauthorized: true,
        },
      }),
    );
  });
});
