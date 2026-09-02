import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const attachDatabasePoolMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
const poolConnectMock = vi.hoisted(() =>
  vi.fn(async () => ({
    query: vi.fn(async () => ({ rows: [] })),
    release: releaseMock,
  }))
);
const poolConstructorMock = vi.hoisted(() =>
  vi.fn(function MockPool(this: { connect: typeof poolConnectMock; config: unknown }, config: unknown) {
    this.connect = poolConnectMock;
    this.config = config;
  })
);

vi.mock("@vercel/functions", () => ({
  attachDatabasePool: attachDatabasePoolMock,
}));

vi.mock("pg", () => ({
  Pool: poolConstructorMock,
}));

vi.mock("@/lib/db/ssl", () => ({
  resolvePgConnectionConfig: vi.fn((conn: string, ca?: string) => ({
    connectionString: conn.replace(/\?.*/, ""),
    ssl: ca ? { rejectUnauthorized: true, ca } : true,
  })),
}));

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn((pool: unknown, options: unknown) => ({
    pool,
    options,
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
  })),
}));

const globalState = globalThis as typeof globalThis & {
  pgPool?: unknown;
  coursesPgPool?: unknown;
  transfersPgPool?: unknown;
  transfersDrizzleDb?: unknown;
};

describe("Unified runtime database pool consolidation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    attachDatabasePoolMock.mockReset();
    poolConstructorMock.mockClear();
    poolConnectMock.mockClear();
    releaseMock.mockReset();

    process.env = { ...originalEnv };
    delete globalState.pgPool;
    delete globalState.coursesPgPool;
    delete globalState.transfersPgPool;
    delete globalState.transfersDrizzleDb;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    delete globalState.pgPool;
    delete globalState.coursesPgPool;
    delete globalState.transfersPgPool;
    delete globalState.transfersDrizzleDb;
  });

  describe("Unified mode (SNHU_TOOLS_DATABASE_MODE=unified)", () => {
    beforeEach(() => {
      process.env.SNHU_TOOLS_DATABASE_MODE = "unified";
      process.env.POSTGRES_URL = "postgresql://unified-user:pass@unified-host:5432/snhu_tools";
      delete process.env.COURSES_POSTGRES_URL;
      delete process.env.COURSES_POSTGRES_CA_CERT;
      delete process.env.TRANSFERS_POSTGRES_URL;
      delete process.env.TRANSFERS_POSTGRES_CA_CERT;
    });

    it("shares a single pg.Pool across Programs, Courses, and Transfers", async () => {
      const { getPool } = await import("@/lib/db/pool");
      const { getCoursesPool } = await import("@/features/courses/db/pool");
      const { getTransfersPool } = await import("@/features/transfers/db/pool");

      const programsPool = getPool();
      const coursesPool = getCoursesPool();
      const transfersPool = getTransfersPool();

      // All three getters return the EXACT same instance
      expect(programsPool).toBe(coursesPool);
      expect(programsPool).toBe(transfersPool);

      // Single constructor call and single Vercel pool attachment
      expect(poolConstructorMock).toHaveBeenCalledTimes(1);
      expect(attachDatabasePoolMock).toHaveBeenCalledTimes(1);
      expect(attachDatabasePoolMock).toHaveBeenCalledWith(programsPool);

      // Max connection limit is 1
      expect(poolConstructorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionString: "postgresql://unified-user:pass@unified-host:5432/snhu_tools",
          max: 1,
          idleTimeoutMillis: 5000,
          connectionTimeoutMillis: 5000,
        })
      );
    });

    it("does not require COURSES_POSTGRES_URL or TRANSFERS_POSTGRES_URL", async () => {
      const { getCoursesPool } = await import("@/features/courses/db/pool");
      const { getTransfersPool } = await import("@/features/transfers/db/pool");

      expect(() => getCoursesPool()).not.toThrow();
      expect(() => getTransfersPool()).not.toThrow();
    });

    it("initializes Transfers Drizzle against the shared pool without TRANSFERS_POSTGRES_URL", async () => {
      const { db } = await import("@/features/transfers/db");
      const { getPool } = await import("@/lib/db/pool");
      const { drizzle } = await import("drizzle-orm/node-postgres");

      const sharedPool = getPool();
      expect(db.select).toBeDefined();
      expect(drizzle).toHaveBeenCalledWith(sharedPool, expect.any(Object));
      expect(poolConstructorMock).toHaveBeenCalledTimes(1);
    });

    it("executes Courses withPoolClient using shared pool and releases client in finally", async () => {
      const { withPoolClient } = await import("@/features/courses/db/pool");

      const result = await withPoolClient(async (client) => {
        expect(client.query).toBeDefined();
        return "query-success";
      });

      expect(result).toBe("query-success");
      expect(poolConnectMock).toHaveBeenCalledTimes(1);
      expect(releaseMock).toHaveBeenCalledTimes(1);
    });

    it("releases client on error in withPoolClient", async () => {
      const { withPoolClient } = await import("@/features/courses/db/pool");

      await expect(
        withPoolClient(async () => {
          throw new Error("Simulated query failure");
        })
      ).rejects.toThrow("Simulated query failure");

      expect(poolConnectMock).toHaveBeenCalledTimes(1);
      expect(releaseMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Legacy mode (SNHU_TOOLS_DATABASE_MODE=legacy or unset)", () => {
    it("creates 3 separate pools when all three domains are accessed with individual URLs", async () => {
      process.env.SNHU_TOOLS_DATABASE_MODE = "legacy";
      process.env.POSTGRES_URL = "postgresql://prog-user:pass@host:5432/prog_db";
      process.env.COURSES_POSTGRES_URL = "postgresql://course-user:pass@host:5432/course_db";
      process.env.TRANSFERS_POSTGRES_URL = "postgresql://transfer-user:pass@host:5432/transfer_db";

      const { getPool } = await import("@/lib/db/pool");
      const { getCoursesPool } = await import("@/features/courses/db/pool");
      const { getTransfersPool } = await import("@/features/transfers/db/pool");

      const programsPool = getPool();
      const coursesPool = getCoursesPool();
      const transfersPool = getTransfersPool();

      expect(programsPool).not.toBe(coursesPool);
      expect(programsPool).not.toBe(transfersPool);
      expect(coursesPool).not.toBe(transfersPool);

      expect(poolConstructorMock).toHaveBeenCalledTimes(3);
      expect(attachDatabasePoolMock).toHaveBeenCalledTimes(3);
    });

    it("throws when COURSES_POSTGRES_URL is missing in legacy mode even if POSTGRES_URL is present", async () => {
      process.env.SNHU_TOOLS_DATABASE_MODE = "legacy";
      process.env.POSTGRES_URL = "postgresql://prog-user:pass@host:5432/prog_db";
      delete process.env.COURSES_POSTGRES_URL;

      const { getCoursesPool } = await import("@/features/courses/db/pool");
      expect(() => getCoursesPool()).toThrow("COURSES_POSTGRES_URL is required");
    });

    it("throws when TRANSFERS_POSTGRES_URL is missing in legacy mode even if POSTGRES_URL is present", async () => {
      delete process.env.SNHU_TOOLS_DATABASE_MODE; // unset = legacy
      process.env.POSTGRES_URL = "postgresql://prog-user:pass@host:5432/prog_db";
      delete process.env.TRANSFERS_POSTGRES_URL;

      const { getTransfersPool } = await import("@/features/transfers/db/pool");
      expect(() => getTransfersPool()).toThrow("TRANSFERS_POSTGRES_URL is required");
    });
  });

  describe("Invalid mode safety", () => {
    it("fails fail-fast when SNHU_TOOLS_DATABASE_MODE has an invalid value", async () => {
      process.env.SNHU_TOOLS_DATABASE_MODE = "unfied";
      process.env.POSTGRES_URL = "postgresql://unified-user:pass@host:5432/db";

      const { getCoursesPool } = await import("@/features/courses/db/pool");
      expect(() => getCoursesPool()).toThrow('Invalid SNHU_TOOLS_DATABASE_MODE: "unfied"');

      const { getTransfersPool } = await import("@/features/transfers/db/pool");
      expect(() => getTransfersPool()).toThrow('Invalid SNHU_TOOLS_DATABASE_MODE: "unfied"');
    });
  });

  describe("Build safety without credentials", () => {
    it("can import all database pool and ORM modules without any environment variables", async () => {
      delete process.env.POSTGRES_URL;
      delete process.env.COURSES_POSTGRES_URL;
      delete process.env.TRANSFERS_POSTGRES_URL;
      delete process.env.SNHU_TOOLS_DATABASE_MODE;

      const poolMod = await import("@/lib/db/pool");
      const coursesPoolMod = await import("@/features/courses/db/pool");
      const transfersPoolMod = await import("@/features/transfers/db/pool");
      const transfersDbMod = await import("@/features/transfers/db");

      expect(poolMod.getPool).toBeDefined();
      expect(coursesPoolMod.getCoursesPool).toBeDefined();
      expect(transfersPoolMod.getTransfersPool).toBeDefined();
      expect(transfersDbMod.db).toBeDefined();
    });
  });
});
