import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const attachDatabasePoolMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const poolConnectMock = vi.hoisted(() =>
  vi.fn(async () => ({
    query: vi.fn(async () => ({ rows: [] })),
    release: releaseMock,
  })),
);
const poolConstructorMock = vi.hoisted(() =>
  vi.fn(function MockPool(this: { connect: typeof poolConnectMock; config: unknown }, config: unknown) {
    this.connect = poolConnectMock;
    this.config = config;
  }),
);

vi.mock("@vercel/functions", () => ({ attachDatabasePool: attachDatabasePoolMock }));
vi.mock("pg", () => ({ Pool: poolConstructorMock }));
vi.mock("@/lib/db/ssl", () => ({
  resolvePgConnectionConfig: vi.fn((connectionString: string) => ({
    connectionString: connectionString.replace(/\?.*/, ""),
    ssl: true,
  })),
}));
vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn((pool: unknown, options: unknown) => ({
    pool,
    options,
    select: vi.fn(),
  })),
}));

const globalState = globalThis as typeof globalThis & {
  pgPool?: unknown;
  transfersDrizzleDb?: unknown;
};

describe("runtime database pool", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    attachDatabasePoolMock.mockReset();
    poolConstructorMock.mockClear();
    poolConnectMock.mockClear();
    releaseMock.mockReset();
    process.env = {
      ...originalEnv,
      POSTGRES_URL: "postgresql://user:pass@host:5432/snhu_tools",
    };
    delete globalState.pgPool;
    delete globalState.transfersDrizzleDb;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    delete globalState.pgPool;
    delete globalState.transfersDrizzleDb;
  });

  it("shares one pool across Programs, Courses, and Transfers", async () => {
    const { getPool } = await import("@/lib/db/pool");
    const { withPoolClient } = await import("@/features/courses/db/pool");
    const { db } = await import("@/features/transfers/db");
    const { drizzle } = await import("drizzle-orm/node-postgres");

    const pool = getPool();
    await withPoolClient(async () => undefined);
    expect(db.select).toBeDefined();

    expect(poolConstructorMock).toHaveBeenCalledTimes(1);
    expect(attachDatabasePoolMock).toHaveBeenCalledTimes(1);
    expect(attachDatabasePoolMock).toHaveBeenCalledWith(pool);
    expect(poolConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        max: 1,
        idleTimeoutMillis: 5_000,
        connectionTimeoutMillis: 15_000,
      }),
    );
    expect(drizzle).toHaveBeenCalledWith(pool, expect.objectContaining({ schema: expect.any(Object) }));
  });

  it("releases Courses clients after success and exceptions", async () => {
    const { withPoolClient } = await import("@/features/courses/db/pool");

    await expect(withPoolClient(async () => "success")).resolves.toBe("success");
    await expect(
      withPoolClient(async () => {
        throw new Error("query failure");
      }),
    ).rejects.toThrow("query failure");

    expect(poolConnectMock).toHaveBeenCalledTimes(2);
    expect(releaseMock).toHaveBeenCalledTimes(2);
  });

  it("keeps database module imports safe without credentials", async () => {
    delete process.env.POSTGRES_URL;

    await expect(import("@/lib/db/pool")).resolves.toBeDefined();
    await expect(import("@/features/courses/db/pool")).resolves.toBeDefined();
    await expect(import("@/features/transfers/db")).resolves.toBeDefined();
  });
});
