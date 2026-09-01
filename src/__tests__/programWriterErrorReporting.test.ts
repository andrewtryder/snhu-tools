import { beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({ withConnection: vi.fn(), recordError: vi.fn() }));
const reporting = vi.hoisted(() => ({ report: vi.fn() }));
vi.mock("@/lib/program-sync/database", () => ({ withProgramSyncConnection: database.withConnection, recordProgramSyncError: database.recordError }));
vi.mock("@/lib/syncReporting", () => ({ reportSyncError: reporting.report }));
import { runProgramSync } from "@/lib/program-sync";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.KUALI_CATALOG_YEAR_LABEL = "test";
  database.withConnection.mockRejectedValue(new Error("writer failed"));
  database.recordError.mockResolvedValue(undefined);
  reporting.report.mockResolvedValue(undefined);
});

describe("Program writer error reporting", () => {
  it("reports a caught failure and preserves the terminal error result", async () => {
    await expect(runProgramSync({ catalogId: "catalog" })).resolves.toMatchObject({ action: "error" });
    expect(reporting.report).toHaveBeenCalledOnce();
    expect(reporting.report).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ component: "program-sync", action: "program-sync", tags: ["cron", "program-sync"] }));
  });

  it("swallows reporter rejection without changing the error result", async () => {
    reporting.report.mockRejectedValueOnce(new Error("reporter offline"));
    await expect(runProgramSync()).resolves.toMatchObject({ action: "error", error: "writer failed" });
    expect(database.recordError).toHaveBeenCalledOnce();
  });
});
