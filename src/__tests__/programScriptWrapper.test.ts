import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sync = vi.hoisted(() => vi.fn());
vi.mock("@/lib/program-sync", () => ({ runProgramSync: sync }));
import { main, parseSyncArgs } from "../../scripts/program-sync";

const env = { ...process.env };
beforeEach(() => { vi.clearAllMocks(); process.exitCode = undefined; sync.mockResolvedValue({ action: "promoted" }); });
afterEach(() => { process.env = { ...env }; process.exitCode = undefined; });

describe("Program sync script wrapper", () => {
  it("forwards valid options", async () => {
    await main([]); await main(["--ignore-lease"]); await main(["--allow-large-shrink"]); await main(["--catalog", "abc"]); await main(["--ignore-lease", "--allow-large-shrink", "--catalog", "abc"]);
    expect(sync.mock.calls).toEqual([{}, [{ ignoreLease: true }], [{ allowLargeShrink: true }], [{ catalogId: "abc" }], [{ ignoreLease: true, allowLargeShrink: true, catalogId: "abc" }]]);
  });
  it("rejects unknown or malformed flags before invoking synchronization", async () => {
    await expect(main(["--unknown"])).rejects.toThrow("Unsupported");
    await expect(main(["--catalog"])).rejects.toThrow("requires a catalog ID");
    await expect(main(["--catalog", "--ignore-lease"])).rejects.toThrow("requires a catalog ID");
    expect(sync).not.toHaveBeenCalled();
  });
  it("sets a nonzero exit code for terminal errors", async () => {
    sync.mockResolvedValueOnce({ action: "error" });
    await main([]);
    expect(process.exitCode).toBe(1);
  });
  it("exports argument parsing without executing the writer", () => {
    expect(parseSyncArgs(["--catalog", "abc"])).toEqual({ catalogId: "abc" });
    expect(sync).not.toHaveBeenCalled();
  });
});
