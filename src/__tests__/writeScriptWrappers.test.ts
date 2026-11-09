import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const domain = vi.hoisted(() => ({
  program: vi.fn(),
  catalog: vi.fn(),
  transfer: vi.fn(),
  bootstrap: vi.fn(),
}));
vi.mock("@/lib/program-sync", () => ({ runProgramSync: domain.program }));
vi.mock("@/features/courses/sync", () => ({ runCatalogSyncToCompletion: domain.catalog }));
vi.mock("@/features/transfers/sync", () => ({
  runTransferSyncToCompletion: domain.transfer,
  bootstrapTransfer: domain.bootstrap,
}));
import { main as programMain, parseSyncArgs } from "../../scripts/program-sync";
import { main as catalogMain } from "../../scripts/catalog-sync";
import { main as transferMain } from "../../scripts/transfer-sync";
import { main as bootstrapMain } from "../../scripts/transfer-bootstrap";

const env = { ...process.env };
beforeEach(() => {
  vi.clearAllMocks();
  process.env.POSTGRES_URL = "test";
  process.exitCode = undefined;
  domain.program.mockResolvedValue({ action: "promoted" });
  domain.catalog.mockResolvedValue({ action: "promoted" });
  domain.transfer.mockResolvedValue({ action: "promoted" });
  domain.bootstrap.mockResolvedValue({ imported: 1, expected: 1 });
});
afterEach(() => {
  process.env = { ...env };
  process.exitCode = undefined;
});

describe("write script wrappers", () => {
  it("forwards program sync options and rejects malformed flags", async () => {
    await programMain([]);
    await programMain(["--ignore-lease"]);
    await programMain(["--allow-large-shrink"]);
    await programMain(["--catalog", "abc"]);
    await programMain(["--ignore-lease", "--allow-large-shrink", "--catalog", "abc"]);
    expect(domain.program.mock.calls).toEqual([
      [{}],
      [{ ignoreLease: true }],
      [{ allowLargeShrink: true }],
      [{ catalogId: "abc" }],
      [{ ignoreLease: true, allowLargeShrink: true, catalogId: "abc" }],
    ]);
    await expect(programMain(["--unknown"])).rejects.toThrow("Unsupported");
    await expect(programMain(["--catalog"])).rejects.toThrow("requires a catalog ID");
    await expect(programMain(["--catalog", "--ignore-lease"])).rejects.toThrow("requires a catalog ID");
    expect(parseSyncArgs(["--catalog", "abc"])).toEqual({ catalogId: "abc" });
    domain.program.mockResolvedValueOnce({ action: "error" });
    await programMain([]);
    expect(process.exitCode).toBe(1);
  });

  it("forwards catalog lease flags and maps terminal errors to nonzero", async () => {
    await catalogMain([]);
    await catalogMain(["--ignore-lease"]);
    domain.catalog.mockResolvedValueOnce({ action: "error" });
    await catalogMain([]);
    expect(domain.catalog.mock.calls).toEqual([
      [{ ignoreLease: false }],
      [{ ignoreLease: true }],
      [{ ignoreLease: false }],
    ]);
    expect(process.exitCode).toBe(1);
    await expect(catalogMain(["--bad"])).rejects.toThrow("Unsupported");
  });

  it("forwards transfer flags and rejects unknown flags without running", async () => {
    await transferMain(["--ignore-lease", "--allow-large-shrink"]);
    expect(domain.transfer).toHaveBeenCalledWith({ ignoreLease: true, allowLargeShrink: true });
    await transferMain(["--bad"]);
    expect(process.exitCode).toBe(1);
    expect(domain.transfer).toHaveBeenCalledTimes(1);
  });

  it("forwards transfer bootstrap shrink flag and rejects unknown flags", async () => {
    await bootstrapMain(["--allow-large-shrink"]);
    expect(domain.bootstrap).toHaveBeenCalledWith({ allowLargeShrink: true });
    await expect(bootstrapMain(["--bad"])).rejects.toThrow("Unsupported");
    expect(domain.bootstrap).toHaveBeenCalledOnce();
  });
});
