import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { validateCatalogSyncResult } from "../../scripts/validators/validate-catalog-sync-result.mjs";
import { validateTransferSyncResult } from "../../scripts/validators/validate-transfer-sync-result.mjs";

describe("terminal sync result validators", () => {
  for (const validate of [validateCatalogSyncResult, validateTransferSyncResult]) {
    it("accepts only completed promoted or skipped results", () => {
      expect(validate({ action: "promoted" })).toBeNull();
      expect(validate({ action: "skipped", reason: "not_due" })).toBeNull();
      expect(validate({ action: "skipped", reason: "lease_held" })).toBeNull();
      expect(validate({ action: "batch" })).toBeTruthy();
      expect(validate({ action: "error" })).toBeTruthy();
      expect(validate({})).toBeTruthy();
      expect(validate(null)).toBeTruthy();
      expect(validate([])).toBeTruthy();
    });
  }
});

describe("terminal validator CLIs", () => {
  it("rejects missing files and malformed JSON result files", () => {
    const directory = mkdtempSync(join(tmpdir(), "snhu-validator-"));
    const malformed = join(directory, "result.json");
    writeFileSync(malformed, "{");
    try {
      for (const script of [
        "scripts/validators/validate-catalog-sync-result.mjs",
        "scripts/validators/validate-transfer-sync-result.mjs",
      ]) {
        expect(spawnSync(process.execPath, [script, join(directory, "missing.json")]).status).toBe(1);
        expect(spawnSync(process.execPath, [script, malformed]).status).toBe(1);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
