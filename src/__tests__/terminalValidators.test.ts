import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  validateCatalogSyncResult,
  validateProgramSyncResult,
  validateTransferSyncResult,
} from "../../scripts/validate-sync-result.mjs";

const programResult = (action: string) => ({ action, status: "idle", importedCount: 1, skippedCount: 0, failedCount: 0 });

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

describe("Program terminal sync result validator", () => {
  it("accepts only structurally valid promoted or skipped results", () => {
    expect(validateProgramSyncResult(programResult("promoted"))).toBeNull();
    expect(validateProgramSyncResult(programResult("skipped"))).toBeNull();
    expect(validateProgramSyncResult(programResult("batch"))).toBeTruthy();
    expect(validateProgramSyncResult(programResult("error"))).toBeTruthy();
    expect(validateProgramSyncResult({ action: "promoted" })).toBeTruthy();
    expect(validateProgramSyncResult({})).toBeTruthy();
    expect(validateProgramSyncResult(null)).toBeTruthy();
    expect(validateProgramSyncResult([])).toBeTruthy();
  });
});

describe("terminal validator CLI", () => {
  it("rejects missing files and malformed JSON result files across domains", () => {
    const directory = mkdtempSync(join(tmpdir(), "snhu-validator-"));
    const malformed = join(directory, "result.json");
    const validCatalog = join(directory, "valid-catalog.json");
    writeFileSync(malformed, "{");
    writeFileSync(validCatalog, JSON.stringify({ action: "promoted" }));
    try {
      const script = "scripts/validate-sync-result.mjs";
      expect(spawnSync(process.execPath, [script, join(directory, "missing.json")]).status).toBe(1);
      expect(spawnSync(process.execPath, [script, malformed]).status).toBe(1);
      expect(spawnSync(process.execPath, [script, "--domain=catalog", validCatalog]).status).toBe(0);
      expect(spawnSync(process.execPath, [script, "--domain=transfer", validCatalog]).status).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 15000);
});
