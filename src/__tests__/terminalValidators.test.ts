import { describe, expect, it } from "vitest";
import { validateCatalogSyncResult } from "../../scripts/validators/validate-catalog-sync-result.mjs";
import { validateTransferSyncResult } from "../../scripts/validators/validate-transfer-sync-result.mjs";

describe("terminal sync result validators", () => {
  for (const validate of [validateCatalogSyncResult, validateTransferSyncResult]) {
    it("accepts only completed promoted or skipped results", () => {
      expect(validate({ action: "promoted" })).toBeNull();
      expect(validate({ action: "skipped" })).toBeNull();
      expect(validate({ action: "batch" })).toBeTruthy();
      expect(validate({ action: "error" })).toBeTruthy();
      expect(validate(null)).toBeTruthy();
    });
  }
});
