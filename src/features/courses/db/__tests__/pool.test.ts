import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const attachDatabasePoolMock = vi.hoisted(() => vi.fn());
const poolConnectMock = vi.hoisted(() => vi.fn());
const poolConstructorMock = vi.hoisted(() =>
  vi.fn(function MockPool(this: { connect: typeof poolConnectMock; config: unknown }, config: unknown) {
    this.connect = poolConnectMock;
    this.config = config;
  }),
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

const globalForCoursesPg = globalThis as typeof globalThis & {
  coursesPgPool?: unknown;
  pgPool?: unknown;
};

describe("Courses database pool bridge", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    attachDatabasePoolMock.mockReset();
    poolConstructorMock.mockClear();
    poolConnectMock.mockReset();
    process.env = { ...originalEnv };
    delete globalForCoursesPg.coursesPgPool;
    delete globalForCoursesPg.pgPool;
  });

  afterEach(() => {
    process.env = originalEnv;
    delete globalForCoursesPg.coursesPgPool;
    delete globalForCoursesPg.pgPool;
  });

  it("throws explicitly when COURSES_POSTGRES_URL is missing without falling back to POSTGRES_URL", async () => {
    delete process.env.COURSES_POSTGRES_URL;
    process.env.POSTGRES_URL = "postgres://wrong-user:wrong-pass@wrong-host:5432/wrong_db";

    const { getCoursesPool } = await import("../pool");
    expect(() => getCoursesPool()).toThrow("COURSES_POSTGRES_URL is required");
    expect(poolConstructorMock).not.toHaveBeenCalled();
  });

  it("configures pool with max 1 and attaches to Vercel", async () => {
    process.env.COURSES_POSTGRES_URL = "postgres://courses-user:pass@courses-host:5432/courses_db?sslmode=require";

    const { getCoursesPool, COURSES_RUNTIME_POOL_MAX } = await import("../pool");
    expect(COURSES_RUNTIME_POOL_MAX).toBe(1);

    const pool = getCoursesPool();
    expect(pool).toBeDefined();
    expect(poolConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: "postgres://courses-user:pass@courses-host:5432/courses_db",
        max: 1,
        idleTimeoutMillis: 5000,
        connectionTimeoutMillis: 5000,
        ssl: true,
      }),
    );
    expect(attachDatabasePoolMock).toHaveBeenCalledWith(pool);
  });

  it("keeps coursesPgPool global isolated from Degree Map pgPool", async () => {
    process.env.COURSES_POSTGRES_URL = "postgres://courses-user:pass@courses-host:5432/courses_db";

    const { getCoursesPool } = await import("../pool");
    const coursesPool = getCoursesPool();

    expect(globalForCoursesPg.coursesPgPool).toBe(coursesPool);
    expect(globalForCoursesPg.pgPool).toBeUndefined();
  });
});
