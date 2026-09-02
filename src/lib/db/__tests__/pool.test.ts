import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const attachDatabasePoolMock = vi.hoisted(() => vi.fn());
const poolConnectMock = vi.hoisted(() => vi.fn());
const poolConstructorMock = vi.hoisted(() =>
  vi.fn(function MockPool(this: { connect: typeof poolConnectMock }) {
    this.connect = poolConnectMock;
  })
);

vi.mock("@vercel/functions", () => ({
  attachDatabasePool: attachDatabasePoolMock,
}));

vi.mock("pg", () => ({
  Pool: poolConstructorMock,
}));

vi.mock("../ssl", () => ({
  resolvePgConnectionConfig: vi.fn(() => ({
    connectionString: "postgresql://user:pass@host:5432/db",
    ssl: { rejectUnauthorized: true, ca: "test-ca" },
  })),
}));

describe("db pool", () => {
  const originalPostgresUrl = process.env.POSTGRES_URL;

  beforeEach(() => {
    vi.resetModules();
    attachDatabasePoolMock.mockReset();
    poolConstructorMock.mockClear();
    poolConnectMock.mockReset();
    process.env.POSTGRES_URL = "postgresql://user:pass@host:5432/db?sslmode=require";
    delete (globalThis as { pgPool?: unknown }).pgPool;
  });

  afterEach(() => {
    if (originalPostgresUrl === undefined) {
      delete process.env.POSTGRES_URL;
    } else {
      process.env.POSTGRES_URL = originalPostgresUrl;
    }
    delete (globalThis as { pgPool?: unknown }).pgPool;
  });

  it("creates a single global pool with conservative options", async () => {
    const { getPool, POOL_OPTIONS, RUNTIME_POOL_MAX, RUNTIME_POOL_CONNECTION_TIMEOUT_MS } =
      await import("../pool");

    const first = getPool();
    const second = getPool();

    expect(first).toBe(second);
    expect(poolConstructorMock).toHaveBeenCalledTimes(1);
    expect(poolConstructorMock).toHaveBeenCalledWith({
      connectionString: "postgresql://user:pass@host:5432/db",
      ssl: { rejectUnauthorized: true, ca: "test-ca" },
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 15_000,
    });
    expect(POOL_OPTIONS).toEqual({
      max: 1,
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 15_000,
    });
    expect(RUNTIME_POOL_MAX).toBe(1);
    expect(RUNTIME_POOL_CONNECTION_TIMEOUT_MS).toBe(15_000);
  });

  it("attaches the pool to the Vercel lifecycle helper exactly once", async () => {
    const { getPool } = await import("../pool");

    const pool = getPool();
    getPool();

    expect(attachDatabasePoolMock).toHaveBeenCalledTimes(1);
    expect(attachDatabasePoolMock).toHaveBeenCalledWith(pool);
  });
});
