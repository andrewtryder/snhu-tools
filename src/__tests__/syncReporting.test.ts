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
    honeybadger.configure.mockReset();
    honeybadger.notifyAsync.mockReset();
  });

  it("logs but does not notify without a server Honeybadger key", async () => {
    await expect(reportSyncError(new Error("failed"), { component: "catalog-sync" })).resolves.toBeUndefined();
    expect(honeybadger.notifyAsync).not.toHaveBeenCalled();
  });

  it("notifies with sanitized writer context and never exposes database values", async () => {
    process.env.HONEYBADGER_API_KEY = "test-key";
    await reportSyncError(new Error("failed"), {
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
  });

  it("swallows notifier failures", async () => {
    process.env.HONEYBADGER_API_KEY = "test-key";
    honeybadger.notifyAsync.mockRejectedValueOnce(new Error("offline"));
    await expect(reportSyncError(new Error("failed"), { component: "catalog-sync" })).resolves.toBeUndefined();
  });
});
