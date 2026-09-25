import { beforeEach, describe, expect, it, vi } from "vitest";

const honeybadger = vi.hoisted(() => ({
  configure: vi.fn(),
  notifyAsync: vi.fn(),
}));

vi.mock("@honeybadger-io/js", () => ({ default: honeybadger }));

import { reportSyncError } from "@/lib/syncReporting";

describe("sync error reporting", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.HONEYBADGER_API_KEY;
    delete process.env.HONEYBADGER_ENABLED;
    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    honeybadger.configure.mockReset();
    honeybadger.notifyAsync.mockReset();
  });

  it("logs but does not notify without a server Honeybadger key", async () => {
    process.env.HONEYBADGER_ENABLED = "true";
    process.env.VERCEL_ENV = "production";
    await expect(reportSyncError(new Error("failed"), { component: "catalog-sync" })).resolves.toBeUndefined();
    expect(honeybadger.notifyAsync).not.toHaveBeenCalled();
  });

  it("logs but does not notify when HONEYBADGER_ENABLED is missing", async () => {
    process.env.HONEYBADGER_API_KEY = "test-key";
    process.env.VERCEL_ENV = "production";
    await expect(reportSyncError(new Error("failed"), { component: "catalog-sync" })).resolves.toBeUndefined();
    expect(honeybadger.notifyAsync).not.toHaveBeenCalled();
  });

  it("logs but does not notify in preview even when enabled", async () => {
    process.env.HONEYBADGER_API_KEY = "test-key";
    process.env.HONEYBADGER_ENABLED = "true";
    process.env.VERCEL_ENV = "preview";
    await expect(reportSyncError(new Error("failed"), { component: "catalog-sync" })).resolves.toBeUndefined();
    expect(honeybadger.notifyAsync).not.toHaveBeenCalled();
  });

  it("does not notify Honeybadger quota/transport noise", async () => {
    process.env.HONEYBADGER_API_KEY = "test-key";
    process.env.HONEYBADGER_ENABLED = "true";
    process.env.VERCEL_ENV = "production";
    await expect(
      reportSyncError(
        new Error("Your account or project has exceeded the quota. Upgrade your plan to increase limits."),
        { component: "catalog-sync" },
      ),
    ).resolves.toBeUndefined();
    expect(honeybadger.notifyAsync).not.toHaveBeenCalled();
  });

  it("notifies with sanitized writer context and never exposes database values", async () => {
    process.env.HONEYBADGER_API_KEY = "test-key";
    process.env.HONEYBADGER_ENABLED = "true";
    process.env.VERCEL_ENV = "production";
    const rawError = new Error("connection failed for postgresql://user:p%40ss@example.invalid/db");
    await reportSyncError(rawError, {
      component: "transfer-sync",
      action: "transfer-sync",
      tags: ["cron", "transfer-sync"],
      POSTGRES_URL: "postgresql://secret@host/db",
    });

    expect(honeybadger.notifyAsync).toHaveBeenCalledTimes(1);
    expect(honeybadger.notifyAsync.mock.calls[0]?.[1]).toMatchObject({
      component: "transfer-sync",
      action: "transfer-sync",
      tags: ["cron", "transfer-sync"],
      POSTGRES_URL: "[REDACTED]",
    });
    const reported = honeybadger.notifyAsync.mock.calls[0]?.[0] as Error;
    expect(reported).not.toBe(rawError);
    expect(reported.name).toBe("Error");
    expect(reported.message).toContain("connection failed");
    expect(reported.message).not.toContain("user:p%40ss@");
    expect(reported.message).not.toContain("postgresql://");
  });

  it("swallows notifier failures", async () => {
    process.env.HONEYBADGER_API_KEY = "test-key";
    process.env.HONEYBADGER_ENABLED = "true";
    process.env.VERCEL_ENV = "production";
    honeybadger.notifyAsync.mockRejectedValueOnce(new Error("offline"));
    await expect(reportSyncError(new Error("failed"), { component: "catalog-sync" })).resolves.toBeUndefined();
  });
});
